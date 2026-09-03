import { execFileSync, execSync, spawn } from "child_process";
import { platform } from "os";
import { isWaylandSession } from "./clipboard-image.js";
import { clipboard } from "./clipboard-native.js";
import { POWERSHELL_INVOCATION_ARGS, windowsInboxPowerShellPath, windowsSystem32Path } from "./windows-process.js";

type NativeClipboardExecOptions = {
	input: string;
	timeout: number;
	stdio: ["pipe", "ignore", "ignore"];
	windowsHide: true;
};

function copyToX11Clipboard(options: NativeClipboardExecOptions): void {
	try {
		execSync("xclip -selection clipboard", options);
	} catch {
		execSync("xsel --clipboard --input", options);
	}
}

/**
 * clip.exe decodes stdin with the console code page, so non-ASCII text (for
 * example Chinese) is mangled on most locales. Read the raw UTF-8 bytes in
 * PowerShell instead and fall back to clip.exe only if PowerShell fails.
 */
const WINDOWS_SET_CLIPBOARD_SCRIPT =
	"$in = [Console]::OpenStandardInput(); $ms = New-Object System.IO.MemoryStream; $in.CopyTo($ms); Set-Clipboard -Value ([System.Text.Encoding]::UTF8.GetString($ms.ToArray()))";

function copyToWindowsClipboard(options: NativeClipboardExecOptions): void {
	try {
		execFileSync(
			windowsInboxPowerShellPath(),
			[...POWERSHELL_INVOCATION_ARGS, WINDOWS_SET_CLIPBOARD_SCRIPT],
			options,
		);
	} catch {
		execFileSync(windowsSystem32Path("clip.exe"), [], options);
	}
}

const MAX_OSC52_ENCODED_LENGTH = 100_000;

function isRemoteSession(env: NodeJS.ProcessEnv = process.env): boolean {
	return Boolean(env.SSH_CONNECTION || env.SSH_CLIENT || env.MOSH_CONNECTION);
}

function emitOsc52(text: string): boolean {
	const encoded = Buffer.from(text).toString("base64");
	if (encoded.length > MAX_OSC52_ENCODED_LENGTH) {
		return false;
	}
	process.stdout.write(`\x1b]52;c;${encoded}\x07`);
	return true;
}

export async function copyToClipboard(text: string): Promise<void> {
	let copied = false;

	const p = platform();

	// Prefer direct clipboard writes. Emitting OSC 52 first can make terminals
	// write the same native clipboard concurrently with the addon, and very large
	// OSC 52 payloads can desynchronize terminal rendering.
	//
	// On Linux, skip the native addon. The underlying `clipboard-rs` crate is
	// X11-only and does not retain selection ownership after `set_text`
	// resolves, so on Wayland-only compositors (Hyprland, Niri, ...) and even
	// some X11 sessions the call resolves successfully without populating the
	// clipboard. The platform tools below (wl-copy, xclip, xsel) properly
	// daemonize and keep ownership.
	try {
		if (clipboard && p !== "linux") {
			await clipboard.setText(text);
			copied = true;
		}
	} catch {
		// Fall through to platform-specific clipboard tools.
	}

	const remote = isRemoteSession();
	if (copied && !remote) {
		return;
	}

	const options: NativeClipboardExecOptions = {
		input: text,
		timeout: 5000,
		stdio: ["pipe", "ignore", "ignore"],
		windowsHide: true,
	};

	if (!copied) {
		try {
			if (p === "darwin") {
				execSync("pbcopy", options);
				copied = true;
			} else if (p === "win32") {
				copyToWindowsClipboard(options);
				copied = true;
			} else {
				// Linux. Try Termux, Wayland, or X11 clipboard tools.
				if (process.env.TERMUX_VERSION) {
					try {
						execSync("termux-clipboard-set", options);
						copied = true;
					} catch {
						// Fall back to Wayland or X11 tools.
					}
				}

				if (!copied) {
					const hasWaylandDisplay = Boolean(process.env.WAYLAND_DISPLAY);
					const hasX11Display = Boolean(process.env.DISPLAY);
					const isWayland = isWaylandSession();
					if (isWayland && hasWaylandDisplay) {
						try {
							// Verify wl-copy exists (spawn errors are async and won't be caught)
							execSync("which wl-copy", { stdio: "ignore", windowsHide: true });
							// wl-copy with execSync hangs due to fork behavior; use spawn instead
							const proc = spawn("wl-copy", [], { stdio: ["pipe", "ignore", "ignore"], windowsHide: true });
							proc.stdin.on("error", () => {
								// Ignore EPIPE errors if wl-copy exits early
							});
							proc.stdin.write(text);
							proc.stdin.end();
							proc.unref();
							copied = true;
						} catch {
							if (hasX11Display) {
								copyToX11Clipboard(options);
								copied = true;
							}
						}
					} else if (hasX11Display) {
						copyToX11Clipboard(options);
						copied = true;
					}
				}
			}
		} catch {
			// Fall through to OSC 52 fallback.
		}
	}

	if (remote || !copied) {
		const osc52Copied = emitOsc52(text);
		copied = copied || osc52Copied;
	}

	if (!copied) {
		throw new Error("Failed to copy to clipboard");
	}
}

function readClipboardTextViaWindowsPowerShell(): string {
	const output = execFileSync(
		windowsInboxPowerShellPath(),
		[
			...POWERSHELL_INVOCATION_ARGS,
			"[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $t = Get-Clipboard -Raw; if ($null -eq $t) { '' } else { $t }",
		],
		{
			encoding: "utf8",
			timeout: 5000,
			windowsHide: true,
			stdio: ["ignore", "pipe", "ignore"],
		},
	);
	return output.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Read plain text from the system clipboard.
 * Used by the Windows paste keybinding when the terminal does not inject bracketed paste.
 */
export async function readClipboardText(): Promise<string> {
	const p = platform();

	try {
		if (clipboard?.getText && (clipboard.hasText === undefined || clipboard.hasText())) {
			const text = await clipboard.getText();
			if (typeof text === "string" && text.length > 0) {
				return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
			}
		}
	} catch {
		// Fall through to platform tools.
	}

	try {
		if (p === "darwin") {
			return execSync("pbpaste", { encoding: "utf8", timeout: 5000, windowsHide: true });
		}
		if (p === "win32") {
			return readClipboardTextViaWindowsPowerShell();
		}
		if (process.env.TERMUX_VERSION) {
			return execSync("termux-clipboard-get", { encoding: "utf8", timeout: 5000, windowsHide: true });
		}
		if (isWaylandSession() && process.env.WAYLAND_DISPLAY) {
			return execSync("wl-paste --no-newline", { encoding: "utf8", timeout: 5000, windowsHide: true });
		}
		if (process.env.DISPLAY) {
			try {
				return execSync("xclip -selection clipboard -o", { encoding: "utf8", timeout: 5000, windowsHide: true });
			} catch {
				return execSync("xsel --clipboard --output", { encoding: "utf8", timeout: 5000, windowsHide: true });
			}
		}
	} catch {
		// Empty clipboard or missing tool.
	}

	return "";
}
