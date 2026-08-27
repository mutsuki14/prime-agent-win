import type { ExecFileOptions, ExecFileSyncOptions, SpawnOptions, SpawnSyncOptions } from "node:child_process";

/** CREATE_NO_WINDOW — prevents a new console window for Windows child processes. */
export const WINDOWS_CREATE_NO_WINDOW = 0x08_00_00_00;

export const WINDOWS_HIDE = { windowsHide: true } as const;

type WindowsHideOptions = SpawnOptions | SpawnSyncOptions | ExecFileOptions | ExecFileSyncOptions;

/**
 * Merge `windowsHide: true` so Node does not allocate a console window on win32.
 * Harmless on other platforms (the option is ignored).
 */
export function withWindowsHide<T extends WindowsHideOptions | undefined>(
	options?: T,
): (T extends undefined ? SpawnOptions : T) & { windowsHide: true } {
	return { ...(options ?? {}), windowsHide: true } as (T extends undefined ? SpawnOptions : T) & {
		windowsHide: true;
	};
}

export function windowsSystemRoot(): string {
	return process.env.SystemRoot ?? "C:\\Windows";
}

/** In-box Windows PowerShell 5.1. Present on every supported Windows 11 install. */
export function windowsInboxPowerShellPath(): string {
	return `${windowsSystemRoot()}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
}

/** Canonical PowerShell 7+ install locations. Never PATH — same trust class as Git Bash. */
export const WINDOWS_PWSH_PATHS = [
	"C:\\Program Files\\PowerShell\\7\\pwsh.exe",
	"C:\\Program Files\\PowerShell\\7-preview\\pwsh.exe",
] as const;

export function isPowerShellExecutable(shellPath: string): boolean {
	const slash = shellPath.lastIndexOf("/");
	const backslash = shellPath.lastIndexOf("\\");
	const sep = Math.max(slash, backslash);
	const name = (sep >= 0 ? shellPath.slice(sep + 1) : shellPath).toLowerCase();
	return name === "powershell.exe" || name === "powershell" || name === "pwsh.exe" || name === "pwsh";
}

export const POWERSHELL_INVOCATION_ARGS = ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"] as const;

export function getShellInvocationArgs(shellPath: string): string[] {
	return isPowerShellExecutable(shellPath) ? [...POWERSHELL_INVOCATION_ARGS] : ["-c"];
}
