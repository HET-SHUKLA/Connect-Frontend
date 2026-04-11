import { useEffect, useRef, useState } from "react"
import { connect, on, send } from "./lib/socket"
import {
    initDevice,
    setupTransport,
    produceStream,
    consumeProducer,
    waitFor,
} from "./lib/mediasoupClient"

const API = "http://localhost:8080/api"
const WS  = "ws://localhost:8080"

// ─── Types ────────────────────────────────────────────────────────────────
interface RemoteStream {
    peerId: string
    stream: MediaStream
}

// ─── App ──────────────────────────────────────────────────────────────────
export default function App() {
    const localVideoRef = useRef<HTMLVideoElement>(null)
    const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([])
    const [status, setStatus] = useState("idle")
    const [roomId, setRoomId] = useState("")
    const [inputRoomId, setInputRoomId] = useState("")

    // Pending producers that arrived before recvTransport was ready
    const pendingProducers = useRef<Array<{ producerId: string; peerId: string }>>([])
    const isReady = useRef(false)
    const currentRoomId = useRef("")

    function addRemoteStream(peerId: string, consumer: any) {
        const stream = new MediaStream([consumer.track])
        setRemoteStreams(prev => {
            // Don't add duplicate
            if (prev.find(s => s.peerId === peerId)) return prev
            return [...prev, { peerId, stream }]
        })
    }

    async function handleNewProducer(producerId: string, peerId: string) {
        if (!isReady.current) {
            pendingProducers.current.push({ producerId, peerId })
            return
        }
        const consumer = await consumeProducer(producerId, currentRoomId.current, send)
        addRemoteStream(peerId, consumer)
    }

    async function joinRoom(id: string) {
        currentRoomId.current = id
        setRoomId(id)
        setStatus("connecting...")

        // 1. Connect WebSocket
        await connect(WS)

        // Register persistent event handlers
        on("new-producer", (msg) => handleNewProducer(msg.producerId, msg.peerId))
        on("peer-left", (msg) => {
            setRemoteStreams(prev => prev.filter(s => s.peerId !== msg.peerId))
        })

        // 2. Join room
        send({ type: "join-room", roomId: id })

        // 3. Wait for router capabilities → load device
        setStatus("loading device...")
        const capMsg = await waitFor("router-rtp-capabilities")
        await initDevice(capMsg.rtpCapabilities)

        // 4. Create send transport → wait for it
        setStatus("creating transports...")
        send({ type: "create-transport", roomId: id, direction: "send" })
        const sendMsg = await waitFor("transport-created")
        setupTransport(sendMsg, send, id)

        // 5. Create recv transport → wait for it
        send({ type: "create-transport", roomId: id, direction: "receive" })
        const recvMsg = await waitFor("transport-created")
        setupTransport(recvMsg, send, id)

        // 6. Get camera + mic → produce
        setStatus("getting camera...")
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
        await produceStream(stream)

        // 7. Flush producers that arrived before we were ready
        isReady.current = true
        for (const { producerId, peerId } of pendingProducers.current) {
            const consumer = await consumeProducer(producerId, id, send)
            addRemoteStream(peerId, consumer)
        }
        pendingProducers.current = []

        setStatus(`connected — ${id}`)
    }

    async function handleCreate() {
        try {
            const res = await fetch(`${API}/rooms`, { method: "POST" })
            const data = await res.json()
            await joinRoom(data.roomId)
        } catch (err: any) {
            setStatus("Error: " + err.message)
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
        }
    }

    const connected = status.startsWith("connected")

    return (
        <div style={{ maxWidth: 900, margin: "40px auto", padding: "0 20px", fontFamily: "sans-serif" }}>
            <h2>Connect</h2>

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
                        autoPlay
                        muted
                        playsInline
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

// ─── RemoteVideo ──────────────────────────────────────────────────────────
function RemoteVideo({ peerId, stream }: { peerId: string; stream: MediaStream }) {
    const ref = useRef<HTMLVideoElement>(null)

    useEffect(() => {
        if (ref.current) ref.current.srcObject = stream
    }, [stream])

    return (
        <div>
            <video
                ref={ref}
                autoPlay
                playsInline
                style={{ width: 300, height: 200, background: "#000", borderRadius: 8 }}
            />
            <p style={{ textAlign: "center", fontSize: 12, color: "#888" }}>
                {peerId.slice(0, 8)}
            </p>
        </div>
    )
}