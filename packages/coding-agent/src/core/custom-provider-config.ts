import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";

export const CUSTOM_OPENAI_COMPATIBLE_LOGIN_ID = "__custom_openai_compatible__";
export const CUSTOM_OPENAI_COMPATIBLE_LOGIN_NAME = "Custom OpenAI-compatible";

const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export type CustomOpenAIProviderInput = {
	providerId: string;
	name?: string;
	baseUrl: string;
	apiKey: string;
	modelId: string;
	api?: string;
};

type ModelsJsonProvider = {
	name?: string;
	baseUrl?: string;
	apiKey?: string;
	api?: string;
	compat?: Record<string, unknown>;
	models?: Array<{ id: string; name?: string }>;
	[key: string]: unknown;
};

type ModelsJsonFile = {
	providers: Record<string, ModelsJsonProvider>;
};

function stripJsonComments(input: string): string {
	return input
		.replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*/g, (m) => (m[0] === '"' ? m : ""))
		.replace(/"(?:\\.|[^"\\])*"|,(\s*[}\]])/g, (m, tail) => tail ?? (m[0] === '"' ? m : ""));
}

export function normalizeCustomProviderId(raw: string): string {
	const providerId = raw.trim().toLowerCase();
	if (!providerId) {
		throw new Error("Provider id is required.");
	}
	if (providerId === CUSTOM_OPENAI_COMPATIBLE_LOGIN_ID) {
		throw new Error("That provider id is reserved.");
	}
	if (providerId.length > 64 || !PROVIDER_ID_PATTERN.test(providerId)) {
		throw new Error("Provider id must be lowercase letters, digits, and hyphens, and start with a letter.");
	}
	if (providerId.startsWith("-") || providerId.endsWith("-") || providerId.includes("--")) {
		throw new Error("Provider id must not start or end with a hyphen, or contain consecutive hyphens.");
	}
	return providerId;
}

export function normalizeCustomProviderBaseUrl(raw: string): string {
	const baseUrl = raw.trim().replace(/\/+$/, "");
	if (!baseUrl) {
		throw new Error("Base URL is required.");
	}
	let parsed: URL;
	try {
		parsed = new URL(baseUrl);
	} catch {
		throw new Error("Base URL must be a valid http(s) URL, for example http://localhost:11434/v1.");
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error("Base URL must start with http:// or https://.");
	}
	return baseUrl;
}

export function normalizeCustomProviderApiKey(raw: string): string {
	const apiKey = raw.trim();
	if (!apiKey) {
		throw new Error("API key is required. Local servers can use any value, for example ollama.");
	}
	return apiKey;
}

export function normalizeCustomProviderModelId(raw: string): string {
	const modelId = raw.trim();
	if (!modelId) {
		throw new Error("Model id is required.");
	}
	return modelId;
}

export function upsertCustomProviderInModelsJson(modelsJsonPath: string, input: CustomOpenAIProviderInput): void {
	const providerId = normalizeCustomProviderId(input.providerId);
	const baseUrl = normalizeCustomProviderBaseUrl(input.baseUrl);
	const apiKey = normalizeCustomProviderApiKey(input.apiKey);
	const modelId = normalizeCustomProviderModelId(input.modelId);
	const api = input.api?.trim() || "openai-completions";

	let config: ModelsJsonFile = { providers: {} };
	if (existsSync(modelsJsonPath)) {
		const parsed = JSON.parse(stripJsonComments(readFileSync(modelsJsonPath, "utf-8"))) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			throw new Error("models.json must be an object.");
		}
		const providers = (parsed as { providers?: unknown }).providers;
		if (providers && (typeof providers !== "object" || Array.isArray(providers))) {
			throw new Error("models.json providers must be an object.");
		}
		config = { providers: { ...((providers as Record<string, ModelsJsonProvider> | undefined) ?? {}) } };
	}

	const existing = config.providers[providerId] ?? {};
	const models = [...(existing.models ?? [])];
	if (!models.some((model) => model.id === modelId)) {
		models.push({ id: modelId, name: input.name ? `${input.name} (${modelId})` : modelId });
	}

	config.providers[providerId] = {
		...existing,
		name: input.name?.trim() || existing.name || providerId,
		baseUrl,
		apiKey,
		api,
		models,
		compat: existing.compat ?? {
			supportsDeveloperRole: false,
			supportsReasoningEffort: false,
		},
	};

	mkdirSync(dirname(modelsJsonPath), { recursive: true });
	const tmpPath = join(dirname(modelsJsonPath), `.models.json.${process.pid}.tmp`);
	writeFileSync(tmpPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
	renameSync(tmpPath, modelsJsonPath);
}
