import { NextRequest, NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "")

export async function POST(request: NextRequest) {
    try {
        const { content } = await request.json()

        if (!content) {
            return NextResponse.json(
                { error: "요약할 내용이 없습니다." },
                { status: 400 }
            )
        }

        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json(
                { error: "API 키가 설정되지 않았습니다." },
                { status: 500 }
            )
        }

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" })

        const prompt = `당신은 학교 교사의 학생 상담 기록을 정리하는 전문가입니다.
다음 상담 내용을 포멀하고 공식적인 문체로 정돈하여 작성해주세요.

[중요 규칙]
• 마크다운 기호(##, **, -, * 등)를 절대 사용하지 마세요
• "상담교사"라는 단어를 절대 사용하지 마세요 (일반 교사의 상담임)
• 원본에 없는 내용을 절대 만들어 내지 마세요
• 작성된 내용을 그대로 포멀한 문체로 다듬기만 하세요

[작성 형식]
• 제목은 【】로 표시
• 불릿은 • 사용
• 중요 키워드는 「」로 강조

[작성 내용 - 아래 두 섹션만 작성]
【상담 개요】
→ 상담 주제를 한 줄로 정리

【상담 내용】
→ 원본 내용을 포멀한 문체로 정돈하여 작성
→ 새로운 내용 추가 금지, 원본 내용만 다듬어서 작성

상담 내용:
${content}

위 형식대로 간결하게 정리해주세요:`

        const result = await model.generateContent(prompt)
        const response = await result.response
        const summary = response.text()

        return NextResponse.json({ summary })
    } catch (error: any) {
        console.error("Summarize API Error:", error)
        return NextResponse.json(
            { error: error.message || "요약 중 오류가 발생했습니다." },
            { status: 500 }
        )
    }
}
