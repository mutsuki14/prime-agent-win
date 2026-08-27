#!/usr/bin/env bash
# Idempotent Cloud Agent setup for the Prime Agent monorepo.
# Prepares system libraries, a CI-matching Node 22, uv, node_modules, a build,
# and a pre-warmed Python kernel runtime so the agent works offline afterwards.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

export DEBIAN_FRONTEND=noninteractive

# 1. System libraries. cairo/pango/jpeg/gif/rsvg are required to build the `canvas`
#    native module (packages/ai image tests); fd and ripgrep back the agent's file tools.
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
	libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
	fd-find ripgrep
sudo ln -sf "$(command -v fdfind)" /usr/local/bin/fd

# 2. Node 22 (>= 22.15). CI runs on "node 22" (latest 22.x); a few tests use
#    module.registerHooks which only exists in 22.15+. The base image puts an older
#    22.x first on PATH, so expose a newer one through ~/.local/bin (front of PATH).
mkdir -p "$HOME/.local/bin"
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
	# shellcheck disable=SC1091
	. "$NVM_DIR/nvm.sh"
	nvm install 22 >/dev/null
	NODE_BIN_DIR="$(dirname "$(nvm which 22)")"
	ln -sf "$NODE_BIN_DIR/node" "$HOME/.local/bin/node"
	ln -sf "$NODE_BIN_DIR/npm" "$HOME/.local/bin/npm"
	ln -sf "$NODE_BIN_DIR/npx" "$HOME/.local/bin/npx"
fi
export PATH="$HOME/.local/bin:$PATH"
hash -r
echo "Using node $(node --version) ($(command -v node))"

# 3. uv drives the Python kernel runtime bootstrap.
if ! command -v uv >/dev/null 2>&1; then
	curl -LsSf https://astral.sh/uv/install.sh | sh
fi
export PATH="$HOME/.local/bin:$PATH"

# 4. Install dependencies and build all packages (also generates dist assets the
#    kernel runtime resolution and the bundled CLI depend on).
npm ci
npm run build

# 5. Pre-warm the Python kernel venv: Python 3.11, prime-agent-runtime, dill, and the
#    default RLM packages. Bakes the venv into the image so first agent use is offline.
export PRIME_AGENT_INSTALL_UV=1
( cd packages/coding-agent && npx tsx src/core/kernel/bootstrap-cli.ts )

echo "Prime Agent environment ready."
