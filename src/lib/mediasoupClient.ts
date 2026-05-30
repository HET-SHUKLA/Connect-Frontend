import { Device } from "mediasoup-client"
import type { Transport, Consumer, Producer, ProducerOptions, AppData } from "mediasoup-client/types"
import type { TransportCreatedMessage } from "../types"
import { exportKey } from "./crypto"

let device: Device | null = null
let sendTransport: Transport | null = null
let recvTransport: Transport | null = null
let e2eeWorker: Worker | null = null

const producers: Map<string, any> = new Map()

// ─── E2EE ─────────────────────────────────────────────────────────────────
export function initE2eeWorker(roomKey: CryptoKey) {
    e2eeWorker = new Worker("/e2eeWorker.js")
    exportKey(roomKey).then(rawKey => {
        e2eeWorker!.postMessage({ type: "set-key", rawKey }, [rawKey])
    })
}

// ─── Mute controls ────────────────────────────────────────────────────────
export function toggleMic(enabled: boolean) {
    const p = producers.get("audio")
    if (!p) return
    enabled ? p.resume() : p.pause()
}

export function toggleCamera(enabled: boolean) {
    const p = producers.get("video")
    if (!p) return
    enabled ? p.resume() : p.pause()
}

// ─── Replace track (device switching) ────────────────────────────────────
export async function replaceTrack(kind: "audio" | "video", newTrack: MediaStreamTrack) {
    const p = producers.get(kind)
    if (!p) return
    await p.replaceTrack({ track: newTrack })
}

// ─── Transforms ───────────────────────────────────────────────────────────
function attachSenderTransform(sender: RTCRtpSender) {
    if (!e2eeWorker) return
    try {
        // @ts-ignore
        sender.transform = new RTCRtpScriptTransform(e2eeWorker, { operation: "encrypt" })
    } catch (e) {
        console.warn("[E2EE] attachSenderTransform:", e)
    }
}

function attachReceiverTransform(receiver: RTCRtpReceiver) {
    if (!e2eeWorker) return
    try {
        // @ts-ignore
        receiver.transform = new RTCRtpScriptTransform(e2eeWorker, { operation: "decrypt" })
    } catch (e) {
        console.warn("[E2EE] attachReceiverTransform:", e)
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
    return new Promise(resolve => {
        const existing = resolvers.get(type) ?? []
        resolvers.set(type, [...existing, resolve])
    })
}

export function resetState() {
    device = null
    sendTransport = null
    recvTransport = null
    e2eeWorker?.terminate()
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
            id: message.id, iceParameters: message.iceParameters,
            iceCandidates: message.iceCandidates, dtlsParameters: message.dtlsParameters,
            iceServers: message.iceServers,
        })
        : device.createRecvTransport({
            id: message.id, iceParameters: message.iceParameters,
            iceCandidates: message.iceCandidates, dtlsParameters: message.dtlsParameters,
            iceServers: message.iceServers,
        })

    transport.on("connect", ({ dtlsParameters }, callback, errback) => {
        try { sendFn({ type: "connect-transport", transportId: transport.id, dtlsParameters }); callback() }
        catch (err) { errback(err as Error) }
    })

    if (message.direction === "send") {
        transport.on("produce", ({ kind, rtpParameters }, callback, errback) => {
            try {
                sendFn({ type: "produce", roomId, kind, rtpParameters })
                waitFor("produce-created").then(msg => callback({ id: msg.producerId }))
            } catch (err) { errback(err as Error) }
        })

        const originalProduce = transport.produce.bind(transport) as
            <A extends AppData = AppData>(o?: ProducerOptions<A>) => Promise<Producer<A>>

        transport.produce = async function <A extends AppData = AppData>(o?: ProducerOptions<A>) {
            const producer = await originalProduce(o)
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

// ─── Produce full stream ───────────────────────────────────────────────────
export async function produceStream(stream: MediaStream) {
    if (!sendTransport) throw new Error("No send transport")
    const vt = stream.getVideoTracks()[0]
    const at = stream.getAudioTracks()[0]
    if (vt) await sendTransport.produce({ track: vt })
    if (at) await sendTransport.produce({ track: at })
}

// ─── Produce single track (mid-meeting enable) ────────────────────────────
// Called when a user joins without permissions and later grants them,
// or when adding a track type that wasn't produced initially.
export async function produceTrack(track: MediaStreamTrack) {
    if (!sendTransport) throw new Error("No send transport")
    const existing = producers.get(track.kind)
    if (existing) {
        // Already have a producer for this kind — just replace the track
        await existing.replaceTrack({ track })
        existing.resume()
        return
    }
    await sendTransport.produce({ track })
}

// ─── Consume ──────────────────────────────────────────────────────────────
export async function consumeProducer(
    producerId: string,
    roomId: string,
    sendFn: (msg: any) => void
): Promise<Consumer> {
    if (!device || !recvTransport) throw new Error("Not ready to consume")

    sendFn({ type: "consume", roomId, producerId, rtpCapabilities: device.rtpCapabilities })

    const msg = await waitFor("consumer-created")

    const consumer = await recvTransport.consume({
        id: msg.consumerId, producerId: msg.producerId,
        kind: msg.kind, rtpParameters: msg.rtpParameters,
    })

    const receiver = (consumer as any)._rtpReceiver
    if (receiver) attachReceiverTransform(receiver)

    await consumer.resume()
    return consumer
}