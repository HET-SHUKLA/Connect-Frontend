const KEY_ALGORITHM = "AES-GCM"
const IV_LENGTH = 12

export async function generateRoomKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
        { name: KEY_ALGORITHM, length: 256 },
        true,
        ["encrypt", "decrypt"]
    )
}

export async function exportKey(key: CryptoKey): Promise<ArrayBuffer> {
    return crypto.subtle.exportKey("raw", key)
}

export async function importRoomKey(rawKey: ArrayBuffer): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        "raw", rawKey,
        { name: KEY_ALGORITHM },
        false,
        ["encrypt", "decrypt"]
    )
}

export async function encryptPacket(key: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
    const ciphertext = await crypto.subtle.encrypt({ name: KEY_ALGORITHM, iv }, key, data)
    const result = new Uint8Array(IV_LENGTH + ciphertext.byteLength)
    result.set(iv, 0)
    result.set(new Uint8Array(ciphertext), IV_LENGTH)
    return result.buffer
}

export async function decryptPacket(key: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
    const iv = data.slice(0, IV_LENGTH)
    const ciphertext = data.slice(IV_LENGTH)
    return crypto.subtle.decrypt({ name: KEY_ALGORITHM, iv }, key, ciphertext)
}