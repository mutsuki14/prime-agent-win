import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	spawnSync: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:child_process")>();
	return { ...actual, spawnSync: mocks.spawnSync };
});

import {
	buildShellCommandArgs,
	getShellInvocationArgs,
	isPowerShellExecutable,
	killWindowsProcessTree,
	POWERSHELL_INVOCATION_ARGS,
	POWERSHELL_SCRIPT_EXIT_TRAILER,
	POWERSHELL_SCRIPT_PREAMBLE,
	WINDOWS_GIT_BASH_PATHS,
	windowsHelperEnv,
	windowsInboxPowerShellPath,
	windowsPythonEnvDefaults,
	windowsSystem32Path,
	withWindowsHide,
	wrapPowerShellScript,
} from "../src/utils/windows-process.js";

function withSystemRoot<T>(value: string | undefined, run: () => T): T {
	const previous = process.env.SystemRoot;
	if (value === undefined) {
		delete process.env.SystemRoot;
	} else {
		process.env.SystemRoot = value;
	}
	try {
		return run();
	} finally {
		if (previous === undefined) {
			delete process.env.SystemRoot;
		} else {
			process.env.SystemRoot = previous;
		}
	}
}

afterEach(() => {
	mocks.spawnSync.mockReset();
});

describe("windows process helpers", () => {
	it("recognizes PowerShell executables by basename", () => {
		expect(isPowerShellExecutable(String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`)).toBe(true);
		expect(isPowerShellExecutable("pwsh.exe")).toBe(true);
		expect(isPowerShellExecutable("/usr/bin/pwsh")).toBe(true);
		expect(isPowerShellExecutable(String.raw`C:\Program Files\Git\bin\bash.exe`)).toBe(false);
	});

	it("uses -Command for PowerShell and -c for POSIX shells", () => {
		expect(getShellInvocationArgs("pwsh.exe")).toEqual([...POWERSHELL_INVOCATION_ARGS]);
		expect(getShellInvocationArgs("/bin/bash")).toEqual(["-c"]);
	});

	it("wraps PowerShell scripts with UTF-8 output and exit-code propagation", () => {
		const wrapped = wrapPowerShellScript("Get-ChildItem\n# trailing comment");
		const lines = wrapped.split("\n");
		expect(lines[0]).toBe(POWERSHELL_SCRIPT_PREAMBLE);
		expect(lines.slice(1, 3)).toEqual(["Get-ChildItem", "# trailing comment"]);
		expect(lines.at(-1)).toBe(POWERSHELL_SCRIPT_EXIT_TRAILER);
		expect(POWERSHELL_SCRIPT_PREAMBLE).toContain("[System.Text.UTF8Encoding]::new($false)");
		expect(POWERSHELL_SCRIPT_PREAMBLE).toContain("[Console]::OutputEncoding");
		expect(POWERSHELL_SCRIPT_PREAMBLE).toContain("$OutputEncoding");
		expect(POWERSHELL_SCRIPT_EXIT_TRAILER).toContain("exit $LASTEXITCODE");
	});

	it("builds the full argv tail per shell family", () => {
		expect(buildShellCommandArgs("/bin/sh", "echo hi")).toEqual(["-c", "echo hi"]);
		expect(buildShellCommandArgs(String.raw`C:\Program Files\PowerShell\7\pwsh.exe`, "Get-Location")).toEqual([
			...POWERSHELL_INVOCATION_ARGS,
			wrapPowerShellScript("Get-Location"),
		]);
	});

	it("always sets windowsHide", () => {
		expect(withWindowsHide({ cwd: "/tmp", detached: true })).toEqual({
			cwd: "/tmp",
			detached: true,
			windowsHide: true,
		});
		expect(withWindowsHide()).toEqual({ windowsHide: true });
	});

	it("resolves System32 helpers from SystemRoot with backslashes", () => {
		withSystemRoot(String.raw`D:\Win`, () => {
			expect(windowsInboxPowerShellPath()).toBe(String.raw`D:\Win\System32\WindowsPowerShell\v1.0\powershell.exe`);
			expect(windowsSystem32Path("taskkill.exe")).toBe(String.raw`D:\Win\System32\taskkill.exe`);
		});
		withSystemRoot("D:\\Win\\", () => {
			expect(windowsSystem32Path("where.exe")).toBe(String.raw`D:\Win\System32\where.exe`);
		});
		withSystemRoot(undefined, () => {
			expect(windowsSystem32Path("rundll32.exe")).toBe(String.raw`C:\Windows\System32\rundll32.exe`);
		});
	});

	it("hardcodes the Git Bash install paths", () => {
		expect(WINDOWS_GIT_BASH_PATHS).toEqual([
			String.raw`C:\Program Files\Git\bin\bash.exe`,
			String.raw`C:\Program Files (x86)\Git\bin\bash.exe`,
		]);
	});

	it("disables CWD lookup for System32 helpers", () => {
		expect(windowsHelperEnv({ PATH: "x" })).toEqual({ PATH: "x", NoDefaultCurrentDirectoryInExePath: "1" });
	});

	it("kills a Windows process tree with the absolute taskkill", () => {
		mocks.spawnSync.mockReturnValue({ status: 0 });
		withSystemRoot(String.raw`C:\Windows`, () => {
			expect(killWindowsProcessTree(4321)).toBe(true);
		});
		expect(mocks.spawnSync).toHaveBeenCalledWith(
			String.raw`C:\Windows\System32\taskkill.exe`,
			["/F", "/T", "/PID", "4321"],
			expect.objectContaining({
				stdio: "ignore",
				windowsHide: true,
				env: expect.objectContaining({ NoDefaultCurrentDirectoryInExePath: "1" }),
			}),
		);

		mocks.spawnSync.mockReturnValue({ status: 128 });
		expect(killWindowsProcessTree(4321)).toBe(false);
		expect(killWindowsProcessTree(0)).toBe(false);
	});

	it("defaults the kernel to Python UTF-8 mode only on win32", () => {
		expect(windowsPythonEnvDefaults({}, "win32")).toEqual({ PYTHONUTF8: "1" });
		expect(windowsPythonEnvDefaults({ PYTHONUTF8: "0" }, "win32")).toEqual({});
		expect(windowsPythonEnvDefaults({}, "linux")).toEqual({});
		expect(windowsPythonEnvDefaults({}, "darwin")).toEqual({});
	});
});
