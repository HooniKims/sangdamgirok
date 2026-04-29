# 로컬 LLM API 연동 가이드

이 프로젝트의 AI 생성 기능은 OpenAI 서비스나 OpenAI API 키를 사용하지 않습니다. 모든 요청은 LM Studio 기반 로컬 LLM 게이트웨이로만 전송합니다.

## 1. 고정 API 주소

| 항목 | 값 |
|------|-----|
| base URL | `https://lm.alluser.site` |
| chat completions endpoint | `https://lm.alluser.site/v1/chat/completions` |
| 인증 헤더 | `X-API-Key` |

인증 키는 기존 로컬 LLM 키 환경변수인 `NEXT_PUBLIC_OLLAMA_API_KEY` 값을 그대로 사용합니다. 새 키 값을 만들거나 별도의 OpenAI 키 입력 흐름을 추가하지 않습니다.

## 2. 모델 목록

모델 정의의 기준 파일은 `utils/localLlmClient.ts`입니다.

| 표시 ID | 표시 이름 | 설명 | 실제 요청 model | max_tokens |
|---------|-----------|------|------------------|------------|
| `gemma4:e2b` | Gemma 4 E2B | 기본 모델, 빠르고 안정적 | `google/gemma-4-e2b` | `2048` |
| `gemma4:e4b` | Gemma 4 E4B | 품질 높음, 설명 출력 가능성 있음 | `google/gemma-4-e4b` | `3072` |
| `lmstudio:gemma-4-26b-a4b-it-q4ks` | Gemma 4 26B Q4 | 느리지만 품질 높음 | `gemma-4-26b-a4b-it` | `4096` |

기본 선택 모델은 반드시 `gemma4:e2b`입니다.

드롭다운 라벨은 공통 헬퍼 `getModelOptionLabel()`을 사용해 다음 형식으로 표시합니다.

```text
Gemma 4 E2B - 기본 모델, 빠르고 안정적
Gemma 4 E4B - 품질 높음, 설명 출력 가능성 있음
Gemma 4 26B Q4 - 느리지만 품질 높음
```

## 3. 요청 형식

`callLocalLlmAPI()`는 표시 ID를 받아 실제 요청 model로 변환한 뒤 아래 형식으로 전송합니다.

```json
{
  "model": "google/gemma-4-e2b",
  "messages": [
    { "role": "system", "content": "시스템 지시문" },
    { "role": "user", "content": "사용자 프롬프트" }
  ],
  "temperature": 0.7,
  "max_tokens": 2048,
  "reasoning_effort": "none",
  "stream": false
}
```

## 4. 사용 예시

```ts
import { DEFAULT_MODEL, generateWithRetry } from "@/utils/localLlmClient";

const content = await generateWithRetry({
    systemMessage: "상담 내용을 공식 문체로 정리하세요.",
    prompt: "상담 원문",
    model: DEFAULT_MODEL,
});
```

## 5. 검증

현재 검증 스크립트는 다음 계약을 확인합니다.

- 허용된 3개 모델만 남아 있는지
- 표시 ID와 실제 요청 model 매핑이 맞는지
- endpoint가 `https://lm.alluser.site/v1/chat/completions`로 고정되어 있는지
- 기본 선택값이 `gemma4:e2b`인지
- production source에 이전 OpenAI/API proxy 관련 금지 문자열이 남아 있지 않은지
- `openai` 패키지 의존성이 제거되어 있는지

```bash
npm test
npm run lint
npm run build
```
