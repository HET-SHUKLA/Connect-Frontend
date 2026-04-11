import { Device } from "mediasoup-client"
import type { Transport, Consumer } from "mediasoup-client/types"
import type { TransportCreatedMessage } from "../types"

// ─── State ────────────────────────────────────────────────────────────────
let device: Device | null = null
let sendTransport: Transport | null = null
let recvTransport: Transport | null = null
const consumers: Map<string, Consumer> = new Map()

// ─── waitFor ──────────────────────────────────────────────────────────────
// Simple resolver map — works exactly like the HTML file version
type Resolver = (msg: any) => void
const resolvers: Map<string, Resolver[]> = new Map()

export function resolveMessage(type: string, msg: any) {
    const waiting = resolvers.get(type)
    if (waiting && waiting.length > 0) {
        const resolve = waiting.shift()!
        resolve(msg)
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
        })
        : device.createRecvTransport({
            id: message.id,
            iceParameters: message.iceParameters,
            iceCandidates: message.iceCandidates,
            dtlsParameters: message.dtlsParameters,
        })

    transport.on("connect", ({ dtlsParameters }, callback, errback) => {
        try {
            sendFn({ type: "connect-transport", transportId: transport.id, dtlsParameters })
            callback()
        } catch (err) {
            errback(err as Error)
        }
    })

    if (message.direction === "send") {
        transport.on("produce", ({ kind, rtpParameters }, callback, errback) => {
            try {
                sendFn({ type: "produce", roomId, kind, rtpParameters })
                waitFor("produce-created").then(msg => callback({ id: msg.producerId }))
            } catch (err) {
                errback(err as Error)
            }
        })
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

    consumers.set(consumer.id, consumer)
    return consumer
}