import { Device } from "mediasoup-client"
import type { Transport, Consumer } from "mediasoup-client/types"
import type { TransportCreatedMessage } from "../types"
import { encryptPacket, decryptPacket } from "./crypto"

let device: Device | null = null
let sendTransport: Transport | null = null
let recvTransport: Transport | null = null

// Room key injected from App.tsx after key exchange
let activeRoomKey: CryptoKey | null = null

export function setRoomKey(key: CryptoKey) {
    activeRoomKey = key
}

// ─── waitFor ──────────────────────────────────────────────────────────────
type Resolver = (msg: any) => void
const resolvers: Map<string, Resolver[]> = new Map()

export function resolveMessage(type: string, msg: any) {
    const waiting = resolvers.get(type)
    if (waiting && waiting.length > 0) {
        waiting.shift()!(msg)
    }
}

export function waitFor(type: string): Promise<any> {
    return new Promise((resolve) => {
        const existing = resolvers.get(type) ?? []
        resolvers.set(type, [...existing, resolve])
    })
}

// ─── Device ───────────────────────────────────────────────────────────────
export async function initDevice(rtpCapabilities: any) {
    device = new Device()
    await device.load({ routerRtpCapabilities: rtpCapabilities })
}

// ─── Insertable streams helpers ───────────────────────────────────────────
function attachSenderEncryption(sender: RTCRtpSender) {
    if (!activeRoomKey) return
    const key = activeRoomKey
    try {
        // @ts-ignore
        const { readable, writable } = sender.createEncodedStreams()
        const transform = new TransformStream({
            transform: async (chunk: any, controller) => {
                try { chunk.data = await encryptPacket(key, chunk.data) }
                catch { /* pass through */ }
                controller.enqueue(chunk)
            }
        })
        readable.pipeThrough(transform).pipeTo(writable)
        console.log("✓ Encryption attached to sender")
    } catch (e) {
        console.warn("Sender encryption failed:", e)
    }
}

function attachReceiverDecryption(receiver: RTCRtpReceiver) {
    if (!activeRoomKey) return
    const key = activeRoomKey
    try {
        // @ts-ignore
        const { readable, writable } = receiver.createEncodedStreams()
        const transform = new TransformStream({
            transform: async (chunk: any, controller) => {
                try { chunk.data = await decryptPacket(key, chunk.data) }
                catch { /* pass through */ }
                controller.enqueue(chunk)
            }
        })
        readable.pipeThrough(transform).pipeTo(writable)
        console.log("✓ Decryption attached to receiver")
    } catch (e) {
        console.warn("Receiver decryption failed:", e)
    }
}

// ─── Transports ───────────────────────────────────────────────────────────
export function setupTransport(
    message: TransportCreatedMessage,
    sendFn: (msg: any) => void,
    roomId: string
): Transport {
    if (!device) throw new Error("Device not initialized")

    // encodedInsertableStreams: true is the critical flag
    // Must be set at transport creation — cannot be changed later
    const transportOptions = {
        id: message.id,
        iceParameters: message.iceParameters,
        iceCandidates: message.iceCandidates,
        dtlsParameters: message.dtlsParameters,
        iceServers: message.iceServers,
        encodedInsertableStreams: true,
    }

    const transport = message.direction === "send"
        ? device.createSendTransport(transportOptions)
        : device.createRecvTransport(transportOptions)

    transport.on("connect", ({ dtlsParameters }, callback, errback) => {
        try {
            sendFn({ type: "connect-transport", transportId: transport.id, dtlsParameters })
            callback()
        } catch (err) { errback(err as Error) }
    })

    if (message.direction === "send") {
        transport.on("produce", ({ kind, rtpParameters }, callback, errback) => {
            try {
                sendFn({ type: "produce", roomId, kind, rtpParameters })
                waitFor("produce-created").then(msg => callback({ id: msg.producerId }))
            } catch (err) { errback(err as Error) }
        })

        // When a new sender is created, attach encryption immediately
        transport.on("producedata", () => {})
        const originalProduce = transport.produce.bind(transport)
        transport.produce = async (options: any) => {
            const producer = await originalProduce(options)
            // Access underlying RTCRtpSender
            const sender = (producer as any)._rtpSender
            if (sender) attachSenderEncryption(sender)
            return producer
        }

        sendTransport = transport
    } else {
        recvTransport = transport
    }

    return transport
}

// ─── Produce ──────────────────────────────────────────────────────────────
export async function produceStream(stream: MediaStream) {
    if (!sendTransport) throw new Error("No send transport")
    const videoTrack = stream.getVideoTracks()[0]
    const audioTrack = stream.getAudioTracks()[0]
    if (videoTrack) await sendTransport.produce({ track: videoTrack })
    if (audioTrack) await sendTransport.produce({ track: audioTrack })
}

// ─── Consume ──────────────────────────────────────────────────────────────
export async function consumeProducer(
    producerId: string,
    roomId: string,
    sendFn: (msg: any) => void
): Promise<Consumer> {
    if (!device || !recvTransport) throw new Error("Not ready to consume")

    sendFn({
        type: "consume",
        roomId,
        producerId,
        rtpCapabilities: device.rtpCapabilities,
    })

    const msg = await waitFor("consumer-created")

    const consumer = await recvTransport.consume({
        id: msg.consumerId,
        producerId: msg.producerId,
        kind: msg.kind,
        rtpParameters: msg.rtpParameters,
    })

    // Attach decryption immediately at consumer creation
    const receiver = (consumer as any)._rtpReceiver
    if (receiver) attachReceiverDecryption(receiver)

    return consumer
}