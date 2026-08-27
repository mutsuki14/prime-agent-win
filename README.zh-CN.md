[English](README.md) · **中文**

# Prime Agent

本地编码与研究代理，原生运行于 **Windows 11 PowerShell**、macOS 和 Linux。模型在持久 Python REPL 中工作：读文件、跑项目命令、调用 skill、用代码拉起子代理。在 Windows 上默认使用 PowerShell，操作过程中不会弹出额外命令行窗口。

## 这个版本解决了什么

此前 Windows 被当成 Git Bash 环境。Daemon worker、`bash()`、辅助工具和安装器在正常操作时会弹出额外的 `cmd` / PowerShell 窗口。

本树把 Windows 11 当成一等运行环境：

- **默认壳是 PowerShell。** 已安装则用 PowerShell 7（`pwsh`），否则用系统自带的 Windows PowerShell 5.1。Git Bash 仅在设置 `shellPath` 时使用。
- **不闪额外控制台。** 子进程一律带 `CREATE_NO_WINDOW` / `windowsHide`，覆盖 daemon worker、kernel `bash()`、剪贴板辅助和包管理步骤。
- **原生安装器。** 一条 PowerShell 命令下载带版本号的 tarball、校验 SHA-256，并执行 `npm install -g`，过程中不另开窗口。
- **Windows 路径正确。** Kernel 虚拟环境使用 `Scripts\python.exe`；uv 走官方 PowerShell 安装脚本。

Linux / macOS 仍使用 POSIX 安装脚本和 `/bin/bash`。三端共用同一个 `prime-agent` 命令、daemon 和 RLM kernel。

## 能力

- **模型侧只有一个内置工具：`ipython`。** 读改文件、跑命令、调用 skill、拉起子代理都走长生命周期 Python kernel。变量和 import 跨轮次保留。
- **可编程子代理。** `await rlm("…")` 启动真实子会话。结果通过消息或文件回来，而不是阻塞返回值。
- **后台会话。** 本地 daemon 在关闭终端后继续跑。用 `prime-agent attach` 重新接入。
- **可沉淀的 harness 状态。** `/refine` 可以把可审阅的小改动写入补充提示、记忆、skill 和子代理规格。基础系统提示不可变。
- **长任务控制。** `/goal`、`/heartbeat`、定时任务和 `/autonomous` 在断线与多轮之间继续推进。

worker 与 kernel 只做进程隔离，不是安全沙箱，权限与当前用户相同。

## 安装

### Windows 11 PowerShell

需要 Node.js 20.6.0 或更高版本，以及 npm。没有的话先装：

```powershell
winget install OpenJS.NodeJS.LTS
```

重新打开 PowerShell，然后：

```powershell
irm https://app.primeintellect.ai/prime-agent/install.ps1 | iex
```

Beta（跟踪 `main`）：

```powershell
$env:PRIME_AGENT_RELEASE_CHANNEL = "beta"
irm https://app.primeintellect.ai/prime-agent/install.ps1 | iex
```

### macOS 与 Linux

```bash
curl -fsSL https://app.primeintellect.ai/prime-agent/install.sh | sh
```

```bash
curl -fsSL https://app.primeintellect.ai/prime-agent/install.sh | sh -s -- beta
```

安装器会拉取带版本号的发行包、校验 SHA-256，并安装 `prime-agent` 命令。也可以顺便准备 Python kernel（uv、Python 3.11、`prime-agent-runtime`）。

## 第一次运行

```powershell
cd C:\path\to\project
prime-agent
```

```bash
cd /path/to/project
prime-agent
```

首次启动后执行 `/login` 选择订阅或 API Key 提供方，或在启动前设置环境变量，例如 `ANTHROPIC_API_KEY`。

Prime Agent 会读写当前目录。请在可丢弃的克隆或可检查、可回滚的 worktree 里使用。

在 Windows 上，`bash()` 和本地 shell 工具写 PowerShell（`Get-ChildItem`、`Select-String`、`.venv\Scripts\python.exe`）。只有需要 POSIX 语法时才把 `shellPath` 指到 Git Bash：

```json
{
  "shellPath": "C:\\Program Files\\Git\\bin\\bash.exe"
}
```

Windows 说明：[packages/coding-agent/docs/windows.md](packages/coding-agent/docs/windows.md)

## 常用命令

```text
prime-agent                      在当前目录启动交互会话
prime-agent agents               列出运行中、空闲和已保存的会话
prime-agent attach <agent>       重新接入正在运行的会话
prime-agent --resume [path|id]   浏览会话或直接恢复
prime-agent status               查看后台服务状态
prime-agent doctor [--fix]       检查或修复后台服务
prime-agent update [--force]     更新 Prime Agent
prime-agent shutdown [--force]   停止代理、worker 和 daemon
```

## 文档

- [快速开始](packages/coding-agent/docs/quickstart.md)
- [用法与 CLI](packages/coding-agent/docs/usage.md)
- [Windows 安装](packages/coding-agent/docs/windows.md)
- [RLM 编程模型](packages/coding-agent/docs/rlm.md)
- [长任务与后台代理](packages/coding-agent/docs/long-running-agents.md)
- [模型提供方](packages/coding-agent/docs/providers.md)
- [架构](packages/coding-agent/docs/architecture.md)
- [从源码开发](packages/coding-agent/docs/development.md)
- 完整目录：[packages/coding-agent/docs/index.md](packages/coding-agent/docs/index.md)

## 安全

Prime Agent 以当前用户权限执行模型生成的 Python 和项目命令。请审查 diff。只使用可信的仓库、提示、skill 和扩展。不信任的工作放到外部沙箱。

## 许可证

[MIT](LICENSE)
