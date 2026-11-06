import { NextResponse } from "next/server"

// 이 API 라우트는 더 이상 사용되지 않습니다.
// AI 요약 기능은 서버 프록시(/api/llm)를 통해 LM Studio 로컬 LLM API를 호출합니다.
// 자세한 내용은 local-llm-api-guide.md를 참조하세요.

export async function POST() {
    return NextResponse.json(
        { error: "이 API는 더 이상 사용되지 않습니다. /api/llm을 사용하세요." },
        { status: 410 }
    )
}
