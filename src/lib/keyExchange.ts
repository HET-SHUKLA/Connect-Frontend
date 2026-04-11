export async function generateKeyPair(): Promise<CryptoKeyPair> {
    return crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey"]
    )
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
    const raw = await crypto.subtle.exportKey("spki", key)
    return btoa(String.fromCharCode(...new Uint8Array(raw)))
}

export async function importPublicKey(base64: string): Promise<CryptoKey> {
    const raw = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    return crypto.subtle.importKey(
        "spki", raw,
        { name: "ECDH", namedCurve: "P-256" },
        false, []
    )
}

export async function deriveSharedKey(
    myPrivateKey: CryptoKey,
    theirPublicKey: CryptoKey
): Promise<CryptoKey> {
    return crypto.subtle.deriveKey(
        { name: "ECDH", public: theirPublicKey },
        myPrivateKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    )
}

export async function encryptRoomKey(sharedKey: CryptoKey, roomKey: CryptoKey): Promise<string> {
    const rawRoomKey = await crypto.subtle.exportKey("raw", roomKey)
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, sharedKey, rawRoomKey)
    const combined = new Uint8Array(12 + encrypted.byteLength)
    combined.set(iv, 0)
    combined.set(new Uint8Array(encrypted), 12)
    return btoa(String.fromCharCode(...combined))
}

export async function decryptRoomKey(sharedKey: CryptoKey, encryptedBase64: string): Promise<CryptoKey> {
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0))
    const iv = combined.slice(0, 12)
    const ciphertext = combined.slice(12)
    const rawRoomKey = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, sharedKey, ciphertext)
    return crypto.subtle.importKey(
        "raw", rawRoomKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    )
}