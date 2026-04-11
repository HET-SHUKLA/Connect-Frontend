import { useEffect, useRef, useState } from "react"
import { connect, on, send } from "./lib/socket"
import {
    initDevice, setupTransport, produceStream,
    consumeProducer, waitFor, initE2eeWorker,
    toggleMic, toggleCamera
} from "./lib/mediasoupClient"
import {
    generateKeyPair, exportPublicKey,
    importPublicKey, deriveSharedKey,
    encryptRoomKey, decryptRoomKey
} from "./lib/keyExchange"
import { generateRoomKey } from "./lib/crypto"

const API = "http://192.168.31.130:8080/api"
const WS  = "ws://192.168.31.130:8080"

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

    // Self mute controls
    const [micOn, setMicOn] = useState(true)
    const [camOn, setCamOn] = useState(true)

    const pendingProducers = useRef<Array<{ producerId: string; peerId: string }>>([])
    const isReady = useRef(false)
    const currentRoomId = useRef("")
    const myPeerId = useRef("")
    const keyPair = useRef<CryptoKeyPair | null>(null)
    const roomKey = useRef<CryptoKey | null>(null)
    const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map())

    function addRemoteTrack(peerId: string, consumer: any) {
        if (peerId === myPeerId.current) return

        let stream = remoteStreamsRef.current.get(peerId)
        if (!stream) {
            stream = new MediaStream()
            remoteStreamsRef.current.set(peerId, stream)
        }

        stream.addTrack(consumer.track)

        setRemoteStreams(
            Array.from(remoteStreamsRef.current.entries())
                .map(([peerId, stream]) => ({ peerId, stream }))
        )
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
        if (peerId === myPeerId.current) return
        if (!isReady.current) {
            pendingProducers.current.push({ producerId, peerId })
            return
        }
        await sendRoomKeyToPeer(peerId)
        const consumer = await consumeProducer(producerId, currentRoomId.current, send)
        addRemoteTrack(peerId, consumer)
    }

    async function joinRoom(id: string) {
        currentRoomId.current = id
        setRoomId(id)
        setStatus("connecting...")

        keyPair.current = await generateKeyPair()
        await connect(WS)

        on("new-producer", (msg) => handleNewProducer(msg.producerId, msg.peerId))
        on("peer-left", (msg) => {
            remoteStreamsRef.current.delete(msg.peerId)
            setRemoteStreams(prev => prev.filter(s => s.peerId !== msg.peerId))
        })
        on("key-requested", async (msg) => {
            await sendRoomKeyToPeer(msg.peerId)
        })

        send({ type: "join-room", roomId: id })

        const joinedMsg = await waitFor("joined-room")
        myPeerId.current = joinedMsg.peerId

        const publicKeyBase64 = await exportPublicKey(keyPair.current.publicKey)
        await fetch(`${API}/keys/${myPeerId.current}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ publicKey: publicKeyBase64 })
        })

        setStatus("loading device...")
        const capMsg = await waitFor("router-rtp-capabilities")
        await initDevice(capMsg.rtpCapabilities)

        setStatus("creating transports...")
        send({ type: "create-transport", roomId: id, direction: "send" })
        const sendMsg = await waitFor("transport-created")
        setupTransport(sendMsg, send, id)

        send({ type: "create-transport", roomId: id, direction: "receive" })
        const recvMsg = await waitFor("transport-created")
        setupTransport(recvMsg, send, id)

        setStatus("exchanging keys...")
        if (pendingProducers.current.length === 0) {
            roomKey.current = await generateRoomKey()
        } else {
            send({ type: "request-key" })
            const keyMsg = await waitFor("key-exchange-received")
            const senderRes = await fetch(`${API}/keys/${keyMsg.fromPeerId}`)
            const { publicKey: senderBase64 } = await senderRes.json()
            const senderPub = await importPublicKey(senderBase64)
            const shared = await deriveSharedKey(keyPair.current.privateKey, senderPub)
            roomKey.current = await decryptRoomKey(shared, keyMsg.encryptedRoomKey)
        }

        initE2eeWorker(roomKey.current)
        setE2eeActive(true)

        setStatus("getting camera...")
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
        await produceStream(stream)

        isReady.current = true
        for (const { producerId, peerId } of pendingProducers.current) {
            if (peerId === myPeerId.current) continue
            await sendRoomKeyToPeer(peerId)
            const consumer = await consumeProducer(producerId, id, send)
            addRemoteTrack(peerId, consumer)
        }
        pendingProducers.current = []

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
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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

            {/* Self controls — only show when connected */}
            {connected && (
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button onClick={() => {
                        toggleMic(!micOn)
                        setMicOn(!micOn)
                    }}>
                        {micOn ? "🎤 Mute" : "🔇 Unmute"}
                    </button>
                    <button onClick={() => {
                        toggleCamera(!camOn)
                        setCamOn(!camOn)
                    }}>
                        {camOn ? "📷 Stop Camera" : "📷 Start Camera"}
                    </button>
                </div>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
                {/* Local video */}
                <div>
                    <video
                        ref={localVideoRef}
                        autoPlay muted playsInline
                        style={{ width: 300, height: 200, background: "#000", borderRadius: 8 }}
                    />
                    <p style={{ textAlign: "center", fontSize: 12, color: "#888" }}>
                        You {!micOn && "🔇"} {!camOn && "📷"}
                    </p>
                </div>

                {/* Remote peers */}
                {remoteStreams.map(({ peerId, stream }) => (
                    <RemoteVideo key={peerId} peerId={peerId} stream={stream} />
                ))}
            </div>
        </div>
    )
}

function RemoteVideo({ peerId, stream }: { peerId: string; stream: MediaStream }) {
    const ref = useRef<HTMLVideoElement>(null)
    const [audioOn, setAudioOn] = useState(true)
    const [videoOn, setVideoOn] = useState(true)

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
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 4 }}>
                <button onClick={() => {
                    stream.getAudioTracks().forEach(t => t.enabled = !audioOn)
                    setAudioOn(!audioOn)
                }}>
                    {audioOn ? "🔊" : "🔇"}
                </button>
                <button onClick={() => {
                    stream.getVideoTracks().forEach(t => t.enabled = !videoOn)
                    setVideoOn(!videoOn)
                }}>
                    {videoOn ? "📷" : "🚫"}
                </button>
            </div>
            <p style={{ textAlign: "center", fontSize: 12, color: "#888" }}>
                {peerId.slice(0, 8)}
            </p>
        </div>
    )
}