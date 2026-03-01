// ===== 설정 (Vercel 환경 변수에서 읽음) =====
const OLLAMA_API_URL = process.env.NEXT_PUBLIC_OLLAMA_API_URL || "https://api.alluser.site";
const OLLAMA_API_KEY = process.env.NEXT_PUBLIC_OLLAMA_API_KEY || "";

// ===== 사용 가능한 모델 목록 =====
export const AVAILABLE_MODELS = [
    { id: "gemma3:4b-it-q4_K_M", name: "Gemma 3 4B (추천 - 경량 로컬 모델)", description: "경량 (3.3GB)" },
    { id: "gemma3:12b-it-q8_0", name: "Gemma 3 12B Q8 (최고 품질)", description: "최고 품질 (13GB)" },
    { id: "gemma3:12b-it-q4_K_M", name: "Gemma 3 12B Q4 (고품질)", description: "고품질 (8GB)" },
    { id: "qwen3:8b", name: "Qwen 3 8B (균형 잡힌 성능)", description: "균형 잡힌 성능" },
    { id: "qwen3:4b", name: "Qwen 3 4B (가장 빠른 응답)", description: "경량 빠른 응답" },
    { id: "llama3.1:8b", name: "Llama 3.1 8B (범용 모델)", description: "범용 모델" },
];

export const DEFAULT_MODEL = AVAILABLE_MODELS[0].id;

/**
 * Ollama API 1회 호출 (OpenAI 호환 엔드포인트)
 * 
 * @param systemMessage - 시스템 프롬프트
 * @param userPrompt    - 사용자 프롬프트
 * @param model         - 모델 ID (기본값: DEFAULT_MODEL)
 * @param options       - 추가 옵션 { temperature, stream }
 * @returns 생성된 텍스트
 */
export async function callOllamaAPI(
    systemMessage: string,
    userPrompt: string,
    model?: string,
    options: { temperature?: number; stream?: boolean } = {}
): Promise<string> {
    const { temperature = 0.7, stream = false } = options;

    const res = await fetch(`${OLLAMA_API_URL}/v1/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-API-Key": OLLAMA_API_KEY,
        },
        body: JSON.stringify({
            model: model || DEFAULT_MODEL,
            messages: [
                { role: "system", content: systemMessage },
                { role: "user", content: userPrompt },
            ],
            temperature,
            stream,
        }),
    });

    if (!res.ok) {
        let errorMessage = `서버 오류 (${res.status})`;
        try {
            const errorData = await res.json();
            errorMessage = errorData.error || errorMessage;
        } catch {
            // 무시
        }
        throw new Error(errorMessage);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
}

/**
 * 고수준 API: 시스템 메시지 + 프롬프트 + 추가 지침을 결합하여 호출
 * "Sandwich 기법" 적용 — 추가 지침을 시스템/사용자 프롬프트 앞뒤에 삽입
 */
export async function generateWithInstructions({
    systemMessage,
    prompt,
    additionalInstructions,
    model,
}: {
    systemMessage: string;
    prompt: string;
    additionalInstructions?: string;
    model?: string;
}): Promise<string> {
    // 추가 지침 → 시스템 메시지에 추가
    let finalSystemMessage = systemMessage;
    if (additionalInstructions) {
        finalSystemMessage += `\n\n사용자 추가 규칙 (최우선 준수):\n${additionalInstructions}`;
    }

    // 추가 지침 → 사용자 프롬프트 앞뒤에 감싸기 (Sandwich 기법)
    let finalPrompt = prompt;
    if (additionalInstructions && additionalInstructions.trim()) {
        const prefix = `[최우선 규칙] 다음 규칙을 반드시 지켜서 작성하라: ${additionalInstructions}\n\n`;
        const suffix = `\n\n[다시 한번 강조] 위 본문 작성 시 반드시 적용할 규칙: ${additionalInstructions}`;
        finalPrompt = prefix + prompt + suffix;
    }

    return callOllamaAPI(finalSystemMessage, finalPrompt, model);
}

/**
 * 텍스트가 완전한 한국어 문장으로 끝나는지 확인
 */
function endsWithCompleteSentence(text: string): boolean {
    if (!text || !text.trim()) return false;
    const trimmed = text.trim();
    return /[함음임됨봄옴줌춤움늠름다요까니][.!?]\s*$/.test(trimmed);
}

/**
 * 자동 재시도 포함 API 호출
 * 문장이 불완전하게 끝나면 최대 2회 재시도
 */
export async function generateWithRetry(params: {
    systemMessage: string;
    prompt: string;
    additionalInstructions?: string;
    model?: string;
}): Promise<string> {
    let content = await generateWithInstructions(params);

    if (!content.trim()) {
        throw new Error("AI 응답이 비어있습니다.");
    }

    const MAX_RETRIES = 2;
    for (let retry = 0; retry < MAX_RETRIES; retry++) {
        if (endsWithCompleteSentence(content)) break;

        console.log(`[재시도 ${retry + 1}/${MAX_RETRIES}] 문장 불완전: "...${content.slice(-30)}"`);

        const retryPrompt = `다음 텍스트는 문장이 중간에 끊겼습니다. 같은 내용을 완전한 문장으로 끝나도록 다시 작성하세요. 반드시 종결어미와 마침표로 끝내세요. 오직 본문만 출력하세요.\n\n불완전한 텍스트:\n${content}`;

        const retryContent = await callOllamaAPI(params.systemMessage, retryPrompt, params.model);

        if (retryContent.trim() && endsWithCompleteSentence(retryContent)) {
            content = retryContent;
            console.log(`[재시도 성공] 완전한 문장으로 수정됨`);
            break;
        } else if (retryContent.trim()) {
            content = retryContent;
        }
    }

    return content;
}
