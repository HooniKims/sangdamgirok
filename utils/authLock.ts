const LOCK_HASH_ALGORITHM = "SHA-256"

export const LOGIN_LOCK_THRESHOLD = 10

export function normalizeEmail(value: string): string {
    return value.trim().toLowerCase()
}

export async function buildEmailLockKey(email: string): Promise<string> {
    const normalizedEmail = normalizeEmail(email)
    const data = new TextEncoder().encode(normalizedEmail)
    const hashBuffer = await crypto.subtle.digest(LOCK_HASH_ALGORITHM, data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

