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
        const snapshot = await docRef.get()
        const data = snapshot.data()

        const isLocked = Boolean(data?.isLocked)
        const failedAttempts = typeof data?.failedAttempts === "number" ? data.failedAttempts : 0
        const remainingAttempts = Math.max(LOGIN_LOCK_THRESHOLD - failedAttempts, 0)

        return NextResponse.json({ isLocked, failedAttempts, remainingAttempts })
    } catch (error) {
        console.error("check-lock error:", error)
        return NextResponse.json({ error: "잠금 상태 확인 중 오류가 발생했습니다." }, { status: 500 })
    }
}
