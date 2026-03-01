import { NextResponse } from "next/server"
import { createHash } from "crypto"
import { getAdminDb } from "@/lib/firebase-admin"

export const dynamic = "force-dynamic"

const LOGIN_LOCK_THRESHOLD = 10

function buildLockKey(email: string): string {
    const normalized = email.trim().toLowerCase()
    return createHash("sha256").update(normalized).digest("hex")
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""

        if (!email) {
            return NextResponse.json({ error: "이메일이 필요합니다." }, { status: 400 })
        }

        const lockKey = buildLockKey(email)
        const db = await getAdminDb()
        const docRef = db.collection("loginLocks").doc(lockKey)

        const result = await db.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(docRef)
            const data = snapshot.data() ?? {}

            // 이미 잠긴 경우 그대로 반환
            if (data.isLocked) {
                return {
                    isLocked: true,
                    failedAttempts: typeof data.failedAttempts === "number" ? data.failedAttempts : LOGIN_LOCK_THRESHOLD,
                    remainingAttempts: 0,
                }
            }

            const currentFailed = typeof data.failedAttempts === "number" ? data.failedAttempts : 0
            const nextFailed = Math.min(currentFailed + 1, LOGIN_LOCK_THRESHOLD)
            const shouldLock = nextFailed >= LOGIN_LOCK_THRESHOLD

            const { FieldValue } = await import("firebase-admin/firestore")

            const updateData: Record<string, unknown> = {
                failedAttempts: nextFailed,
                isLocked: shouldLock,
                updatedAt: FieldValue.serverTimestamp(),
            }

            if (shouldLock) {
                updateData.lockedAt = FieldValue.serverTimestamp()
            }

            transaction.set(docRef, updateData, { merge: true })

            return {
                isLocked: shouldLock,
                failedAttempts: nextFailed,
                remainingAttempts: Math.max(LOGIN_LOCK_THRESHOLD - nextFailed, 0),
            }
        })

        return NextResponse.json(result)
    } catch (error) {
        console.error("record-failure error details:", error instanceof Error ? error.stack : error)
        const errorMessage = error instanceof Error ? error.message : "실패 기록 중 오류가 발생했습니다."
        return NextResponse.json({ error: errorMessage }, { status: 500 })
    }
}
