import { io, type Socket } from "socket.io-client"
import type { ClientMessage, ServerMessage } from "../types"
import { resolveMessage } from "./mediasoupClient"

type EventHandler = (msg: any) => void

// Module-level singletons — cleared by disconnect()
const handlers: Map<string, EventHandler[]> = new Map()
let socket: Socket | null = null

/**
 * Connect to the signaling server. `url` is the backend origin
 * (e.g. http://host:8080); Socket.IO uses its default /socket.io path.
 * Every message is an event named after its `type`.
 */
export function connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
        // No auto-reconnect: a new connection is a new peer with no room state
        socket = io(url, { reconnection: false })
        socket.once("connect", () => resolve())
        socket.once("connect_error", (err) => reject(err))
        socket.onAny((type: string, msg: ServerMessage) => {
            // First resolve any one-shot waitFor promises
            resolveMessage(type, msg)
            // Then fire persistent event handlers
            const h = handlers.get(type) ?? []
            h.forEach(fn => fn(msg))
        })
    })
}

// Persistent handlers (new-producer, peer-left, key-requested, …)
export function on(type: ServerMessage["type"], handler: EventHandler) {
    const existing = handlers.get(type) ?? []
    handlers.set(type, [...existing, handler])
}

export function send(message: ClientMessage) {
    if (!socket || !socket.connected) {
        console.warn("[socket] send() called but socket is not connected")
        return
    }
    socket.emit(message.type, message)
}

/**
 * Disconnect the socket and clear all registered event handlers.
 *
 * MUST be called on leave so that:
 *  1. The server gets an immediate disconnect and removes the peer.
 *  2. The handlers Map is wiped, preventing stale closures from a previous
 *     session from firing in a future one (the root cause of ghost-peer bug).
 */
export function disconnect() {
    if (socket) {
        socket.offAny()
        socket.disconnect()
        socket = null
    }
    handlers.clear()
}
