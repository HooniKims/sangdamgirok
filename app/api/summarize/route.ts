import { NextResponse } from "next/server"

// 이 API 라우트는 더 이상 사용되지 않습니다.
// AI 요약 기능은 브라우저에서 로컬 Ollama API를 직접 호출합니다.
// 자세한 내용은 local-llm-api-guide.md를 참조하세요.

export async function POST() {
    return NextResponse.json(
        { error: "이 API는 더 이상 사용되지 않습니다. 로컬 LLM API를 직접 호출하세요." },
        { status: 410 }
    )
}
