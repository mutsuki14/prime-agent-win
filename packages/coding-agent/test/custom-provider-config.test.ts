import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	CUSTOM_OPENAI_COMPATIBLE_LOGIN_ID,
	normalizeCustomProviderApiKey,
	normalizeCustomProviderBaseUrl,
	normalizeCustomProviderId,
	normalizeCustomProviderModelId,
	upsertCustomProviderInModelsJson,
} from "../src/core/custom-provider-config.js";

describe("custom provider config", () => {
	let tempDir: string;
	let modelsJsonPath: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `prime-agent-custom-provider-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(tempDir, { recursive: true });
		modelsJsonPath = join(tempDir, "models.json");
	});

	afterEach(() => {
		if (existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("normalizes a valid provider id", () => {
		expect(normalizeCustomProviderId(" Ollama ")).toBe("ollama");
	});

	it("rejects invalid provider ids", () => {
		expect(() => normalizeCustomProviderId("")).toThrow("required");
		expect(() => normalizeCustomProviderId("My Proxy")).toThrow("lowercase");
		expect(() => normalizeCustomProviderId("1local")).toThrow("start with a letter");
		expect(() => normalizeCustomProviderId("bad--id")).toThrow("consecutive");
		expect(() => normalizeCustomProviderId(CUSTOM_OPENAI_COMPATIBLE_LOGIN_ID)).toThrow("reserved");
	});

	it("normalizes and validates a base URL", () => {
		expect(normalizeCustomProviderBaseUrl("http://localhost:11434/v1/")).toBe("http://localhost:11434/v1");
		expect(() => normalizeCustomProviderBaseUrl("localhost:11434")).toThrow("http");
		expect(() => normalizeCustomProviderBaseUrl("ftp://x")).toThrow("http:// or https://");
	});

	it("requires an API key and model id", () => {
		expect(normalizeCustomProviderApiKey(" ollama ")).toBe("ollama");
		expect(() => normalizeCustomProviderApiKey("  ")).toThrow("API key");
		expect(normalizeCustomProviderModelId("llama3.1:8b")).toBe("llama3.1:8b");
		expect(() => normalizeCustomProviderModelId("")).toThrow("Model id");
	});

	it("writes a new OpenAI-compatible provider to models.json", () => {
		upsertCustomProviderInModelsJson(modelsJsonPath, {
			providerId: "ollama",
			baseUrl: "http://localhost:11434/v1",
			apiKey: "ollama",
			modelId: "llama3.1:8b",
		});

		const written = JSON.parse(readFileSync(modelsJsonPath, "utf-8")) as {
			providers: Record<string, { api: string; models: Array<{ id: string }> }>;
		};
		expect(written.providers.ollama.api).toBe("openai-completions");
		expect(written.providers.ollama.models.map((model) => model.id)).toEqual(["llama3.1:8b"]);
	});

	it("appends a model when the provider already exists", () => {
		upsertCustomProviderInModelsJson(modelsJsonPath, {
			providerId: "ollama",
			baseUrl: "http://localhost:11434/v1",
			apiKey: "ollama",
			modelId: "llama3.1:8b",
		});
		upsertCustomProviderInModelsJson(modelsJsonPath, {
			providerId: "ollama",
			baseUrl: "http://127.0.0.1:11434/v1",
			apiKey: "ollama",
			modelId: "qwen2.5-coder:7b",
		});

		const written = JSON.parse(readFileSync(modelsJsonPath, "utf-8")) as {
			providers: Record<string, { baseUrl: string; models: Array<{ id: string }> }>;
		};
		expect(written.providers.ollama.baseUrl).toBe("http://127.0.0.1:11434/v1");
		expect(written.providers.ollama.models.map((model) => model.id)).toEqual(["llama3.1:8b", "qwen2.5-coder:7b"]);
	});
});
