# Windows Setup

Prime Agent runs natively in Windows 11 PowerShell and Windows Terminal. Git Bash is optional.

## Install

`https://app.primeintellect.ai/prime-agent/install.ps1` is not published (404). Use this repository:

```powershell
irm https://raw.githubusercontent.com/mutsuki14/prime-agent-win/main/install.ps1 | iex
```

If `raw.githubusercontent.com` is blocked:

```powershell
irm https://cdn.jsdelivr.net/gh/mutsuki14/prime-agent-win@main/install.ps1 | iex
```

Requires Node.js 22.8.0 or newer and npm. If they are missing:

```powershell
winget install OpenJS.NodeJS.LTS
```

Then reopen PowerShell and run the installer again.

The installer clones [mutsuki14/prime-agent-win](https://github.com/mutsuki14/prime-agent-win) to `%LOCALAPPDATA%\Programs\prime-agent-win`, runs `npm ci` and `npm run build` with `CreateNoWindow`, and adds `prime-agent` to your user PATH. The launcher starts the bundled CLI (`packages/coding-agent/dist/bundle/cli.js`).

Start from the project directory:

```powershell
cd C:\path\to\project
prime-agent
```

If an older install only ran `npm ci`, `prime-agent` fails with `ERR_MODULE_NOT_FOUND` for `@earendil-works/pi-agent-core`. Build the existing tree, or re-run the installer:

```powershell
cd $env:LOCALAPPDATA\Programs\prime-agent-win
npm run build
prime-agent
```

Child processes (daemon workers, `bash()`, helper tools) are created with `CREATE_NO_WINDOW` / `windowsHide`, so they do not flash extra console windows.

## Custom providers

`/login` pins **Custom / 自定义 OpenAI-compatible** at the top of Providers. You can also run `/provider` or `/login custom` to open the wizard directly. Enter a provider id, base URL, API key, and model id. Prime Agent writes `~/.prime/agent/models.json`. Local servers such as Ollama can use any API key value (for example `ollama`). Then open `/model` and select the new model.

You can still edit `models.json` by hand. See [Custom Models](models.md).

## Copy and paste

Use Windows Terminal. In the prompt:

- **Paste text:** `Ctrl+V` or `Shift+Insert` (reads the Windows clipboard)
- **Copy prompt:** `Ctrl+Shift+C` or `Ctrl+Insert` (empty prompt copies the last agent message, same as `/copy`)
- **Paste image:** `Alt+V`
- **Interrupt:** `Ctrl+C` (press twice to exit)

Terminal bracketed paste still works when Windows Terminal injects it. All shortcuts are configurable in `~/.prime/agent/keybindings.json`.

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
