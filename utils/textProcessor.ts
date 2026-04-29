const MAX_CHARS = 500; // 절대 상한선

/**
 * AI 출력에서 메타 정보(글자수, 분석 내용 등) 제거
 */
export function cleanMetaInfo(text: string): string {
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

/**
 * 상담 AI 요약에서는 모델의 작업 설명이 아니라 최종 요약 결과만 보여줍니다.
 */
export function cleanConsultationSummaryOutput(text: string): string {
    const cleaned = cleanMetaInfo(text);
    if (!cleaned) return cleaned;

    const finalOverviewSection = cleaned.lastIndexOf("【상담 개요】");
    const finalContentSection = cleaned.lastIndexOf("【상담 내용】");
    const summaryStart = finalOverviewSection >= 0 ? finalOverviewSection : finalContentSection;
    const summaryOnly = summaryStart >= 0 ? cleaned.slice(summaryStart).trim() : cleaned;

    const metaLinePattern = /(?:요청한\s*형식.*결과|재구성한\s*결과|요약\s*방식|규칙\s*준수|준수\s*함|문체\s*변화|내용\s*구조화|내용구조화|구조화\s*방식|작성\s*계획|작성계획|계획\s*검토|작성\s*방식|출력\s*형식|검토\s*과정|검토\s*결과|최종\s*점검|점검\s*메시지|분석\s*결과|마크다운\s*기호|사용\s*금지|형식\s*요구사항|요청\s*형식)/;
    const processListPattern = /^\s*(?:[-*]|\d+[.)])\s+/;
    let isDroppingProcessBlock = false;

    return summaryOnly
        .split(/\r?\n/)
        .filter(line => {
            const trimmed = line.trim();
            if (!trimmed) {
                isDroppingProcessBlock = false;
                return true;
            }

            if (/^【상담\s*(?:개요|내용)】$/.test(trimmed)) {
                isDroppingProcessBlock = false;
                return true;
            }

            if (metaLinePattern.test(trimmed)) {
                isDroppingProcessBlock = !/[.!?。]$/.test(trimmed);
                return false;
            }

            if (isDroppingProcessBlock && processListPattern.test(trimmed)) {
                return false;
            }

            isDroppingProcessBlock = false;
            return true;
        })
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function isCompleteSentence(text: string): boolean {
    if (!text) return false;
    return /[함음임됨봄옴줌춤움늠름다요까니][.!?]\s*$/.test(text.trim());
}

function splitIntoSentences(text: string): string[] {
    if (!text) return [];
    return text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
}

/**
 * 글자수 초과 시 마지막 완전한 문장까지만 유지
 * 
 * @param text        - AI 생성 텍스트
 * @param targetChars - 목표 글자수
 * @returns 잘라낸 텍스트
 */
export function truncateToCompleteSentence(text: string, targetChars: number): string {
    const cleaned = cleanMetaInfo(text);
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

/**
 * AI에게 보낼 글자수 관련 프롬프트 지침 생성
 * 
 * @param targetChars - 목표 글자수
 * @returns 프롬프트에 삽입할 지침 문자열
 */
export function getCharacterGuideline(targetChars: number): string {
    const maxAllowed = Math.min(targetChars, MAX_CHARS);

    // 짧은 글일수록 버퍼를 더 크게
    let bufferRatio: number;
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
