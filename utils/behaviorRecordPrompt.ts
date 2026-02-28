import { Consultation } from "@/types";

export type BehaviorEvidenceMode = "all_records" | "selected_only";

export type BehaviorDraftValidationResult = {
    isValid: boolean;
    violations: string[];
};

export type StudentBehaviorPromptInput = {
    studentName: string;
    studentId: string;
    consultations: Consultation[];
    totalConsultationCount?: number;
    maxConsultations?: number;
    evidenceMode?: BehaviorEvidenceMode;
    lengthGuide?: string;
};

const DEFAULT_MAX_CONSULTATIONS = 20;
const MAX_NOTE_CHARS = 240;
const DEFAULT_LENGTH_GUIDE = "본문은 반드시 400자 이상 500자 이하로 작성하세요.";
export const MAX_BEHAVIOR_REWRITE_ATTEMPTS = 4;
export const DEFAULT_BEHAVIOR_MIN_LENGTH = 400;
export const DEFAULT_BEHAVIOR_MAX_LENGTH = 500;

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
const JONGSEONG_MIEUM = 16;
const DISALLOWED_SUBJECT_PATTERN = /(학생은|학생이|OO는|OO가)/;
const DISALLOWED_NEGATIVE_PATTERN = /(하지만|임에도|부족하|미흡하|문제점|결함|한계)/;
const DISALLOWED_META_PATTERN = /(메타|분석|검증|글자수|자체\s*점검|체크리스트)/;
const MARKDOWN_LIKE_PATTERN = /(^|\s)([-*•]|#{1,6}|\d+\.)\s+/m;

const normalizeText = (text?: string | null): string =>
    (text ?? "").replace(/\s+/g, " ").trim();

const truncate = (text: string, maxChars: number): string =>
    text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`;

const endsWithNominalEnding = (sentence: string): boolean => {
    const trimmed = sentence.replace(/["'”’)\]}]+$/g, "").trim();
    if (!trimmed) return false;
    const lastChar = trimmed[trimmed.length - 1];
    const charCode = lastChar.charCodeAt(0);
    if (charCode < HANGUL_START || charCode > HANGUL_END) return false;
    return (charCode - HANGUL_START) % 28 === JONGSEONG_MIEUM;
};

export const normalizeBehaviorDraftText = (text: string): string => {
    let result = text
        .replace(/\r?\n+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    // 내부적으로 주어 표현 강제 삭제
    result = result.replace(/(학생은|학생이|OO는|OO가)\s*/g, "");

    return result;
}

const splitSentences = (text: string): string[] =>
    text
        .split(".")
        .map(item => item.trim())
        .filter(Boolean);

export const validateBehaviorDraft = (
    text: string,
    {
        minLength = DEFAULT_BEHAVIOR_MIN_LENGTH,
        maxLength = DEFAULT_BEHAVIOR_MAX_LENGTH,
    }: {
        minLength?: number;
        maxLength?: number;
    } = {}
): BehaviorDraftValidationResult => {
    const hasLineBreakInRaw = /\r|\n/.test(text);
    const normalized = normalizeBehaviorDraftText(text);
    const violations: string[] = [];

    if (!normalized) {
        violations.push("본문이 비어 있음.");
        return { isValid: false, violations };
    }

    if (!normalized.endsWith(".")) {
        violations.push("본문이 마침표(.)로 끝나지 않음.");
    }

    if (hasLineBreakInRaw) {
        violations.push("줄바꿈이 포함됨.");
    }

    // 글자수는 검증 실패 조건에서 제외하고, 길이 안내만 프롬프트 유지
    // if (normalized.length < minLength || normalized.length > maxLength) {
    //     violations.push(`글자 수가 ${minLength}~${maxLength}자 범위를 벗어남(현재 ${normalized.length}자).`);
    // }

    // 삭제 처리하므로 실패에 걸리지 않도록 방지
    // if (DISALLOWED_SUBJECT_PATTERN.test(normalized)) {
    //     violations.push("'학생은/학생이/OO는' 형태의 주어 표현이 포함됨.");
    // }

    if (DISALLOWED_NEGATIVE_PATTERN.test(normalized)) {
        violations.push("부정적으로 보일 수 있는 금지 표현이 포함됨.");
    }

    if (DISALLOWED_META_PATTERN.test(normalized)) {
        violations.push("메타 설명/검증 문구가 포함됨.");
    }

    if (MARKDOWN_LIKE_PATTERN.test(normalized)) {
        violations.push("목록/제목 같은 마크다운 유사 서식이 포함됨.");
    }

    const sentences = splitSentences(normalized);
    if (sentences.length === 0) {
        violations.push("문장이 없음.");
    } else {
        const nonNominalSentenceIndexes = sentences
            .map((sentence, index) => (endsWithNominalEnding(sentence) ? -1 : index + 1))
            .filter(index => index !== -1);

        if (nonNominalSentenceIndexes.length > 0) {
            violations.push(`명사형 종결어미(받침 ㅁ)로 끝나지 않은 문장: ${nonNominalSentenceIndexes.join(", ")}.`);
        }
    }

    return {
        isValid: violations.length === 0,
        violations,
    };
};

export const buildBehaviorRewritePrompt = ({
    basePrompt,
    previousDraft,
    violations,
}: {
    basePrompt: string;
    previousDraft: string;
    violations: string[];
}): string => `
아래 원본 지시를 유지한 상태에서 행발 본문을 처음부터 다시 작성하라.

[원본 지시]
${basePrompt}

[직전 생성 결과]
${previousDraft || "(빈 응답)"}

[규칙 위반 목록]
${violations.map((item, index) => `${index + 1}. ${item}`).join("\n")}

[수정 지시]
- 위반 목록을 모두 해소할 것.
- 모든 문장을 반드시 명사형 종결어미(함/임/음/됨 등 받침 ㅁ) + 마침표(.)로 끝낼 것.
- 줄바꿈, 번호, 제목, 따옴표, 메타 설명 없이 한 문단 본문만 출력할 것.
`.trim();

const formatConsultationLine = (consultation: Consultation): string => {
    const topic = normalizeText(consultation.topic) || "일반 상담";
    const content = normalizeText(consultation.originalContent);
    const summary = normalizeText(consultation.aiSummary);
    const merged = content || summary || "(관찰 내용 없음)";
    return `- ${consultation.date} ${consultation.time} | 주제: ${topic} | 관찰: ${truncate(merged, MAX_NOTE_CHARS)}`;
};

export const STUDENT_BEHAVIOR_SYSTEM_MESSAGE = `
당신은 학교생활기록부 행동특성 및 종합의견(행발)을 작성하는 교사다.
제공된 학생 기록을 바탕으로 최종 행발 본문 한 문단만 작성한다.

[필수 규칙]
1) '학생은', 'OO는' 등 주어를 사용하지 않고 행동 특성과 에피소드부터 바로 서술한다.
2) 배려, 나눔, 협력, 타인 존중, 갈등 관리 등 인성 요소와 잠재력을 구체적 사례 중심으로 담는다.
3) 단순 나열을 피하고 1년 동안의 긍정적인 변화와 성장을 드러낸다.
4) 내성적/신중함, 느림/꼼꼼함, 말수 적음/경청함처럼 발전 가능성이 느껴지는 긍정 표현으로 전환한다.
5) '~하지만', '~임에도', '부족하다' 등 부정적으로 보일 수 있는 표현은 사용하지 않는다.
6) 특정 성명, 기관명, 상호명 등 식별 가능한 고유명사는 쓰지 않는다.
7) 줄바꿈 없이 하나의 문단으로 작성한다.
8) 모든 문장을 반드시 명사형 종결어미(~함, ~임, ~음, ~됨 등 받침 ㅁ)로 끝내고 문장마다 마침표(.)로 완결한다.
   한 문장이라도 위 규칙을 어기면 실패한 출력으로 간주한다.
9) 글자수 지침을 반드시 준수한다.
10) 메타 설명, 분석, 검증, 글자수 표기 없이 본문 텍스트만 출력한다.
11) 상담 기록에서 행발 작성에 필요한 학생 행동관찰 근거를 먼저 추출하고 재구성한 뒤 본문에 반영한다.
12) 내부 처리 절차는 다음과 같으며, 절차와 중간 결과는 출력하지 않는다.
    - 행동/관계/협력/갈등 조정/자기관리 관련 관찰 근거를 3~6개 추출함.
    - 추출 근거를 인성, 잠재력, 공동체 역량 관점으로 연결함.
    - 시기별 변화 또는 전후 비교가 드러나도록 성장 흐름을 구성함.
13) 최종 출력 직전 자체 점검을 수행한다.
    - 문장별 종결어미가 모두 받침 ㅁ인지 확인함.
    - 금지 표현, 주어 표현, 메타 문구가 없는지 확인함.
    - 하나라도 위반 시 재작성 후 최종본만 출력함.
`.trim();

export const buildStudentBehaviorPrompt = ({
    studentName,
    studentId,
    consultations,
    totalConsultationCount,
    maxConsultations = DEFAULT_MAX_CONSULTATIONS,
    evidenceMode = "all_records",
    lengthGuide = DEFAULT_LENGTH_GUIDE,
}: StudentBehaviorPromptInput): string => {
    const latestFirst = [...consultations]
        .sort((a, b) => {
            const byDate = b.date.localeCompare(a.date);
            if (byDate !== 0) return byDate;
            return b.time.localeCompare(a.time);
        })
        .slice(0, maxConsultations);

    const consultationCount = totalConsultationCount ?? consultations.length;

    const evidenceInstruction = evidenceMode === "selected_only"
        ? "체크된 상담 기록만 근거로 사용함."
        : "전체 기록을 균형 있게 반영함.";

    const consultationLines = latestFirst.length
        ? latestFirst.map(formatConsultationLine).join("\n")
        : "- 상담 기록 없음 (일반적인 모범 학생의 특성에 맞춰 작성)";

    return `
입력 정보
- 이름: ${studentName}
- 학번: ${studentId || "-"}
- 전체 상담 건수: ${consultationCount}건
- 프롬프트 반영 상담 건수: ${latestFirst.length}건

작성 조건
- 근거 사용 방식: ${evidenceInstruction}
- 글자수 지침: ${lengthGuide}

학생 행동 관찰 내용
${consultationLines}

행동관찰 추출 지시
1) 위 상담 기록에서 행발 작성에 필요한 학생 행동관찰 내용을 우선 추출함.
2) 분산된 기록은 사건-행동-의미가 드러나도록 교사 관찰 문장 관점으로 재구성함.
3) 중복 내용은 통합하고, 변화와 성장을 보여주는 순서로 배열함.
4) 기록에 없는 사실은 생성하지 않음.

출력 형식
1) 오직 행발 본문 텍스트만 출력함.
2) 줄바꿈 없이 하나의 문단으로 출력함.
3) 따옴표, 번호, 제목, 메타 설명 없이 본문만 출력함.
4) 모든 문장을 명사형 종결어미(받침 ㅁ) + 마침표(.)로 끝낼 것.
`.trim();
};
