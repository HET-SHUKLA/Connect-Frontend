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
import {
    generateRoomKey, encryptPacket, decryptPacket
} from "./lib/crypto"

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

    // E2EE state — stored in refs because they're crypto objects, not UI state
    const keyPair = useRef<CryptoKeyPair | null>(null)
    const roomKey = useRef<CryptoKey | null>(null)

    function addRemoteStream(peerId: string, consumer: any) {
        const stream = new MediaStream([consumer.track])
        setRemoteStreams(prev => {
            if (prev.find(s => s.peerId === peerId)) return prev
            return [...prev, { peerId, stream }]
        })
    }

    // ─── Attach encryption to all outgoing RTP streams ────────────────────
    async function attachEncryption(key: CryptoKey) {
        const pc = getSendPC()
        if (!pc) return

        for (const sender of pc.getSenders()) {
            if (!sender.track) continue
            try {
                // @ts-ignore — insertable streams not in TS types yet
                const { readable, writable } = sender.createEncodedStreams()
                const transform = new TransformStream({
                    transform: async (chunk: any, controller) => {
                        try {
                            chunk.data = await encryptPacket(key, chunk.data)
                            controller.enqueue(chunk)
                        } catch {
                            controller.enqueue(chunk) // on error pass through
                        }
                    }
                })
                readable.pipeThrough(transform).pipeTo(writable)
            } catch {
                console.warn("Insertable streams not supported on this sender")
            }
        }
    }

    // ─── Attach decryption to all incoming RTP streams ────────────────────
    async function attachDecryption(key: CryptoKey) {
        const pc = getRecvPC()
        if (!pc) return

        for (const receiver of pc.getReceivers()) {
            if (!receiver.track) continue
            try {
                // @ts-ignore
                const { readable, writable } = receiver.createEncodedStreams()
                const transform = new TransformStream({
                    transform: async (chunk: any, controller) => {
                        try {
                            chunk.data = await decryptPacket(key, chunk.data)
                            controller.enqueue(chunk)
                        } catch {
                            controller.enqueue(chunk) // on error pass through
                        }
                    }
                })
                readable.pipeThrough(transform).pipeTo(writable)
            } catch {
                console.warn("Insertable streams not supported on this receiver")
            }
        }
    }

    // ─── Send encrypted room key to a specific peer ───────────────────────
    async function sendRoomKeyToPeer(targetPeerId: string) {
        if (!roomKey.current || !keyPair.current) return
        try {
            const res = await fetch(`${API}/keys/${targetPeerId}`)
            if (!res.ok) return
            const { publicKey: publicKeyBase64 } = await res.json()
            const theirPublicKey = await importPublicKey(publicKeyBase64)
            const sharedKey = await deriveSharedKey(keyPair.current.privateKey, theirPublicKey)
            const encryptedKey = await encryptRoomKey(sharedKey, roomKey.current)
            send({ type: "key-exchange", targetPeerId, encryptedRoomKey: encryptedKey })
        } catch (err) {
            console.error("Failed to send room key to peer:", err)
        }
    }

    async function handleNewProducer(producerId: string, peerId: string) {
        if (!isReady.current) {
            pendingProducers.current.push({ producerId, peerId })
            return
        }
        // Send room key to new peer
        await sendRoomKeyToPeer(peerId)
        const consumer = await consumeProducer(producerId, currentRoomId.current, send)
        addRemoteStream(peerId, consumer)
    }

    async function joinRoom(id: string) {
        currentRoomId.current = id
        setRoomId(id)
        setStatus("connecting...")

        // ── Step 0: Generate ECDH key pair ────────────────────────────────
        keyPair.current = await generateKeyPair()

        // ── Step 1: Connect WebSocket ──────────────────────────────────────
        await connect(WS)

        // Register persistent handlers
        on("new-producer", (msg) => handleNewProducer(msg.producerId, msg.peerId))
        on("peer-left", (msg) => {
            setRemoteStreams(prev => prev.filter(s => s.peerId !== msg.peerId))
        })
        on("key-requested", async (msg) => {
            // An existing peer is asking for the room key
            await sendRoomKeyToPeer(msg.peerId)
        })

        // ── Step 2: Join room ──────────────────────────────────────────────
        send({ type: "join-room", roomId: id })

        // ── Step 3: Get our peerId ─────────────────────────────────────────
        const joinedMsg = await waitFor("joined-room")
        myPeerId.current = joinedMsg.peerId

        // ── Step 4: Register public key with server ────────────────────────
        const publicKeyBase64 = await exportPublicKey(keyPair.current.publicKey)
        await fetch(`${API}/keys/${myPeerId.current}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ publicKey: publicKeyBase64 })
        })

        // ── Step 5: Load mediasoup device ─────────────────────────────────
        setStatus("loading device...")
        const capMsg = await waitFor("router-rtp-capabilities")
        await initDevice(capMsg.rtpCapabilities)

        // ── Step 6: Create both transports ────────────────────────────────
        setStatus("creating transports...")
        send({ type: "create-transport", roomId: id, direction: "send" })
        const sendMsg = await waitFor("transport-created")
        setupTransport(sendMsg, send, id)

        send({ type: "create-transport", roomId: id, direction: "receive" })
        const recvMsg = await waitFor("transport-created")
        setupTransport(recvMsg, send, id)

        // ── Step 7: Get or receive room key ───────────────────────────────
        setStatus("exchanging keys...")

        if (pendingProducers.current.length === 0) {
            // First peer — generate room key
            roomKey.current = await generateRoomKey()
            console.log("Generated room key as first peer")
        } else {
            // Not first peer — request room key from existing peers
            send({ type: "request-key" })
            const keyMsg = await waitFor("key-exchange-received")

            // Derive shared secret with sender
            const senderKeyRes = await fetch(`${API}/keys/${keyMsg.fromPeerId}`)
            const { publicKey: senderKeyBase64 } = await senderKeyRes.json()
            const senderPublicKey = await importPublicKey(senderKeyBase64)
            const sharedKey = await deriveSharedKey(keyPair.current.privateKey, senderPublicKey)
            roomKey.current = await decryptRoomKey(sharedKey, keyMsg.encryptedRoomKey)
            console.log("Received and decrypted room key")
        }

        // ── Step 8: Get media and produce ─────────────────────────────────
        setStatus("getting camera...")
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
        await produceStream(stream)

        // ── Step 9: Attach encryption to outgoing streams ─────────────────
        await attachEncryption(roomKey.current)
        setE2eeActive(true)

        // ── Step 10: Flush pending producers ──────────────────────────────
        isReady.current = true
        for (const { producerId, peerId } of pendingProducers.current) {
            await sendRoomKeyToPeer(peerId)
            const consumer = await consumeProducer(producerId, id, send)
            addRemoteStream(peerId, consumer)
        }
        pendingProducers.current = []

        // ── Step 11: Attach decryption to incoming streams ────────────────
        await attachDecryption(roomKey.current)

        setStatus(`connected — ${id}`)
    }

    async function handleCreate() {
        try {
            const res = await fetch(`${API}/rooms`, { method: "POST" })
            const data = await res.json()
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
            <h2>Connect {e2eeActive && <span style={{ color: "green", fontSize: 14 }}>🔒 E2EE Active</span>}</h2>

            {!connected && (
                <div>
                    <button onClick={handleCreate}>Create Room</button>
                    <span style={{ margin: "0 10px" }}>or</span>
                    <input
                        value={inputRoomId}
                        onChange={e => setInputRoomId(e.target.value)}
                        placeholder="Enter Room ID"
                        style={{ padding: "8px", width: 280, marginRight: 8 }}
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