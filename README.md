**English** · [中文](README.zh-CN.md)

# Prime Agent for Windows

Repository: [github.com/mutsuki14/prime-agent-win](https://github.com/mutsuki14/prime-agent-win) · [Open in Cursor](https://cursor.com/codebase/mutsuki14/prime-agent-win)

A local coding and research agent that runs natively on **Windows 11 PowerShell**, and also on macOS and Linux. The model works in a persistent Python REPL: it reads files, runs project commands, calls skills, and starts child agents as code. On Windows it uses PowerShell as the default shell and does not flash extra console windows.

This repository is the Windows-native edition. It is not the upstream Prime Intellect release channel.

## Advantages

- **PowerShell is the default shell.** PowerShell 7 (`pwsh`) if installed, otherwise in-box Windows PowerShell 5.1. Git Bash is optional via `shellPath`.
- **No extra console flashes.** Child processes use `CREATE_NO_WINDOW` / `windowsHide` (daemon workers, kernel `bash()`, clipboard, package manager).
- **Native Windows install and launch.** `install.ps1` and `prime-agent.ps1` stay in this console session.
- **Windows-correct runtime paths.** Kernel venv uses `Scripts\python.exe`; uv is installed with the official PowerShell script.
- **Same RLM kernel on every OS.** Persistent `ipython`, `await rlm("…")` subagents, daemon reattach, `/goal`, `/heartbeat`, `/autonomous`.

## Install

Requires Node.js 22.8.0 or newer and npm. On Windows:

```powershell
winget install OpenJS.NodeJS.LTS
```

Reopen PowerShell, then:

```powershell
irm https://raw.githubusercontent.com/mutsuki14/prime-agent-win/main/install.ps1 | iex
```

If `raw.githubusercontent.com` is blocked:

```powershell
irm https://cdn.jsdelivr.net/gh/mutsuki14/prime-agent-win@main/install.ps1 | iex
```

The script clones this repository to `%LOCALAPPDATA%\Programs\prime-agent-win`, runs `npm ci` in the current window (no extra consoles), and puts `prime-agent` on your user PATH.

Then:

```powershell
cd C:\path\to\project
prime-agent
```

macOS / Linux:

```bash
git clone https://github.com/mutsuki14/prime-agent-win.git
cd prime-agent-win
npm ci
cd /path/to/project
/path/to/prime-agent-win/prime-agent.sh
```

On first launch, run `/login` or set an API key such as `ANTHROPIC_API_KEY`. Choose **Custom OpenAI-compatible** for Ollama, vLLM, LM Studio, or any OpenAI-compatible endpoint. The agent reads and writes the current directory.

On Windows, paste with `Ctrl+V` or `Shift+Insert`, copy the prompt with `Ctrl+Shift+C` or `Ctrl+Insert`, and interrupt with `Ctrl+C`.

On Windows, write PowerShell in `bash()` (`Get-ChildItem`, `Select-String`, `.venv\Scripts\python.exe`). Set `shellPath` only if you want Git Bash.

```json
{
  "shellPath": "C:\\Program Files\\Git\\bin\\bash.exe"
}
```

Manual checkout (same result as the installer):

```powershell
git clone https://github.com/mutsuki14/prime-agent-win.git
cd prime-agent-win
npm ci
```

```powershell
cd C:\path\to\project
& C:\path\to\prime-agent-win\prime-agent.ps1
```

## Useful commands

```text
prime-agent.ps1                  Start an interactive session (Windows checkout)
prime-agent.sh                   Start an interactive session (POSIX checkout)
prime-agent agents               List running, idle, and saved sessions
prime-agent attach <agent>       Reattach to a running session
prime-agent --resume [path|id]   Browse sessions or resume one
prime-agent status               Inspect the background service
prime-agent doctor [--fix]       Inspect or repair background services
prime-agent shutdown [--force]   Stop agents, workers, and the daemon
```

## Documentation

- [Windows setup](packages/coding-agent/docs/windows.md)
- [Quickstart](packages/coding-agent/docs/quickstart.md)
- [Usage and CLI](packages/coding-agent/docs/usage.md)
- [RLM programming model](packages/coding-agent/docs/rlm.md)
- [Long-running and background agents](packages/coding-agent/docs/long-running-agents.md)
- [Providers](packages/coding-agent/docs/providers.md)
- [Architecture](packages/coding-agent/docs/architecture.md)
- Full index: [packages/coding-agent/docs/index.md](packages/coding-agent/docs/index.md)

## Safety

The agent executes model-generated Python and project commands as your user. Review diffs. Use trusted repositories, prompts, skills, and extensions only.

## License

[MIT](LICENSE)
