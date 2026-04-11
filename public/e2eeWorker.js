// public/e2eeWorker.js
const IV_LENGTH = 12
let roomKey = null

// Receive room key from main thread
self.onmessage = async (event) => {
    if (event.data.type === "set-key") {
        const rawKey = event.data.rawKey  // ArrayBuffer
        roomKey = await crypto.subtle.importKey(
            "raw", rawKey,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        )
        console.log("Worker: room key set")
    }
}

// Called for each encoded frame on sender side
async function encryptFrame(encodedFrame, controller) {
    if (!roomKey) {
        controller.enqueue(encodedFrame)
        return
    }
    try {
        const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            roomKey,
            encodedFrame.data
        )
        const result = new Uint8Array(IV_LENGTH + ciphertext.byteLength)
        result.set(iv, 0)
        result.set(new Uint8Array(ciphertext), IV_LENGTH)
        encodedFrame.data = result.buffer
        controller.enqueue(encodedFrame)
    } catch {
        controller.enqueue(encodedFrame)
    }
}

// Called for each encoded frame on receiver side
async function decryptFrame(encodedFrame, controller) {
    if (!roomKey) {
        controller.enqueue(encodedFrame)
        return
    }
    try {
        const data = new Uint8Array(encodedFrame.data)
        const iv = data.slice(0, IV_LENGTH)
        const ciphertext = data.slice(IV_LENGTH)
        const plaintext = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            roomKey,
            ciphertext
        )
        encodedFrame.data = plaintext
        controller.enqueue(encodedFrame)
    } catch {
        controller.enqueue(encodedFrame)
    }
}

// RTCRtpScriptTransform calls this
self.onrtctransform = (event) => {
    const transformer = event.transformer
    const operation = transformer.options.operation
    const fn = operation === "encrypt" ? encryptFrame : decryptFrame

    const readable = transformer.readable
    const writable = transformer.writable
    const writer = writable.getWriter()

    const reader = readable.getReader()

    async function process() {
        while (true) {
            const { value: frame, done } = await reader.read()
            if (done) break
            await fn(frame, {
                enqueue: async (f) => await writer.write(f)
            })
        }
    }
    process()
}