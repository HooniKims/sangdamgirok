# 🔌 로컬 LLM API 연동 가이드 (재사용 템플릿)

> 이 문서는 **Ollama 로컬 LLM**을 웹 프로젝트에서 호출하는 전체 패턴을 정리한 것입니다.  
> 다른 프로젝트에 복사하여 바로 적용할 수 있습니다.

---

## 📐 아키텍처 개요

```
[브라우저 (한국)] ──직접 호출──▶ [api.alluser.site (Nginx 프록시)] ──▶ [Ollama (192.168.0.182:11434)]
```

### 왜 브라우저 직접 호출인가?

| 방식 | 결과 | 이유 |
|------|------|------|
| Netlify 서버리스 → Ollama | ❌ 실패 | 해외 서버에서 한국 가정 네트워크 접근 불가 (방화벽/ISP 차단) |
| Edge 함수 | ❌ 실패 | OpenAI SDK 호환 문제 (502) |
| 서버리스 스트리밍 | ❌ 실패 | Netlify 10초 하드 타임아웃 → 504 |
| **브라우저 → Nginx 프록시** | ✅ 성공 | 한국 내 직접 통신, 타임아웃 없음 |

---

## 1. Nginx 프록시 설정 (`api.alluser.site`)

```nginx
location / {
    # ===== CORS 설정 =====
    set $cors_origin "";
    if ($http_origin = "https://your-app.netlify.app") { set $cors_origin $http_origin; }
    if ($http_origin = "http://localhost:3000") { set $cors_origin $http_origin; }
    # 🔧 새 프로젝트 추가 시 위에 한 줄만 추가

    if ($request_method = OPTIONS) {
        add_header 'Access-Control-Allow-Origin' $cors_origin always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Content-Type, X-API-Key' always;
        add_header 'Access-Control-Max-Age' 86400 always;
        add_header 'Content-Length' 0;
        return 204;
    }

    add_header 'Access-Control-Allow-Origin' $cors_origin always;

    # ===== API Key 인증 =====
    if ($http_x_api_key != "YOUR_API_KEY_HERE") {
        return 401 '{"error":"Unauthorized"}';
    }

    # ===== Proxy to Ollama =====
    proxy_pass http://192.168.0.182:11434;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Ollama 기본 CORS 헤더 제거 (충돌 방지)
    proxy_hide_header 'Access-Control-Allow-Origin';
    proxy_hide_header 'Access-Control-Allow-Methods';
    proxy_hide_header 'Access-Control-Allow-Headers';

    # Streaming / 성능 최적화
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_cache off;
    add_header X-Accel-Buffering no;

    proxy_http_version 1.1;
    proxy_set_header Connection "";

    # 타임아웃 (LLM은 응답이 느릴 수 있음)
    proxy_read_timeout 600s;
    proxy_connect_timeout 30s;
    proxy_send_timeout 600s;

    gzip off;
}
```

### 새 프로젝트 추가 시
```nginx
if ($http_origin = "https://새프로젝트.netlify.app") { set $cors_origin $http_origin; }
```
이 한 줄만 CORS 설정 블록에 추가하면 됩니다.

---

## 2. 클라이언트 코드 (복사용 템플릿)

### 2-1. `utils/ollamaClient.js` — API 호출 핵심 모듈

```javascript
// ===== 설정 =====
const OLLAMA_API_URL = "https://api.alluser.site";
const OLLAMA_API_KEY = "YOUR_API_KEY_HERE";

// ===== 사용 가능한 모델 목록 =====
export const AVAILABLE_MODELS = [
    { id: "qwen3:8b",              name: "Qwen 3 8B (추천)",    description: "균형 잡힌 성능" },
    { id: "gemma3:12b-it-q8_0",    name: "Gemma 3 12B Q8",      description: "최고 품질 (13GB)" },
    { id: "gemma3:12b-it-q4_K_M",  name: "Gemma 3 12B Q4",      description: "고품질 (8GB)" },
    { id: "gemma3:4b-it-q4_K_M",   name: "Gemma 3 4B",          description: "경량 (3.3GB)" },
    { id: "qwen3:4b",              name: "Qwen 3 4B",           description: "경량 빠른 응답" },
    { id: "llama3.1:8b",           name: "Llama 3.1 8B",        description: "범용 모델" },
];

export const DEFAULT_MODEL = AVAILABLE_MODELS[0].id;

/**
 * Ollama API 1회 호출 (OpenAI 호환 엔드포인트)
 * 
 * @param {string} systemMessage - 시스템 프롬프트
 * @param {string} userPrompt    - 사용자 프롬프트
 * @param {string} model         - 모델 ID (기본값: DEFAULT_MODEL)
 * @param {Object} options       - 추가 옵션 { temperature, stream }
 * @returns {Promise<string>}    - 생성된 텍스트
 */
export async function callOllamaAPI(systemMessage, userPrompt, model, options = {}) {
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
 * 
 * @param {Object} params
 * @param {string} params.systemMessage         - 기본 시스템 메시지
 * @param {string} params.prompt                - 사용자 프롬프트
 * @param {string} [params.additionalInstructions] - 추가 지침 (선택)
 * @param {string} [params.model]               - 모델 ID (선택)
 * @returns {Promise<string>}
 */
export async function generateWithInstructions({ systemMessage, prompt, additionalInstructions, model }) {
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
```

### 2-2. 자동 재시도 로직 (완전한 문장 검증)

```javascript
/**
 * 텍스트가 완전한 한국어 문장으로 끝나는지 확인
 */
function endsWithCompleteSentence(text) {
    if (!text || !text.trim()) return false;
    const trimmed = text.trim();
    return /[함음임됨봄옴줌춤움늠름다요까니][.!?]\s*$/.test(trimmed);
}

/**
 * 자동 재시도 포함 API 호출
 * 문장이 불완전하게 끝나면 최대 2회 재시도
 * 
 * @param {Object} params - generateWithInstructions와 동일한 파라미터
 * @returns {Promise<string>}
 */
export async function generateWithRetry(params) {
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
```

---

## 3. 텍스트 후처리 유틸 (`utils/textProcessor.js`)

AI 생성 텍스트의 글자수 제한 및 정리를 위한 유틸리티입니다.

### 3-1. 메타 정보 제거

```javascript
/**
 * AI 출력에서 메타 정보(글자수, 분석 내용 등) 제거
 */
export function cleanMetaInfo(text) {
    if (!text) return text;

    // 괄호 안의 메타 정보: (약 500자), (글자수: 330) 등
    let cleaned = text.replace(/\s*\([^)]*\d+자[^)]*\)/g, '');
    cleaned = cleaned.replace(/\s*\([^)]*글자[^)]*\)/g, '');
    cleaned = cleaned.replace(/\s*\([^)]*자세한[^)]*\)/g, '');
    cleaned = cleaned.replace(/\s*\([^)]*내용\s*포함[^)]*\)/g, '');

    // 끝부분: "--- 330자" 또는 "[330자]"
    cleaned = cleaned.replace(/\s*[-─]+\s*\d+자\s*$/g, '');
    cleaned = cleaned.replace(/\s*\[\d+자\]\s*$/g, '');
    cleaned = cleaned.replace(/\s*\d+자\s*$/g, '');

    // 분석/검증 관련 문구 제거
    cleaned = cleaned.replace(/\s*\[분석[^\]]*\]/g, '');
    cleaned = cleaned.replace(/\s*\[검증[^\]]*\]/g, '');

    return cleaned.trim();
}
```

### 3-2. 글자수 초과 시 완전한 문장으로 자르기

```javascript
const MAX_CHARS = 500; // 절대 상한선

function isCompleteSentence(text) {
    if (!text) return false;
    return /[함음임됨봄옴줌춤움늠름다요까니][.!?]\s*$/.test(text.trim());
}

function splitIntoSentences(text) {
    if (!text) return [];
    return text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
}

/**
 * 글자수 초과 시 마지막 완전한 문장까지만 유지
 * 
 * @param {string} text        - AI 생성 텍스트
 * @param {number} targetChars - 목표 글자수
 * @returns {string}
 */
export function truncateToCompleteSentence(text, targetChars) {
    let cleaned = cleanMetaInfo(text);
    if (!cleaned) return '';

    const maxAllowed = Math.min(targetChars, MAX_CHARS);

    // 이미 제한 내이고 완전한 문장이면 그대로 반환
    if (cleaned.length <= maxAllowed && isCompleteSentence(cleaned)) {
        return cleaned.trim();
    }

    // 문장 단위로 분리 → 글자수 내에서 최대한 많은 문장 포함
    const sentences = splitIntoSentences(cleaned);
    let result = '';

    for (const sentence of sentences) {
        const trimmed = sentence.trim();
        const complete = /[.!?]$/.test(trimmed) ? trimmed : trimmed + '.';
        const candidate = result + (result ? ' ' : '') + complete;

        if (candidate.length <= maxAllowed) {
            result = candidate;
        } else {
            break;
        }
    }

    return result.trim();
}
```

### 3-3. 글자수 지침 프롬프트 생성기

```javascript
/**
 * AI에게 보낼 글자수 관련 프롬프트 지침 생성
 * 
 * @param {number} targetChars - 목표 글자수
 * @returns {string} - 프롬프트에 삽입할 지침 문자열
 */
export function getCharacterGuideline(targetChars) {
    const maxAllowed = Math.min(targetChars, MAX_CHARS);

    // 짧은 글일수록 버퍼를 더 크게
    let bufferRatio;
    if (targetChars <= 100) bufferRatio = 0.70;
    else if (targetChars <= 150) bufferRatio = 0.75;
    else if (targetChars <= 200) bufferRatio = 0.80;
    else if (targetChars <= 300) bufferRatio = 0.85;
    else bufferRatio = 0.90;

    const promptLimit = Math.floor(maxAllowed * bufferRatio);

    return `
<글자수 제한>
전체 글자수: ${maxAllowed}자 이하 (공백 포함, 초과 불가)
목표: ${promptLimit}자 ~ ${maxAllowed}자

작성 방법:
1. ${maxAllowed}자 제한을 인지하고 계획적으로 작성
2. 모든 문장은 완전한 종결어미로 끝냄
3. 최종 출력은 ${maxAllowed}자 이하, 완전한 문장으로 끝냄
`;
}
```

---

## 4. 페이지에서의 사용 예시

### React (Next.js) 기준

```javascript
"use client";

import { useState } from "react";
import { generateWithRetry, AVAILABLE_MODELS, DEFAULT_MODEL } from "../../utils/ollamaClient";
import { truncateToCompleteSentence, cleanMetaInfo, getCharacterGuideline } from "../../utils/textProcessor";

export default function MyPage() {
    const [result, setResult] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);

    const handleGenerate = async () => {
        setIsLoading(true);
        try {
            const systemMessage = "당신은 전문 작성 도우미입니다.";
            const prompt = `다음 주제로 글을 작성하세요: ...`;
            const additionalInstructions = ""; // 사용자 추가 지침 (선택)

            // 1. AI 생성
            const rawResult = await generateWithRetry({
                systemMessage,
                prompt,
                additionalInstructions,
                model: selectedModel,
            });

            // 2. 후처리 (글자수 제한 적용)
            const processed = truncateToCompleteSentence(rawResult, 500);

            setResult(processed);
        } catch (error) {
            console.error(error);
            alert(`생성 실패: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            {/* 모델 선택 UI */}
            <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
                {AVAILABLE_MODELS.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                ))}
            </select>

            <button onClick={handleGenerate} disabled={isLoading}>
                {isLoading ? "생성 중..." : "AI 생성"}
            </button>

            <textarea value={result} readOnly />
        </div>
    );
}
```

---

## 5. API 호출 핵심 정리

### 엔드포인트

| 항목 | 값 |
|------|-----|
| URL | `https://api.alluser.site/v1/chat/completions` |
| Method | `POST` |
| 인증 | `X-API-Key` 헤더 |
| Content-Type | `application/json` |

### Request Body

```json
{
    "model": "qwen3:8b",
    "messages": [
        { "role": "system", "content": "시스템 메시지" },
        { "role": "user", "content": "사용자 프롬프트" }
    ],
    "temperature": 0.7,
    "stream": false
}
```

### Response (OpenAI 호환 형식)

```json
{
    "choices": [
        {
            "message": {
                "role": "assistant",
                "content": "생성된 텍스트"
            }
        }
    ]
}
```

### 응답 텍스트 추출

```javascript
const data = await res.json();
const content = data.choices?.[0]?.message?.content || "";
```

---

## 6. Ollama 서버 관리 (Mac mini)

### 모델 예열 (cold start 방지)
```bash
# 모델을 24시간 동안 메모리에 유지
ollama run qwen3:8b "안녕" --keepalive 24h
```

### 상태 확인
```bash
ollama ps        # 현재 로드된 모델
ollama list      # 설치된 모델 목록
```

### 모델 상시 유지 (cron 자동화)
```bash
# crontab -e → 4분마다 ping으로 모델 유지
*/4 * * * * curl -s http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen3:8b","messages":[{"role":"user","content":"ping"}]}' \
  > /dev/null 2>&1
```

---

## 7. 디버깅 체크리스트

문제 발생 시 아래 순서대로 확인:

| # | 확인 사항 | 확인 방법 |
|---|-----------|-----------|
| 1 | Ollama 실행 중? | `ollama ps` |
| 2 | 모델 로드됨? | `ollama ps` → 모델명 표시 확인 |
| 3 | 로컬 API 응답? | `curl http://localhost:11434/v1/chat/completions -H "Content-Type: application/json" -d '{"model":"qwen3:8b","messages":[{"role":"user","content":"hi"}]}'` |
| 4 | 프록시 경유 응답? | `curl https://api.alluser.site/v1/chat/completions -H "Content-Type: application/json" -H "X-API-Key: YOUR_KEY" -d '{"model":"qwen3:8b","messages":[{"role":"user","content":"hi"}]}'` |
| 5 | Nginx 상태? | `sudo nginx -t` |
| 6 | CORS 에러? | 브라우저 콘솔 → `Access-Control-Allow-Origin` 에러 확인 |
| 7 | 모델 cold start? | `ollama run qwen3:8b "test" --keepalive 24h` |

---

## 8. 새 프로젝트 적용 체크리스트

1. ☐ `utils/ollamaClient.js` 복사 → API_URL, API_KEY 설정
2. ☐ `utils/textProcessor.js` 복사 (글자수 제한이 필요한 경우)
3. ☐ Nginx CORS에 새 도메인 추가
4. ☐ 사용할 모델 확인 (`ollama list`)
5. ☐ 모델 예열 (`ollama run MODEL "test" --keepalive 24h`)
6. ☐ 페이지에서 import 후 호출 테스트

---

## 9. 프롬프트 최적화 팁 (로컬 LLM 전용)

### Sandwich 기법
추가 지침을 LLM이 잘 따르도록 **시스템 메시지 + 프롬프트 앞 + 프롬프트 뒤** 3곳에 삽입:

```javascript
// 시스템 메시지에 추가
systemMessage += `\n\n사용자 추가 규칙:\n${instructions}`;

// 프롬프트 앞뒤에 감싸기
finalPrompt = `[최우선 규칙] ${instructions}\n\n` + prompt + `\n\n[다시 강조] ${instructions}`;
```

### 로컬 LLM 프롬프트 주의사항
- **긍정형 지시**: "~하지 마세요" 대신 "~만 사용하세요"
- **간결한 규칙**: 많은 규칙보다 핵심 5~7개만
- **예시 제공**: 좋은 출력 예시를 포함하면 품질 향상
- **메타 정보 제거**: AI가 "(약 300자)" 같은 메타 정보를 출력할 수 있으므로 후처리 필수
