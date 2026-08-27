import { existsSync } from "node:fs";
import { delimiter } from "node:path";
import { spawn, spawnSync } from "child_process";
import { getBinDir } from "../config.js";
import { recordOrphanProcessState } from "../core/orphan-process-journal.js";
import {
	getShellInvocationArgs,
	WINDOWS_PWSH_PATHS,
	windowsInboxPowerShellPath,
	withWindowsHide,
} from "./windows-process.js";

export interface ShellConfig {
	shell: string;
	args: string[];
}

export {
	getShellInvocationArgs,
	isPowerShellExecutable,
	POWERSHELL_INVOCATION_ARGS,
	WINDOWS_PWSH_PATHS,
	windowsInboxPowerShellPath,
} from "./windows-process.js";

function firstExistingPath(paths: readonly string[]): string | undefined {
	for (const path of paths) {
		if (existsSync(path)) {
			return path;
		}
	}
	return undefined;
}

/**
 * Find an executable on PATH (cross-platform). On Windows, `where` can return
 * stale entries, so the first existing match wins.
 */
function findOnPath(executable: string): string | null {
	if (process.platform === "win32") {
		try {
			const result = spawnSync("where", [executable], withWindowsHide({ encoding: "utf-8", timeout: 5000 }));
			if (result.status === 0 && result.stdout) {
				const firstMatch = result.stdout.trim().split(/\r?\n/)[0];
				if (firstMatch && existsSync(firstMatch)) {
					return firstMatch;
				}
			}
		} catch {
			// Ignore errors
		}
		return null;
	}

	try {
		const result = spawnSync("which", [executable], { encoding: "utf-8", timeout: 5000 });
		if (result.status === 0 && result.stdout) {
			const firstMatch = result.stdout.trim().split(/\r?\n/)[0];
			if (firstMatch) {
				return firstMatch;
			}
		}
	} catch {
		// Ignore errors
	}
	return null;
}

function findBashOnPath(): string | null {
	return findOnPath(process.platform === "win32" ? "bash.exe" : "bash");
}

function windowsGitBashPaths(): string[] {
	const paths: string[] = [];
	const programFiles = process.env.ProgramFiles;
	if (programFiles) {
		paths.push(`${programFiles}\\Git\\bin\\bash.exe`);
	}
	const programFilesX86 = process.env["ProgramFiles(x86)"];
	if (programFilesX86) {
		paths.push(`${programFilesX86}\\Git\\bin\\bash.exe`);
	}
	return paths;
}

function resolveWindowsUserShell(): string | undefined {
	const pwsh = firstExistingPath(WINDOWS_PWSH_PATHS);
	if (pwsh) {
		return pwsh;
	}
	const inbox = windowsInboxPowerShellPath();
	if (existsSync(inbox)) {
		return inbox;
	}
	const gitBash = firstExistingPath(windowsGitBashPaths());
	if (gitBash) {
		return gitBash;
	}
	return findOnPath("pwsh.exe") ?? findOnPath("powershell.exe") ?? findBashOnPath() ?? undefined;
}

/**
 * Resolve shell configuration based on platform and an optional explicit shell path.
 * Resolution order:
 * 1. User-specified shellPath
 * 2. On Windows: PowerShell 7, in-box Windows PowerShell, Git Bash, then PATH
 * 3. On Unix: /bin/bash, then bash on PATH, then fallback to sh
 */
export function getShellConfig(customShellPath?: string): ShellConfig {
	if (customShellPath) {
		if (existsSync(customShellPath)) {
			return { shell: customShellPath, args: getShellInvocationArgs(customShellPath) };
		}
		throw new Error(`Custom shell path not found: ${customShellPath}`);
	}

	if (process.platform === "win32") {
		const shell = resolveWindowsUserShell();
		if (shell) {
			return { shell, args: getShellInvocationArgs(shell) };
		}

		throw new Error(
			"No shell found. Windows 11 includes Windows PowerShell; PowerShell 7 (pwsh) is preferred when installed.\n" +
				"  1. Install PowerShell 7: https://aka.ms/powershell\n" +
				"  2. Or install Git for Windows: https://git-scm.com/download/win\n" +
				"  3. Or set shellPath in settings.json\n",
		);
	}

	if (existsSync("/bin/bash")) {
		return { shell: "/bin/bash", args: ["-c"] };
	}

	const bashOnPath = findBashOnPath();
	if (bashOnPath) {
		return { shell: bashOnPath, args: ["-c"] };
	}

	return { shell: "sh", args: ["-c"] };
}

// Hardcoded literals: ProgramFiles env vars are ambient attacker-influenceable
// input, the same trust-laundering class as PATH.
const WINDOWS_GIT_BASH_PATHS = ["C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files (x86)\\Git\\bin\\bash.exe"];

/**
 * Absolute default shell for the kernel's bash(): explicit shellPath wins; POSIX
 * uses /bin/bash else /bin/sh (absolute, never PATH — the kernel inherits a
 * user-influenced PATH); win32 uses only well-known PowerShell and Git Bash
 * install paths, never PATH (a repo-controlled PATH/where.exe must not pick
 * the kernel shell). undefined = no shell found: kernel startup must not fail,
 * bash() raises its teaching error.
 */
export function resolveKernelBashShell(customShellPath?: string): string | undefined {
	const explicit = customShellPath?.trim();
	if (explicit) {
		return explicit;
	}
	if (process.platform !== "win32") {
		return existsSync("/bin/bash") ? "/bin/bash" : "/bin/sh";
	}
	const pwsh = firstExistingPath(WINDOWS_PWSH_PATHS);
	if (pwsh) {
		return pwsh;
	}
	const inbox = windowsInboxPowerShellPath();
	if (existsSync(inbox)) {
		return inbox;
	}
	for (const path of WINDOWS_GIT_BASH_PATHS) {
		if (existsSync(path)) {
			return path;
		}
	}
	return undefined;
}

export function getShellEnv(): NodeJS.ProcessEnv {
	const binDir = getBinDir();
	const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
	const currentPath = process.env[pathKey] ?? "";
	const pathEntries = currentPath.split(delimiter).filter(Boolean);
	const hasBinDir = pathEntries.includes(binDir);
	const updatedPath = hasBinDir ? currentPath : [binDir, currentPath].filter(Boolean).join(delimiter);

	return {
		...process.env,
		[pathKey]: updatedPath,
	};
}

/**
 * Sanitize binary output for display/storage.
 * Removes characters that crash string-width or cause display issues:
 * - Control characters (except tab, newline, carriage return)
 * - Lone surrogates
 * - Unicode Format characters (crash string-width due to a bug)
 * - Characters with undefined code points
 */
export function sanitizeBinaryOutput(str: string): string {
	// Use Array.from to properly iterate over code points (not code units)
	// This handles surrogate pairs correctly and catches edge cases where
	// codePointAt() might return undefined
	return Array.from(str)
		.filter((char) => {
			// Filter out characters that cause string-width to crash
			// This includes:
			// - Unicode format characters
			// - Lone surrogates (already filtered by Array.from)
			// - Control chars except \t \n \r
			// - Characters with undefined code points

			const code = char.codePointAt(0);

			// Skip if code point is undefined (edge case with invalid strings)
			if (code === undefined) return false;

			// Allow tab, newline, carriage return
			if (code === 0x09 || code === 0x0a || code === 0x0d) return true;

			// Filter out control characters (0x00-0x1F, except 0x09, 0x0a, 0x0x0d)
			if (code <= 0x1f) return false;

			// Filter out Unicode format characters
			if (code >= 0xfff9 && code <= 0xfffb) return false;

			return true;
		})
		.join("");
}

/**
 * Detached child processes must be tracked so they can be killed on parent
 * shutdown signals (SIGHUP/SIGTERM).
 */
const trackedDetachedChildPids = new Set<number>();

export function trackDetachedChildPid(pid: number): void {
	trackedDetachedChildPids.add(pid);
	recordOrphanProcessState(pid, true);
}

export function untrackDetachedChildPid(pid: number): void {
	trackedDetachedChildPids.delete(pid);
	recordOrphanProcessState(pid, false);
}

export function killTrackedDetachedChildren(): void {
	for (const pid of trackedDetachedChildPids) {
		killProcessTree(pid);
		recordOrphanProcessState(pid, false);
	}
	trackedDetachedChildPids.clear();
}

/**
 * Kill a process and all its children (cross-platform)
 */
export function killProcessTree(pid: number): void {
	if (process.platform === "win32") {
		// Use taskkill on Windows to kill process tree
		try {
			spawn(
				"taskkill",
				["/F", "/T", "/PID", String(pid)],
				withWindowsHide({
					stdio: "ignore",
					detached: true,
				}),
			);
		} catch {
			// Ignore errors if taskkill fails
		}
	} else {
		// Use SIGKILL on Unix/Linux/Mac
		try {
			process.kill(-pid, "SIGKILL");
		} catch {
			// Fallback to killing just the child if process group kill fails
			try {
				process.kill(pid, "SIGKILL");
			} catch {
				// Process already dead
			}
		}
	}
}
