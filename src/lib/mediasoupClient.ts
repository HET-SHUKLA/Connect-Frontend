import { Device } from "mediasoup-client"
import type { Transport, Consumer, Producer, ProducerOptions, AppData } from "mediasoup-client/types"
import type { TransportCreatedMessage } from "../types"
import { exportKey } from "./crypto"

let device: Device | null = null
let sendTransport: Transport | null = null
let recvTransport: Transport | null = null
let e2eeWorker: Worker | null = null

// Store producers so we can pause/resume them for mute/camera toggles
const producers: Map<string, any> = new Map()

// ─── E2EE worker ──────────────────────────────────────────────────────────
export function initE2eeWorker(roomKey: CryptoKey) {
    e2eeWorker = new Worker("/e2eeWorker.js")
    exportKey(roomKey).then(rawKey => {
        e2eeWorker!.postMessage({ type: "set-key", rawKey }, [rawKey])
    })
    console.log("[E2EE] Worker initialized")
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
        console.log("[E2EE] ✓ Encrypt transform attached")
    } catch (e) {
        console.warn("[E2EE] RTCRtpScriptTransform not available:", e)
    }
}

function attachReceiverTransform(receiver: RTCRtpReceiver) {
    if (!e2eeWorker) return
    try {
        // @ts-ignore
        receiver.transform = new RTCRtpScriptTransform(e2eeWorker, { operation: "decrypt" })
        console.log("[E2EE] ✓ Decrypt transform attached")
    } catch (e) {
        console.warn("[E2EE] RTCRtpScriptTransform not available:", e)
    }
}

// ─── waitFor ──────────────────────────────────────────────────────────────
// Simple FIFO promise queue — no timeouts, no caching.
//
// Root cause of "stuck at Loading device…" on first click:
// The previous version added a 5-second timeout and a cachedRtpCapabilities
// fast-path. If the timeout fired before the message arrived, the resolver
// was removed and the promise rejected — but cachedRtpCapabilities was still
// set by resolveMessage() when the message eventually arrived. The second
// click then fast-pathed through the cache and appeared to "work". Removing
// the cache and the timeout eliminates this entirely. If the server never
// responds, the connection error or WS close will propagate instead.

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

// ─── Reset — MUST be called on leave ──────────────────────────────────────
// Clears all mediasoup state so the next session starts clean.
// Not calling this is the root cause of ghost-peer and double-handler bugs.
export function resetState() {
    device        = null
    sendTransport = null
    recvTransport = null
    e2eeWorker?.terminate()
    e2eeWorker    = null
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
            sendFn({
                type: "connect-transport",
                transportId: transport.id,
                dtlsParameters
            })

            callback();
        } catch (err) { errback(err as Error) }
    })

    if (message.direction === "send") {
        transport.on("produce", ({ kind, rtpParameters }, callback, errback) => {
            try {
                sendFn({ type: "produce", roomId, kind, rtpParameters })
                waitFor("produce-created").then(msg => callback({ id: msg.producerId }))
            } catch (err) { errback(err as Error) }
        })

        const originalProduce = transport.produce.bind(transport) as
            <ProducerAppData extends AppData = AppData>(
                options?: ProducerOptions<ProducerAppData>
            ) => Promise<Producer<ProducerAppData>>

        transport.produce = async function <ProducerAppData extends AppData = AppData>(
            options?: ProducerOptions<ProducerAppData>
        ): Promise<Producer<ProducerAppData>> {
            const producer = await originalProduce(options)
            // Store by kind ("audio"/"video") for mute/camera toggles
            producers.set((producer.track as MediaStreamTrack).kind, producer)
            const sender = (producer as any)._rtpSender as RTCRtpSender | undefined
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
