import { describe, expect, it } from "vitest";
import {
	getShellInvocationArgs,
	isPowerShellExecutable,
	POWERSHELL_INVOCATION_ARGS,
	windowsInboxPowerShellPath,
	withWindowsHide,
} from "../src/utils/windows-process.js";

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

	it("always sets windowsHide", () => {
		expect(withWindowsHide({ cwd: "/tmp", detached: true })).toEqual({
			cwd: "/tmp",
			detached: true,
			windowsHide: true,
		});
		expect(withWindowsHide()).toEqual({ windowsHide: true });
	});

	it("resolves in-box Windows PowerShell from SystemRoot", () => {
		const previous = process.env.SystemRoot;
		process.env.SystemRoot = String.raw`D:\Win`;
		try {
			expect(windowsInboxPowerShellPath()).toBe(String.raw`D:\Win\System32\WindowsPowerShell\v1.0\powershell.exe`);
		} finally {
			if (previous === undefined) {
				delete process.env.SystemRoot;
			} else {
				process.env.SystemRoot = previous;
			}
		}
	});
});
