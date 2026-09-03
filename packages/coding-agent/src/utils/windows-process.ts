import {
	type ExecFileOptions,
	type ExecFileSyncOptions,
	type SpawnOptions,
	type SpawnSyncOptions,
	spawnSync,
} from "node:child_process";

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

/**
 * Absolute path of a System32 helper (taskkill.exe, where.exe, rundll32.exe, ...).
 * Built with backslashes on every host so tests and CI mocks see Windows paths.
 * Never resolve these helpers through PATH or CWD: a repo-controlled PATH could
 * supply a planted taskkill.exe.
 */
export function windowsSystem32Path(...parts: string[]): string {
	return [windowsSystemRoot().replace(/[\\/]+$/, ""), "System32", ...parts].join("\\");
}

/** In-box Windows PowerShell 5.1. Present on every supported Windows 11 install. */
export function windowsInboxPowerShellPath(): string {
	return windowsSystem32Path("WindowsPowerShell", "v1.0", "powershell.exe");
}

/** Canonical PowerShell 7+ install locations. Never PATH — same trust class as Git Bash. */
export const WINDOWS_PWSH_PATHS = [
	"C:\\Program Files\\PowerShell\\7\\pwsh.exe",
	"C:\\Program Files\\PowerShell\\7-preview\\pwsh.exe",
] as const;

/**
 * Canonical Git for Windows shells. Hardcoded literals: the ProgramFiles env
 * vars are ambient attacker-influenceable input, the same class as PATH.
 */
export const WINDOWS_GIT_BASH_PATHS = [
	"C:\\Program Files\\Git\\bin\\bash.exe",
	"C:\\Program Files (x86)\\Git\\bin\\bash.exe",
] as const;

export function isPowerShellExecutable(shellPath: string): boolean {
	const slash = shellPath.lastIndexOf("/");
	const backslash = shellPath.lastIndexOf("\\");
	const sep = Math.max(slash, backslash);
	const name = (sep >= 0 ? shellPath.slice(sep + 1) : shellPath).toLowerCase();
	return name === "powershell.exe" || name === "powershell" || name === "pwsh.exe" || name === "pwsh";
}

export const POWERSHELL_INVOCATION_ARGS = ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"] as const;

/**
 * Windows PowerShell 5.1 (and pwsh on a non-UTF-8 system locale) writes
 * redirected output in the OEM code page and pipes ASCII into native commands,
 * so any non-ASCII text (for example Chinese paths or file contents) reaches the
 * host as mojibake. Force UTF-8 without a BOM on both channels.
 */
export const POWERSHELL_SCRIPT_PREAMBLE =
	"try { $__primeUtf8 = [System.Text.UTF8Encoding]::new($false); [Console]::OutputEncoding = $__primeUtf8; $OutputEncoding = $__primeUtf8 } catch { }";

/**
 * `-Command` exits 1 for any failed last command regardless of the native exit
 * code. Propagate the real code the way `sh -c` does; an explicit `exit` in the
 * script still wins because it never reaches this line.
 */
export const POWERSHELL_SCRIPT_EXIT_TRAILER =
	"if (-not $?) { if ($LASTEXITCODE -is [int] -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; exit 1 }";

export function wrapPowerShellScript(script: string): string {
	return `${POWERSHELL_SCRIPT_PREAMBLE}\n${script}\n${POWERSHELL_SCRIPT_EXIT_TRAILER}`;
}

export function getShellInvocationArgs(shellPath: string): string[] {
	return isPowerShellExecutable(shellPath) ? [...POWERSHELL_INVOCATION_ARGS] : ["-c"];
}

/** Full argv tail (flags plus script) for running `command` in the given shell. */
export function buildShellCommandArgs(shellPath: string, command: string): string[] {
	return isPowerShellExecutable(shellPath)
		? [...POWERSHELL_INVOCATION_ARGS, wrapPowerShellScript(command)]
		: ["-c", command];
}

/** Environment for System32 helpers: cmd-style CWD lookup must never win. */
export function windowsHelperEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	return { ...env, NoDefaultCurrentDirectoryInExePath: "1" };
}

export function windowsTaskkillTreeArgs(pid: number): readonly string[] {
	return ["/F", "/T", "/PID", String(pid)];
}

/**
 * Kill a Windows process tree with the absolute System32 taskkill. Windows has
 * no process groups to signal, so `/T` is the only way to take descendants down
 * with the shell that spawned them. Returns true when taskkill reported success.
 */
export function killWindowsProcessTree(pid: number, options: { timeoutMs?: number } = {}): boolean {
	if (!Number.isInteger(pid) || pid <= 0) {
		return false;
	}
	const result = spawnSync(windowsSystem32Path("taskkill.exe"), [...windowsTaskkillTreeArgs(pid)], {
		stdio: "ignore",
		timeout: options.timeoutMs ?? 10_000,
		windowsHide: true,
		env: windowsHelperEnv(),
	});
	return result.status === 0;
}

/**
 * CPython on Windows opens text files with the ANSI code page (GBK on zh-CN)
 * unless UTF-8 mode is enabled, so UTF-8 source files read by the kernel would
 * be mis-decoded. Default the kernel to UTF-8 mode; an explicit PYTHONUTF8 wins.
 */
export function windowsPythonEnvDefaults(
	env: NodeJS.ProcessEnv = process.env,
	platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
	if (platform !== "win32" || env.PYTHONUTF8 !== undefined) {
		return {};
	}
	return { PYTHONUTF8: "1" };
}
