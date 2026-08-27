# Shell Aliases

Prime Agent runs the configured shell in non-interactive mode (`bash -c` on POSIX, `powershell -NoProfile -NonInteractive -Command` on Windows), which doesn't expand aliases by default.

To enable your shell aliases, add to `~/.prime/agent/settings.json`:

```json
{
  "shellCommandPrefix": "shopt -s expand_aliases\neval \"$(grep '^alias ' ~/.zshrc)\""
}
```

Adjust the path (`~/.zshrc`, `~/.bashrc`, etc.) to match your shell config.
