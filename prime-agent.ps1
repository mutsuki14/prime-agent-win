#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:PRIME_AGENT_LAUNCHER_PATH = Join-Path $scriptDir "prime-agent.ps1"

$bundle = Join-Path $scriptDir "packages\coding-agent\dist\bundle\cli.js"
if (Test-Path -LiteralPath $bundle) {
	& node $bundle @args
	exit $LASTEXITCODE
}

$tsxCmd = Join-Path $scriptDir "node_modules\.bin\tsx.cmd"
$tsxJs = Join-Path $scriptDir "node_modules\tsx\dist\cli.mjs"
$cli = Join-Path $scriptDir "packages\coding-agent\src\cli.ts"

if (Test-Path -LiteralPath $tsxCmd) {
	& $tsxCmd $cli @args
	exit $LASTEXITCODE
}

if (Test-Path -LiteralPath $tsxJs) {
	& node $tsxJs $cli @args
	exit $LASTEXITCODE
}

Write-Error "Prime Agent is not built. Run npm ci and npm run build from the repository root."
exit 1
