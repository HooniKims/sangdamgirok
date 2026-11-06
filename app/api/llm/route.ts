import { NextResponse } from "next/server"
import { getAdminAuth } from "@/lib/firebase-admin"
import { AVAILABLE_MODELS, LOCAL_LLM_CHAT_COMPLETIONS_ENDPOINT } from "@/utils/localLlmClient"

// 로컬 LLM 프록시
// 브라우저는 이 라우트만 호출하고, LM Studio API 키(LOCAL_LLM_API_KEY)는 서버에서만 붙입니다.
// 로그인한 사용자(Firebase ID 토큰)만 사용할 수 있습니다.

export const dynamic = "force-dynamic"
export const maxDuration = 300

const ALLOWED_REQUEST_MODELS = new Set<string>(AVAILABLE_MODELS.map(model => model.requestModel))
const ALLOWED_ROLES = new Set(["system", "user", "assistant"])
const MAX_MESSAGES = 10
const MAX_TOTAL_CHARS = 200_000
const MAX_TOKENS_LIMIT = 8192

type ChatMessage = { role: string; content: string }

function jsonError(message: string, status: number) {
    return NextResponse.json({ error: message }, { status })
}

function isValidMessages(value: unknown): value is ChatMessage[] {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) return false
    let totalChars = 0
    for (const item of value) {
        if (!item || typeof item !== "object") return false
        const { role, content } = item as Record<string, unknown>
        if (typeof role !== "string" || !ALLOWED_ROLES.has(role)) return false
        if (typeof content !== "string") return false
        totalChars += content.length
    }
    return totalChars <= MAX_TOTAL_CHARS
}

export async function POST(request: Request) {
    const apiKey = process.env.LOCAL_LLM_API_KEY?.trim()
    if (!apiKey) {
        return jsonError("서버에 로컬 LLM API 키가 설정되지 않았습니다.", 500)
    }

    const authHeader = request.headers.get("authorization") || ""
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : ""
    if (!idToken) {
        return jsonError("로그인이 필요합니다. 다시 로그인해주세요.", 401)
    }

    try {
        const adminAuth = await getAdminAuth()
        await adminAuth.verifyIdToken(idToken)
    } catch {
        return jsonError("로그인 정보가 만료되었습니다. 다시 로그인해주세요.", 401)
    }

    let body: Record<string, unknown>
    try {
        body = await request.json()
    } catch {
        return jsonError("요청 형식이 올바르지 않습니다.", 400)
    }

    const { model, messages, temperature, max_tokens } = body ?? {}

    if (typeof model !== "string" || !ALLOWED_REQUEST_MODELS.has(model)) {
        return jsonError("허용되지 않은 모델입니다.", 400)
    }
    if (!isValidMessages(messages)) {
        return jsonError("요청 내용이 올바르지 않거나 너무 깁니다.", 400)
    }

    const safeTemperature = typeof temperature === "number" && Number.isFinite(temperature)
        ? Math.min(Math.max(temperature, 0), 2)
        : 0.7
    const safeMaxTokens = typeof max_tokens === "number" && Number.isFinite(max_tokens)
        ? Math.min(Math.max(Math.floor(max_tokens), 1), MAX_TOKENS_LIMIT)
        : 2048

    let upstream: Response
    try {
        upstream = await fetch(LOCAL_LLM_CHAT_COMPLETIONS_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": apiKey,
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: safeTemperature,
                max_tokens: safeMaxTokens,
                reasoning_effort: "none",
                stream: false,
            }),
            cache: "no-store",
        })
    } catch (error) {
        console.error("local LLM proxy error:", error)
        return jsonError("로컬 LLM 서버에 연결할 수 없습니다.", 502)
    }

    const text = await upstream.text()
    return new NextResponse(text, {
        status: upstream.status,
        headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
    })
}
