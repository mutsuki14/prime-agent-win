import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	existsSync: vi.fn(),
	spawnSync: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	// Module-load reads (config.ts) must see the real fs; tests override per case.
	mocks.existsSync.mockImplementation(actual.existsSync);
	return { ...actual, existsSync: mocks.existsSync };
});

vi.mock("child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof import("child_process")>();
	return { ...actual, spawnSync: mocks.spawnSync };
});

import { getShellConfig, resolveKernelBashShell } from "../src/utils/shell.js";
import { POWERSHELL_INVOCATION_ARGS, windowsInboxPowerShellPath } from "../src/utils/windows-process.js";

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");

function stubWin32(): void {
	Object.defineProperty(process, "platform", { value: "win32" });
}

afterEach(() => {
	if (originalPlatform) {
		Object.defineProperty(process, "platform", originalPlatform);
	}
	mocks.existsSync.mockClear();
	mocks.spawnSync.mockClear();
});

describe("resolveKernelBashShell on win32", () => {
	it("returns undefined without consulting PATH when no well-known shell exists", () => {
		stubWin32();
		mocks.existsSync.mockReturnValue(false);

		expect(resolveKernelBashShell()).toBeUndefined();
		expect(mocks.spawnSync).not.toHaveBeenCalled();
	});

	it("prefers PowerShell 7 over in-box Windows PowerShell", () => {
		stubWin32();
		const pwsh = String.raw`C:\Program Files\PowerShell\7\pwsh.exe`;
		mocks.existsSync.mockImplementation((path: string) => path === pwsh);

		expect(resolveKernelBashShell()).toBe(pwsh);
		expect(mocks.spawnSync).not.toHaveBeenCalled();
	});

	it("returns in-box Windows PowerShell when present", () => {
		stubWin32();
		const inbox = windowsInboxPowerShellPath();
		mocks.existsSync.mockImplementation((path: string) => path === inbox);

		expect(resolveKernelBashShell()).toBe(inbox);
		expect(mocks.spawnSync).not.toHaveBeenCalled();
	});

	it("returns the canonical Git Bash install path when PowerShell is absent", () => {
		stubWin32();
		const canonical = "C:\\Program Files\\Git\\bin\\bash.exe";
		mocks.existsSync.mockImplementation((path: string) => path === canonical);

		expect(resolveKernelBashShell()).toBe(canonical);
		expect(mocks.spawnSync).not.toHaveBeenCalled();
	});

	it("returns an explicit shellPath as-is", () => {
		stubWin32();
		mocks.existsSync.mockReturnValue(false);

		expect(resolveKernelBashShell("D:\\tools\\bash.exe")).toBe("D:\\tools\\bash.exe");
		expect(mocks.existsSync).not.toHaveBeenCalled();
	});
});

describe("getShellConfig on win32", () => {
	it("uses PowerShell invocation args for the default Windows shell", () => {
		stubWin32();
		const inbox = windowsInboxPowerShellPath();
		mocks.existsSync.mockImplementation((path: string) => path === inbox);

		expect(getShellConfig()).toEqual({
			shell: inbox,
			args: [...POWERSHELL_INVOCATION_ARGS],
		});
		expect(mocks.spawnSync).not.toHaveBeenCalled();
	});

	it("uses -c for an explicit POSIX shellPath", () => {
		stubWin32();
		mocks.existsSync.mockImplementation((path: string) => path === "D:\\tools\\bash.exe");

		expect(getShellConfig("D:\\tools\\bash.exe")).toEqual({
			shell: "D:\\tools\\bash.exe",
			args: ["-c"],
		});
	});
});
