**English** · [中文](README.zh-CN.md)

# Prime Agent

A local coding and research agent that runs natively on **Windows 11 PowerShell**, macOS, and Linux. The model works in a persistent Python REPL: it reads files, runs project commands, calls skills, and starts child agents as code. On Windows it uses PowerShell as the default shell and does not flash extra console windows.

## Why this tree

Earlier builds treated Windows as a Git Bash host. Daemon workers, `bash()`, helper tools, and the installer could pop extra `cmd` / PowerShell consoles during normal use.

This tree makes Windows 11 a first-class host:

- **PowerShell is the default shell.** PowerShell 7 (`pwsh`) if installed, otherwise in-box Windows PowerShell 5.1. Git Bash is optional via `shellPath`.
- **No extra console flashes.** Child processes are created with `CREATE_NO_WINDOW` / `windowsHide`, including daemon workers, kernel `bash()`, clipboard helpers, and package-manager steps.
- **Native installer.** One PowerShell command downloads a versioned tarball, verifies SHA-256, and runs `npm install -g` without opening another window.
- **Windows-correct runtime paths.** Kernel venv uses `Scripts\python.exe`; uv is installed with the official PowerShell script.

Linux and macOS keep the POSIX installer and `/bin/bash` default. The same `prime-agent` command, daemon, and RLM kernel run on all three.

## What you get

- **One built-in model tool: `ipython`.** File work, shell, skills, and subagents go through a long-lived Python kernel. Variables and imports survive across turns.
- **Programmatic subagents.** `await rlm("…")` starts a real child session. Results come back through messages or files, not as a blocking return value.
- **Background sessions.** A local daemon keeps agents running after you close the terminal. Reattach with `prime-agent attach`.
- **Durable harness state.** `/refine` can record small, reviewable updates to supplemental prompts, memories, skills, and subagent specs. The base system prompt stays immutable.
- **Long-running controls.** `/goal`, `/heartbeat`, schedules, and `/autonomous` keep work moving across turns and disconnects.

The worker and kernel are process-isolation boundaries, not a security sandbox. They run with your user permissions.

## Install

### Windows 11 PowerShell

Requires Node.js 20.6.0 or newer and npm. If they are missing:

```powershell
winget install OpenJS.NodeJS.LTS
```

Reopen PowerShell, then:

```powershell
irm https://app.primeintellect.ai/prime-agent/install.ps1 | iex
```

Beta (latest `main`):

```powershell
$env:PRIME_AGENT_RELEASE_CHANNEL = "beta"
irm https://app.primeintellect.ai/prime-agent/install.ps1 | iex
```

### macOS and Linux

```bash
curl -fsSL https://app.primeintellect.ai/prime-agent/install.sh | sh
```

```bash
curl -fsSL https://app.primeintellect.ai/prime-agent/install.sh | sh -s -- beta
```

The installer fetches a versioned release, checks SHA-256, and installs the `prime-agent` command. It can also prepare the Python kernel (uv, Python 3.11, `prime-agent-runtime`).

## First run

```powershell
cd C:\path\to\project
prime-agent
```

```bash
cd /path/to/project
prime-agent
```

On first launch, run `/login` to pick a subscription or API-key provider, or set an environment variable such as `ANTHROPIC_API_KEY` before start.

Prime Agent reads and writes the current directory. Use a disposable clone or a worktree you can inspect and restore.

On Windows, write PowerShell in `bash()` and the local shell tool (`Get-ChildItem`, `Select-String`, `.venv\Scripts\python.exe`). Point `shellPath` at Git Bash only if you want POSIX syntax.

```json
{
  "shellPath": "C:\\Program Files\\Git\\bin\\bash.exe"
}
```

Windows notes: [packages/coding-agent/docs/windows.md](packages/coding-agent/docs/windows.md)

## Useful commands

```text
prime-agent                      Start an interactive session in the current directory
prime-agent agents               List running, idle, and saved sessions
prime-agent attach <agent>       Reattach to a running session
prime-agent --resume [path|id]   Browse sessions or resume one
prime-agent status               Inspect the background service
prime-agent doctor [--fix]       Inspect or repair background services
prime-agent update [--force]     Update Prime Agent
prime-agent shutdown [--force]   Stop agents, workers, and the daemon
```

## Documentation

- [Quickstart](packages/coding-agent/docs/quickstart.md)
- [Usage and CLI](packages/coding-agent/docs/usage.md)
- [Windows setup](packages/coding-agent/docs/windows.md)
- [RLM programming model](packages/coding-agent/docs/rlm.md)
- [Long-running and background agents](packages/coding-agent/docs/long-running-agents.md)
- [Providers](packages/coding-agent/docs/providers.md)
- [Architecture](packages/coding-agent/docs/architecture.md)
- [Development from source](packages/coding-agent/docs/development.md)
- Full index: [packages/coding-agent/docs/index.md](packages/coding-agent/docs/index.md)

## Safety

Prime Agent executes model-generated Python and project commands as your user. Review diffs. Use trusted repositories, prompts, skills, and extensions only. Untrusted work belongs in an external sandbox.

## License

[MIT](LICENSE)
