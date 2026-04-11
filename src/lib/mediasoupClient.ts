import { Device } from "mediasoup-client"
import type { Transport, Consumer } from "mediasoup-client/types"
import type { TransportCreatedMessage } from "../types"
import { exportKey } from "./crypto"

let device: Device | null = null
let sendTransport: Transport | null = null
let recvTransport: Transport | null = null
let e2eeWorker: Worker | null = null

// Store producers so we can pause/resume them
const producers: Map<string, any> = new Map()

export function initE2eeWorker(roomKey: CryptoKey) {
    e2eeWorker = new Worker("/e2eeWorker.js")
    exportKey(roomKey).then(rawKey => {
        e2eeWorker!.postMessage({ type: "set-key", rawKey }, [rawKey])
    })
    console.log("E2EE worker initialized")
}

// ─── Mute controls ────────────────────────────────────────────────────────
export function toggleMic(enabled: boolean) {
    const producer = producers.get("audio")
    if (!producer) return
    enabled ? producer.resume() : producer.pause()
}

export function toggleCamera(enabled: boolean) {
    const producer = producers.get("video")
    if (!producer) return
    enabled ? producer.resume() : producer.pause()
}

// ─── Transforms ───────────────────────────────────────────────────────────
function attachSenderTransform(sender: RTCRtpSender) {
    if (!e2eeWorker) return
    try {
        // @ts-ignore
        sender.transform = new RTCRtpScriptTransform(e2eeWorker, { operation: "encrypt" })
        console.log("✓ Encrypt transform attached")
    } catch (e) {
        console.warn("RTCRtpScriptTransform not supported:", e)
    }
}

function attachReceiverTransform(receiver: RTCRtpReceiver) {
    if (!e2eeWorker) return
    try {
        // @ts-ignore
        receiver.transform = new RTCRtpScriptTransform(e2eeWorker, { operation: "decrypt" })
        console.log("✓ Decrypt transform attached")
    } catch (e) {
        console.warn("RTCRtpScriptTransform not supported:", e)
    }
}

// ─── waitFor ──────────────────────────────────────────────────────────────
type Resolver = (msg: any) => void
const resolvers: Map<string, Resolver[]> = new Map()

export function resolveMessage(type: string, msg: any) {
    const waiting = resolvers.get(type)
    if (waiting && waiting.length > 0) waiting.shift()!(msg)
}

export function waitFor(type: string): Promise<any> {
    return new Promise((resolve) => {
        const existing = resolvers.get(type) ?? []
        resolvers.set(type, [...existing, resolve])
    })
}

export function resetState() {
    device = null
    sendTransport = null
    recvTransport = null
    e2eeWorker = null
    producers.clear()
    resolvers.clear()
}

// ─── Device ───────────────────────────────────────────────────────────────
export async function initDevice(rtpCapabilities: any) {
    device = new Device()
    await device.load({ routerRtpCapabilities: rtpCapabilities })
}

// ─── Transports ───────────────────────────────────────────────────────────
export function setupTransport(
    message: TransportCreatedMessage,
    sendFn: (msg: any) => void,
    roomId: string
): Transport {
    if (!device) throw new Error("Device not initialized")

    const transport = message.direction === "send"
        ? device.createSendTransport({
            id: message.id,
            iceParameters: message.iceParameters,
            iceCandidates: message.iceCandidates,
            dtlsParameters: message.dtlsParameters,
            iceServers: message.iceServers,
        })
        : device.createRecvTransport({
            id: message.id,
            iceParameters: message.iceParameters,
            iceCandidates: message.iceCandidates,
            dtlsParameters: message.dtlsParameters,
            iceServers: message.iceServers,
        })

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

        // Intercept produce to store producer + attach transform
        const originalProduce = transport.produce.bind(transport)
        transport.produce = async (options: any) => {
            const producer = await originalProduce(options)
            // Store by kind ("audio" or "video") for mute controls
            producers.set(producer.track.kind, producer)
            const sender = (producer as any)._rtpSender
            if (sender) attachSenderTransform(sender)
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

    const receiver = (consumer as any)._rtpReceiver
    if (receiver) attachReceiverTransform(receiver)

    await consumer.resume()

    return consumer
}