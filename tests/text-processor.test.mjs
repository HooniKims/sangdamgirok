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
