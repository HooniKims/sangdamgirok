import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const repoRoot = process.cwd();

function loadTextProcessor() {
    const source = readFileSync(join(repoRoot, "utils", "textProcessor.ts"), "utf8");
    const compiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
    }).outputText;

    const testModule = { exports: {} };
    vm.runInNewContext(compiled, {
        console,
        exports: testModule.exports,
        module: testModule,
        require,
    });
    return testModule.exports;
}

test("consultation summary cleaner removes model process notes before the actual result", () => {
    const { cleanConsultationSummaryOutput } = loadTextProcessor();
    const raw = `
규칙 준수: 마크다운 기호를 사용하지 않았습니다.
문체 변화: 상담 내용을 공식적인 문체로 바꾸었습니다.
구조화: 상담 개요와 상담 내용으로 나누었습니다.

【상담 개요】
진로 고민에 대한 상담.

【상담 내용】
• 학생이 진로 선택에 대한 고민을 표현함.
`.trim();

    assert.equal(
        cleanConsultationSummaryOutput(raw),
        `【상담 개요】
진로 고민에 대한 상담.

【상담 내용】
• 학생이 진로 선택에 대한 고민을 표현함.`,
    );
});

test("consultation summary cleaner keeps an already clean summary unchanged", () => {
    const { cleanConsultationSummaryOutput } = loadTextProcessor();
    const summary = `【상담 개요】
학습 태도 점검.

【상담 내용】
• 수업 집중도 향상 방안을 함께 확인함.`;

    assert.equal(cleanConsultationSummaryOutput(summary), summary);
});

test("consultation summary cleaner removes process planning blocks inside summary sections", () => {
    const { cleanConsultationSummaryOutput } = loadTextProcessor();
    const raw = `【상담 개요】
작성계획 검토
- 원본 내용을 확인함
- 상담 내용을 두 섹션으로 나누어 정리함
진로 선택에 대한 상담.

【상담 내용】
내용구조화
- 상담 주제와 학생 반응을 분리함
• 학생이 진로 선택에 대한 부담을 표현함.
내용 구조화: 원본 내용을 포멀한 문체로 정리함.
• 희망 분야를 구체화하기 위한 추가 탐색이 필요함.`;

    assert.equal(
        cleanConsultationSummaryOutput(raw),
        `【상담 개요】
진로 선택에 대한 상담.

【상담 내용】
• 학생이 진로 선택에 대한 부담을 표현함.
• 희망 분야를 구체화하기 위한 추가 탐색이 필요함.`,
    );
});

test("consultation summary cleaner ignores quoted format rules before the final summary", () => {
    const { cleanConsultationSummaryOutput } = loadTextProcessor();
    const raw = `작성 계획 검토 및 실행 과정
1. 출력 첫 글자는 반드시 "【상담 개요】"의 "【"여야 한다. (준수)
2. 내용 분석 및 변환을 수행함.

(Output Generation)【상담 개요】
진로 선택에 대한 고민과 발표 상황에서의 자신감 부족 문제를 다룸.

【상담 내용】
• 학생이 진로 선택 과정에서 여러 관심 분야로 인해 결정을 어려워함.
• 과학 탐구 활동에는 적극적으로 참여하나 발표 상황에서는 자신감 부족을 경험함.`;

    assert.equal(
        cleanConsultationSummaryOutput(raw),
        `【상담 개요】
진로 선택에 대한 고민과 발표 상황에서의 자신감 부족 문제를 다룸.

【상담 내용】
• 학생이 진로 선택 과정에서 여러 관심 분야로 인해 결정을 어려워함.
• 과학 탐구 활동에는 적극적으로 참여하나 발표 상황에서는 자신감 부족을 경험함.`,
    );
});

test("consultation summary cleaner removes explanatory review and final check messages", () => {
    const { cleanConsultationSummaryOutput } = loadTextProcessor();
    const raw = `이번에는 요청한 형식에 맞추어 상담 내용을 포멀하고 공식적인 문체로 재구성한 결과입니다.

【상담 개요】
학습 태도 및 과제 수행 상황 점검

마크다운 기호 사용 금지: 준수함.
검토 과정: 원본 상담 내용만 반영함.
최종 점검 메시지: 형식 요구사항을 확인함.

【상담 내용】
• 학생은 최근 과제 제출이 늦어진 이유로 일정 관리의 어려움을 언급함.
• 교사는 과제 수행 일정을 작게 나누어 확인하는 방안을 안내함.
최종 점검: 상담 요약이 요청 형식에 맞게 작성됨.`;

    assert.equal(
        cleanConsultationSummaryOutput(raw),
        `【상담 개요】
학습 태도 및 과제 수행 상황 점검

【상담 내용】
• 학생은 최근 과제 제출이 늦어진 이유로 일정 관리의 어려움을 언급함.
• 교사는 과제 수행 일정을 작게 나누어 확인하는 방안을 안내함.`,
    );
});

test("consultation summary cleaner removes thinking simulation text from saved summaries", () => {
    const { cleanConsultationSummaryOutput } = loadTextProcessor();
    const raw = `생각 과정 시뮬레이션

1. 목표 확인: 학교 교사 역할로 학생 상담 기록을 포멀하고 공식적인 문체로 재정리한다.
2. 형식 적용: 제목은 【】, 불릿은 •, 중요 키워드는 「」를 사용해야 한다.
3. 내용 추출 및 요약을 진행한다.
4. 검토: 모든 제약 조건을 준수했는지 확인한다.
5. 최종 출력물 생성. (이 과정이 아래의 최종 결과물이 된다.)【상담 개요】
학생의 학교 등교에 대한 부담감과 의무교육 유예 절차에 관한 논의가 이루어짐.

【상담 내용】
• 학생은 현재 학교 등교 자체를 힘들어하고 있으며, 학업 중단 숙려제 방식에도 부담을 느끼고 있음.
• 학교 측에서는 유예 관련 공식 회의 이후 보호자에게 구체적인 절차를 다시 안내할 계획임.`;

    assert.equal(
        cleanConsultationSummaryOutput(raw),
        `【상담 개요】
학생의 학교 등교에 대한 부담감과 의무교육 유예 절차에 관한 논의가 이루어짐.

【상담 내용】
• 학생은 현재 학교 등교 자체를 힘들어하고 있으며, 학업 중단 숙려제 방식에도 부담을 느끼고 있음.
• 학교 측에서는 유예 관련 공식 회의 이후 보호자에게 구체적인 절차를 다시 안내할 계획임.`,
    );
});
