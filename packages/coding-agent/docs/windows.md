# Windows Setup

Prime Agent runs natively in Windows 11 PowerShell and Windows Terminal. Git Bash is optional.

## Install

In Windows PowerShell 5.1 or PowerShell 7:

```powershell
irm https://app.primeintellect.ai/prime-agent/install.ps1 | iex
```

Beta (latest `main`):

```powershell
$env:PRIME_AGENT_RELEASE_CHANNEL = "beta"
irm https://app.primeintellect.ai/prime-agent/install.ps1 | iex
```

Or download the script and pass a channel or version:

```powershell
irm https://app.primeintellect.ai/prime-agent/install.ps1 -OutFile "$env:TEMP\prime-agent-install.ps1"
& "$env:TEMP\prime-agent-install.ps1" beta
```

The installer requires Node.js 20.6.0 or newer and npm. If they are missing:

```powershell
winget install OpenJS.NodeJS.LTS
```

Then reopen PowerShell and run the installer again.

Start Prime Agent from the project directory:

```powershell
cd C:\path\to\project
prime-agent
```

Child processes (daemon workers, `bash()`, helper tools) are created with `CREATE_NO_WINDOW` / `windowsHide`, so they do not flash extra console windows.

## Default Shell

On Windows, `bash()` and the local shell tool use PowerShell:

1. Custom path from `~/.prime/agent/settings.json` (`shellPath`)
2. PowerShell 7 (`C:\Program Files\PowerShell\7\pwsh.exe`)
3. Windows PowerShell 5.1 (`%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`)
4. Git Bash, if installed

Write PowerShell commands unless you point `shellPath` at a POSIX shell.

## Custom Shell Path

```json
{
  "shellPath": "C:\\Program Files\\PowerShell\\7\\pwsh.exe"
}
```

Git Bash remains supported:

```json
{
  "shellPath": "C:\\Program Files\\Git\\bin\\bash.exe"
}
```
