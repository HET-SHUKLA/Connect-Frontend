import type { ClientMessage, ServerMessage } from "../types"
import { resolveMessage } from "./mediasoupClient"

type EventHandler = (msg: any) => void

// Module-level singletons — cleared by disconnect()
const handlers: Map<string, EventHandler[]> = new Map()
let ws: WebSocket | null = null

export function connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
        ws = new WebSocket(url)
        ws.onopen = () => resolve()
        ws.onerror = (err) => reject(err)
        ws.onmessage = (event) => {
            const msg: ServerMessage = JSON.parse(event.data)
            // First resolve any one-shot waitFor promises
            resolveMessage(msg.type, msg)
            // Then fire persistent event handlers
            const h = handlers.get(msg.type) ?? []
            h.forEach(fn => fn(msg))
        }
    })
}

// Persistent handlers (new-producer, peer-left, key-requested, …)
export function on(type: ServerMessage["type"], handler: EventHandler) {
    const existing = handlers.get(type) ?? []
    handlers.set(type, [...existing, handler])
}

export function send(message: ClientMessage) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.warn("[socket] send() called but WebSocket is not open")
        return
    }
    ws.send(JSON.stringify(message))
}

/**
 * Close the WebSocket and clear all registered event handlers.
 *
 * MUST be called on leave so that:
 *  1. The server gets an immediate close event and removes the peer.
 *  2. The handlers Map is wiped, preventing stale closures from a previous
 *     session from firing in a future one (the root cause of ghost-peer bug).
 */
export function disconnect() {
    if (ws) {
        ws.onmessage = null  // stop processing any in-flight messages
        ws.onclose   = null
        ws.onerror   = null
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close(1000, "user left")
        }
        ws = null
    }
    handlers.clear()
}
