[English](README.md) · **中文**

# Prime Agent for Windows

仓库：[github.com/mutsuki14/prime-agent-win](https://github.com/mutsuki14/prime-agent-win) · [在 Cursor 中打开](https://cursor.com/codebase/mutsuki14/prime-agent-win)

本地编码与研究代理，原生运行于 **Windows 11 PowerShell**，也可用于 macOS 和 Linux。模型在持久 Python REPL 中工作：读文件、跑项目命令、调用 skill、用代码拉起子代理。在 Windows 上默认使用 PowerShell，操作过程中不会弹出额外命令行窗口。

本仓库是 Windows 原生版，不是 Prime Intellect 上游的发布通道。

## 优势

- **默认壳是 PowerShell。** 已安装则用 PowerShell 7（`pwsh`），否则用系统自带的 Windows PowerShell 5.1。Git Bash 仅在设置 `shellPath` 时使用。
- **不闪额外控制台。** 子进程一律带 `CREATE_NO_WINDOW` / `windowsHide`（daemon worker、kernel `bash()`、剪贴板、包管理）。
- **原生 Windows 安装与启动。** `install.ps1` 和 `prime-agent.ps1` 都在当前会话里跑，不另开窗口。
- **Windows 路径正确。** Kernel 虚拟环境使用 `Scripts\python.exe`；uv 走官方 PowerShell 安装脚本。
- **三端同一套 RLM kernel。** 持久 `ipython`、`await rlm("…")` 子代理、daemon 重连、`/goal`、`/heartbeat`、`/autonomous`。

## 安装

需要 Node.js 22.8.0 或更高版本，以及 npm。Windows：

```powershell
winget install OpenJS.NodeJS.LTS
```

重新打开 PowerShell，然后：

```powershell
irm https://raw.githubusercontent.com/mutsuki14/prime-agent-win/main/install.ps1 | iex
```

如果 `raw.githubusercontent.com` 无法访问：

```powershell
irm https://cdn.jsdelivr.net/gh/mutsuki14/prime-agent-win@main/install.ps1 | iex
```

脚本会把本仓库克隆到 `%LOCALAPPDATA%\Programs\prime-agent-win`，在当前窗口执行 `npm ci`（不另开控制台），并把 `prime-agent` 加到用户 PATH。

然后：

```powershell
cd C:\path\to\project
prime-agent
```

macOS / Linux：

```bash
git clone https://github.com/mutsuki14/prime-agent-win.git
cd prime-agent-win
npm ci
cd /path/to/project
/path/to/prime-agent-win/prime-agent.sh
```

首次启动后执行 `/login`，或设置 API Key（例如 `ANTHROPIC_API_KEY`）。Ollama、vLLM、LM Studio 或其它 OpenAI 兼容接口选 **Custom OpenAI-compatible**。代理会读写当前目录。

Windows 上：`Ctrl+V` 或 `Shift+Insert` 粘贴，`Ctrl+Shift+C` 或 `Ctrl+Insert` 复制当前输入，`Ctrl+C` 中断。

在 Windows 上，`bash()` 写 PowerShell（`Get-ChildItem`、`Select-String`、`.venv\Scripts\python.exe`）。只有需要 POSIX 语法时才设置 `shellPath`：

```json
{
  "shellPath": "C:\\Program Files\\Git\\bin\\bash.exe"
}
```

手动克隆（和安装器结果相同）：

```powershell
git clone https://github.com/mutsuki14/prime-agent-win.git
cd prime-agent-win
npm ci
```

```powershell
cd C:\path\to\project
& C:\path\to\prime-agent-win\prime-agent.ps1
```

## 常用命令

```text
prime-agent.ps1                  启动交互会话（Windows 源码）
prime-agent.sh                   启动交互会话（POSIX 源码）
prime-agent agents               列出运行中、空闲和已保存的会话
prime-agent attach <agent>       重新接入正在运行的会话
prime-agent --resume [path|id]   浏览会话或直接恢复
prime-agent status               查看后台服务状态
prime-agent doctor [--fix]       检查或修复后台服务
prime-agent shutdown [--force]   停止代理、worker 和 daemon
```

## 文档

- [Windows 安装](packages/coding-agent/docs/windows.md)
- [快速开始](packages/coding-agent/docs/quickstart.md)
- [用法与 CLI](packages/coding-agent/docs/usage.md)
- [RLM 编程模型](packages/coding-agent/docs/rlm.md)
- [长任务与后台代理](packages/coding-agent/docs/long-running-agents.md)
- [模型提供方](packages/coding-agent/docs/providers.md)
- [架构](packages/coding-agent/docs/architecture.md)
- 完整目录：[packages/coding-agent/docs/index.md](packages/coding-agent/docs/index.md)

## 安全

代理以当前用户权限执行模型生成的 Python 和项目命令。请审查 diff。只使用可信的仓库、提示、skill 和扩展。

## 许可证

[MIT](LICENSE)
