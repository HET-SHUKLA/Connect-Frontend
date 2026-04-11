import { useEffect, useRef, useState } from "react"
import { connect, on, send } from "./lib/socket"
import {
    initDevice, setupTransport, produceStream,
    consumeProducer, waitFor, getSendPC, getRecvPC
} from "./lib/mediasoupClient"
import {
    generateKeyPair, exportPublicKey,
    importPublicKey, deriveSharedKey,
    encryptRoomKey, decryptRoomKey
} from "./lib/keyExchange"
import { generateRoomKey, encryptPacket, decryptPacket } from "./lib/crypto"

const API = "http://localhost:8080/api"
const WS  = "ws://localhost:8080"

interface RemoteStream {
    peerId: string
    stream: MediaStream
}

export default function App() {
    const localVideoRef = useRef<HTMLVideoElement>(null)
    const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([])
    const [status, setStatus] = useState("idle")
    const [roomId, setRoomId] = useState("")
    const [inputRoomId, setInputRoomId] = useState("")
    const [e2eeActive, setE2eeActive] = useState(false)

    const pendingProducers = useRef<Array<{ producerId: string; peerId: string }>>([])
    const isReady = useRef(false)
    const currentRoomId = useRef("")
    const myPeerId = useRef("")
    const keyPair = useRef<CryptoKeyPair | null>(null)
    const roomKey = useRef<CryptoKey | null>(null)

    function addRemoteStream(peerId: string, consumer: any) {
        // Never add our own stream as remote
        if (peerId === myPeerId.current) return
        const stream = new MediaStream([consumer.track])
        setRemoteStreams(prev => {
            if (prev.find(s => s.peerId === peerId)) return prev
            return [...prev, { peerId, stream }]
        })
    }

    async function sendRoomKeyToPeer(targetPeerId: string) {
        if (!roomKey.current || !keyPair.current) return
        try {
            const res = await fetch(`${API}/keys/${targetPeerId}`)
            if (!res.ok) return
            const { publicKey: base64 } = await res.json()
            const theirKey = await importPublicKey(base64)
            const shared = await deriveSharedKey(keyPair.current.privateKey, theirKey)
            const encrypted = await encryptRoomKey(shared, roomKey.current)
            send({ type: "key-exchange", targetPeerId, encryptedRoomKey: encrypted })
        } catch (err) {
            console.error("sendRoomKeyToPeer failed:", err)
        }
    }

    async function handleNewProducer(producerId: string, peerId: string) {
        // Never consume our own producers
        if (peerId === myPeerId.current) return

        if (!isReady.current) {
            pendingProducers.current.push({ producerId, peerId })
            return
        }
        await sendRoomKeyToPeer(peerId)
        const consumer = await consumeProducer(producerId, currentRoomId.current, send)
        addRemoteStream(peerId, consumer)
    }

    async function attachEncryption(key: CryptoKey) {
        const pc = getSendPC()
        if (!pc) { console.warn("No send PC for encryption"); return }
        for (const sender of pc.getSenders()) {
            if (!sender.track) continue
            try {
                // @ts-ignore
                const { readable, writable } = sender.createEncodedStreams()
                const transform = new TransformStream({
                    transform: async (chunk: any, controller) => {
                        try { chunk.data = await encryptPacket(key, chunk.data) }
                        catch { /* pass through on error */ }
                        controller.enqueue(chunk)
                    }
                })
                readable.pipeThrough(transform).pipeTo(writable)
            } catch (e) { console.warn("Encrypt attach failed:", e) }
        }
    }

    async function attachDecryption(key: CryptoKey) {
        const pc = getRecvPC()
        if (!pc) { console.warn("No recv PC for decryption"); return }
        for (const receiver of pc.getReceivers()) {
            if (!receiver.track) continue
            try {
                // @ts-ignore
                const { readable, writable } = receiver.createEncodedStreams()
                const transform = new TransformStream({
                    transform: async (chunk: any, controller) => {
                        try { chunk.data = await decryptPacket(key, chunk.data) }
                        catch { /* pass through on error */ }
                        controller.enqueue(chunk)
                    }
                })
                readable.pipeThrough(transform).pipeTo(writable)
            } catch (e) { console.warn("Decrypt attach failed:", e) }
        }
    }

    async function joinRoom(id: string) {
        currentRoomId.current = id
        setRoomId(id)
        setStatus("connecting...")

        // Step 0: Generate ECDH key pair
        keyPair.current = await generateKeyPair()

        // Step 1: Connect WebSocket
        await connect(WS)

        // ── CRITICAL: Register ALL waitFor resolvers and persistent handlers
        // BEFORE sending join-room. Server responds immediately.
        // If we send first, messages arrive before resolvers exist → lost forever.

        // Persistent handlers (fire multiple times)
        on("new-producer", (msg) => handleNewProducer(msg.producerId, msg.peerId))
        on("peer-left", (msg) => {
            setRemoteStreams(prev => prev.filter(s => s.peerId !== msg.peerId))
        })
        on("key-requested", async (msg) => {
            await sendRoomKeyToPeer(msg.peerId)
        })

        // Step 2: Send join-room AFTER resolvers are ready
        send({ type: "join-room", roomId: id })

        // Step 3: Wait for our peerId
        const joinedMsg = await waitFor("joined-room")
        myPeerId.current = joinedMsg.peerId

        // Step 4: Register public key
        const publicKeyBase64 = await exportPublicKey(keyPair.current.publicKey)
        await fetch(`${API}/keys/${myPeerId.current}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ publicKey: publicKeyBase64 })
        })

        // Step 5: Load device
        setStatus("loading device...")
        const capMsg = await waitFor("router-rtp-capabilities")
        await initDevice(capMsg.rtpCapabilities)

        // Step 6: Create both transports sequentially
        setStatus("creating transports...")
        send({ type: "create-transport", roomId: id, direction: "send" })
        const sendMsg = await waitFor("transport-created")
        setupTransport(sendMsg, send, id)

        send({ type: "create-transport", roomId: id, direction: "receive" })
        const recvMsg = await waitFor("transport-created")
        setupTransport(recvMsg, send, id)

        // Step 7: Get or receive room key
        setStatus("exchanging keys...")
        if (pendingProducers.current.length === 0) {
            // First peer in room — generate key
            roomKey.current = await generateRoomKey()
            console.log("Generated room key (first peer)")
        } else {
            // Not first — request key from existing peers
            send({ type: "request-key" })
            const keyMsg = await waitFor("key-exchange-received")
            const senderRes = await fetch(`${API}/keys/${keyMsg.fromPeerId}`)
            const { publicKey: senderBase64 } = await senderRes.json()
            const senderPub = await importPublicKey(senderBase64)
            const shared = await deriveSharedKey(keyPair.current.privateKey, senderPub)
            roomKey.current = await decryptRoomKey(shared, keyMsg.encryptedRoomKey)
            console.log("Received and decrypted room key")
        }

        // Step 8: Get media and produce
        setStatus("getting camera...")
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
        await produceStream(stream)

        // Step 9: Attach encryption to outgoing streams
        await attachEncryption(roomKey.current)
        setE2eeActive(true)

        // Step 10: Flush pending producers
        isReady.current = true
        for (const { producerId, peerId } of pendingProducers.current) {
            if (peerId === myPeerId.current) continue
            await sendRoomKeyToPeer(peerId)
            const consumer = await consumeProducer(producerId, id, send)
            addRemoteStream(peerId, consumer)
        }
        pendingProducers.current = []

        // Step 11: Attach decryption to incoming streams
        await attachDecryption(roomKey.current)

        setStatus(`connected — ${id}`)
    }

    async function handleCreate() {
        try {
            const res = await fetch(`${API}/rooms`, { method: "POST" })
            const data = await res.json()
            setInputRoomId(data.roomId)
            await joinRoom(data.roomId)
        } catch (err: any) {
            setStatus("Error: " + err.message)
            console.error(err)
        }
    }

    async function handleJoin() {
        const id = inputRoomId.trim()
        if (!id) { alert("Enter a room ID"); return }
        try {
            const res = await fetch(`${API}/rooms/${id}`)
            if (!res.ok) { alert("Room not found"); return }
            await joinRoom(id)
        } catch (err: any) {
            setStatus("Error: " + err.message)
            console.error(err)
        }
    }

    const connected = status.startsWith("connected")

    return (
        <div style={{ maxWidth: 900, margin: "40px auto", padding: "0 20px", fontFamily: "sans-serif" }}>
            <h2>
                Connect{" "}
                {e2eeActive && (
                    <span style={{ color: "green", fontSize: 14, marginLeft: 8 }}>
                        🔒 E2EE Active
                    </span>
                )}
            </h2>

            {!connected && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button onClick={handleCreate}>Create Room</button>
                    <span>or</span>
                    <input
                        value={inputRoomId}
                        onChange={e => setInputRoomId(e.target.value)}
                        placeholder="Enter Room ID"
                        style={{ padding: "8px", width: 280 }}
                    />
                    <button onClick={handleJoin}>Join Room</button>
                </div>
            )}

            <p style={{ color: "#666" }}>Status: {status}</p>

            {roomId && (
                <p style={{ fontSize: 13, color: "#888" }}>
                    Room ID: <strong>{roomId}</strong>
                    <button
                        onClick={() => navigator.clipboard.writeText(roomId)}
                        style={{ marginLeft: 8, fontSize: 12 }}
                    >
                        Copy
                    </button>
                </p>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
                <div>
                    <video
                        ref={localVideoRef}
                        autoPlay muted playsInline
                        style={{ width: 300, height: 200, background: "#000", borderRadius: 8 }}
                    />
                    <p style={{ textAlign: "center", fontSize: 12, color: "#888" }}>You</p>
                </div>

                {remoteStreams.map(({ peerId, stream }) => (
                    <RemoteVideo key={peerId} peerId={peerId} stream={stream} />
                ))}
            </div>
        </div>
    )
}

function RemoteVideo({ peerId, stream }: { peerId: string; stream: MediaStream }) {
    const ref = useRef<HTMLVideoElement>(null)
    useEffect(() => {
        if (ref.current) ref.current.srcObject = stream
    }, [stream])
    return (
        <div>
            <video
                ref={ref}
                autoPlay playsInline
                style={{ width: 300, height: 200, background: "#000", borderRadius: 8 }}
            />
            <p style={{ textAlign: "center", fontSize: 12, color: "#888" }}>
                {peerId.slice(0, 8)}
            </p>
        </div>
    )
}