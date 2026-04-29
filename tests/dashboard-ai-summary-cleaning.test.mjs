import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const dashboardSource = readFileSync(join(process.cwd(), "components", "dashboard.tsx"), "utf8");

test("dashboard cleans saved AI summaries before editing, saving, and rendering", () => {
    assert.ok(
        dashboardSource.includes("const getConsultationSummaryText = (value?: string | null) =>"),
        "저장된 AI 요약을 정리하는 공통 헬퍼가 필요합니다.",
    );
    assert.ok(
        dashboardSource.includes("setEditSummary(getConsultationSummaryText(consultation.aiSummary))"),
        "수정 폼에 기존 AI 요약을 불러올 때도 정리해야 합니다.",
    );
    assert.ok(
        dashboardSource.includes("aiSummary: withSummary ? getConsultationSummaryText(summary) : null"),
        "새 상담 저장 시 AI 요약을 다시 정리해야 합니다.",
    );
    assert.ok(
        dashboardSource.includes("const nextSummary = getConsultationSummaryText(editSummary).trim()"),
        "수정 저장 시 AI 요약을 다시 정리해야 합니다.",
    );
    assert.equal(
        [...dashboardSource.matchAll(/<MarkdownRenderer content={getConsultationSummaryText\(c\.aiSummary\)} \/>/g)].length,
        2,
        "목록과 학생 상세 화면 모두 저장된 AI 요약을 정리해서 렌더링해야 합니다.",
    );
    assert.ok(
        dashboardSource.includes("temperature: 0.2"),
        "상담 요약 생성은 e4b에서도 사고 과정 출력이 줄어들도록 낮은 temperature를 사용해야 합니다.",
    );
});
