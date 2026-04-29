import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = process.cwd();
const clientPath = join(repoRoot, "utils", "localLlmClient.ts");

function readSource(relativePath) {
    return readFileSync(join(repoRoot, relativePath), "utf8");
}

function walkFiles(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    return entries.flatMap(entry => {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) return walkFiles(fullPath);
        return statSync(fullPath).isFile() ? [fullPath] : [];
    });
}

test("local LLM client exposes only the approved LM Studio model contract", () => {
    assert.equal(existsSync(clientPath), true, "utils/localLlmClient.ts 파일이 있어야 합니다.");

    const source = readFileSync(clientPath, "utf8");
    const availableModelsBlock = source.match(/export const AVAILABLE_MODELS = \[([\s\S]*?)\] as const;/)?.[1] ?? "";

    const expectedModels = [
        {
            id: "gemma4:e2b",
            name: "Gemma 4 E2B",
            description: "기본 모델, 빠르고 안정적",
            requestModel: "google/gemma-4-e2b",
            maxTokens: 2048,
            label: "Gemma 4 E2B - 기본 모델, 빠르고 안정적",
        },
        {
            id: "gemma4:e4b",
            name: "Gemma 4 E4B",
            description: "품질 높음, 설명 출력 가능성 있음",
            requestModel: "google/gemma-4-e4b",
            maxTokens: 3072,
            label: "Gemma 4 E4B - 품질 높음, 설명 출력 가능성 있음",
        },
        {
            id: "lmstudio:gemma-4-26b-a4b-it-q4ks",
            name: "Gemma 4 26B Q4",
            description: "느리지만 품질 높음",
            requestModel: "gemma-4-26b-a4b-it",
            maxTokens: 4096,
            label: "Gemma 4 26B Q4 - 느리지만 품질 높음",
        },
    ];

    assert.equal(
        [...availableModelsBlock.matchAll(/\bid: "/g)].length,
        expectedModels.length,
        "허용된 3개 모델만 남아 있어야 합니다.",
    );
    assert.match(source, /export const DEFAULT_MODEL = "gemma4:e2b"/);
    assert.match(source, /LOCAL_LLM_CHAT_COMPLETIONS_ENDPOINT = "https:\/\/lm\.alluser\.site\/v1\/chat\/completions"/);
    assert.match(source, /model: modelConfig\.requestModel/);
    assert.match(source, /reasoning_effort: "none"/);
    assert.match(source, /stream/);
    assert.match(source, /max_tokens: maxTokens/);
    assert.match(source, /type LocalLlmRequestOptions = \{ temperature\?: number; stream\?: boolean; maxTokens\?: number \}/);
    assert.match(source, /options: LocalLlmRequestOptions = \{\}/);

    for (const model of expectedModels) {
        assert.ok(availableModelsBlock.includes(`id: "${model.id}"`), `${model.id} 표시 ID가 필요합니다.`);
        assert.ok(availableModelsBlock.includes(`name: "${model.name}"`), `${model.id} 표시 이름이 필요합니다.`);
        assert.ok(availableModelsBlock.includes(`description: "${model.description}"`), `${model.id} 설명이 필요합니다.`);
        assert.ok(availableModelsBlock.includes(`requestModel: "${model.requestModel}"`), `${model.id} 요청 model 매핑이 필요합니다.`);
        assert.ok(availableModelsBlock.includes(`maxTokens: ${model.maxTokens}`), `${model.id} max_tokens 기본값이 필요합니다.`);
        assert.ok(source.includes(`return \`${"${model.name}"} - ${"${model.description}"}\`;`), "공통 라벨 헬퍼가 필요합니다.");
        assert.ok(source.includes(model.label.split(" - ")[0]), `${model.label} 라벨 구성 요소가 필요합니다.`);
    }
});

test("production source does not keep old OpenAI or proxy markers", () => {
    const productionRoots = ["app", "components", "lib", "utils", "types"];
    const productionFiles = productionRoots.flatMap(root => walkFiles(join(repoRoot, root)));
    const disallowedMarkers = [
        "api." + "openai.com",
        "OpenAI API " + "key",
        "api." + "alluser.site",
        "gemma4:" + "26b",
    ];

    for (const filePath of productionFiles) {
        const content = readFileSync(filePath, "utf8");
        for (const marker of disallowedMarkers) {
            assert.equal(content.includes(marker), false, `${filePath}에 금지 문자열 ${marker}이 남아 있습니다.`);
        }
    }
});

test("OpenAI package dependency is not installed for local-only generation", () => {
    const packageJson = JSON.parse(readSource("package.json"));
    assert.equal(packageJson.dependencies?.openai, undefined);
    assert.equal(packageJson.devDependencies?.openai, undefined);
});
