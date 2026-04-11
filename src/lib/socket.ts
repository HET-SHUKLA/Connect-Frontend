import type { ClientMessage, ServerMessage } from "../types"
import { resolveMessage } from "./mediasoupClient"

type EventHandler = (msg: any) => void
const handlers: Map<string, EventHandler[]> = new Map()

let ws: WebSocket | null = null

export function connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
        ws = new WebSocket(url)
        ws.onopen = () => resolve()
        ws.onerror = (err) => reject(err)
        ws.onmessage = (event) => {
            const msg: ServerMessage = JSON.parse(event.data)

            // First try to resolve a waitFor promise
            resolveMessage(msg.type, msg)

            // Then fire any persistent event handlers
            const h = handlers.get(msg.type) ?? []
            h.forEach(fn => fn(msg))
        }
    })
}

// Persistent handlers — for events that fire multiple times (new-producer, peer-left)
export function on(type: ServerMessage["type"], handler: EventHandler) {
    const existing = handlers.get(type) ?? []
    handlers.set(type, [...existing, handler])
}

export function send(message: ClientMessage) {
    if (!ws) throw new Error("WebSocket not connected")
    ws.send(JSON.stringify(message))
}