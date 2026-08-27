#Requires -Version 5.1
<#
.SYNOPSIS
  Install Prime Agent on Windows 11 PowerShell.

.DESCRIPTION
  Downloads a versioned release tarball, verifies its SHA-256 checksum, and
  runs npm install -g. Child processes are started with CreateNoWindow so the
  installer does not flash extra console windows.

.EXAMPLE
  irm https://app.primeintellect.ai/prime-agent/install.ps1 | iex

.EXAMPLE
  $env:PRIME_AGENT_RELEASE_CHANNEL = "beta"
  irm https://app.primeintellect.ai/prime-agent/install.ps1 | iex
#>

[CmdletBinding()]
param(
	[Parameter(Position = 0)]
	[string]$VersionOrChannel = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# Keep these sentinels split so release publishing only rewrites the configured
# values below; local or unpublished copies still need unreplaced values to compare.
$PrimeAgentUnconfiguredBaseUrl = "__PRIME_AGENT_DOWNLOAD_BASE" + "_URL__"
$PrimeAgentUnconfiguredDefaultReleaseChannel = "__PRIME_AGENT_DEFAULT_RELEASE_" + "CHANNEL__"
$PrimeAgentBaseUrl = if ($env:PRIME_AGENT_DOWNLOAD_BASE_URL) { $env:PRIME_AGENT_DOWNLOAD_BASE_URL.TrimEnd("/") } else { "__PRIME_AGENT_DOWNLOAD_BASE_URL__" }
$PrimeAgentDefaultReleaseChannel = "__PRIME_AGENT_DEFAULT_RELEASE_CHANNEL__"
if ($PrimeAgentDefaultReleaseChannel -eq $PrimeAgentUnconfiguredDefaultReleaseChannel) {
	$PrimeAgentDefaultReleaseChannel = "stable"
}
$PrimeAgentReleaseChannel = if ($env:PRIME_AGENT_RELEASE_CHANNEL) { $env:PRIME_AGENT_RELEASE_CHANNEL } else { $PrimeAgentDefaultReleaseChannel }
$PrimeAgentPackage = if ($env:PRIME_AGENT_PACKAGE) { $env:PRIME_AGENT_PACKAGE } else { "prime-agent" }
$PrimeAgentCmd = if ($env:PRIME_AGENT_CMD) { $env:PRIME_AGENT_CMD } else { "prime-agent" }
$script:DownloadDir = $null

function Write-PrimeError {
	param([string]$Message)
	[Console]::Error.WriteLine("error: $Message")
}

function Test-NodeVersion {
	param([string]$Version)
	$trimmed = $Version.TrimStart("v")
	if ($trimmed -notmatch '^[0-9]') {
		return $false
	}
	$core = ($trimmed -replace '[^0-9.].*$', '')
	$parts = $core.Split(".")
	$major = [int]$parts[0]
	$minor = if ($parts.Length -gt 1) { [int]$parts[1] } else { 0 }
	$patch = if ($parts.Length -gt 2) { [int]$parts[2] } else { 0 }
	return ($major -gt 20) -or ($major -eq 20 -and $minor -gt 6) -or ($major -eq 20 -and $minor -eq 6 -and $patch -ge 0)
}

function Find-Command {
	param([string]$Name)
	$cmd = Get-Command $Name -ErrorAction SilentlyContinue
	if ($cmd) {
		return $cmd.Source
	}
	return $null
}

function Invoke-HiddenProcess {
	param(
		[Parameter(Mandatory = $true)][string]$FilePath,
		[string[]]$ArgumentList = @(),
		[hashtable]$Environment = @{},
		[switch]$InheritOutput
	)

	$psi = [System.Diagnostics.ProcessStartInfo]::new()
	$psi.FileName = $FilePath
	$quoted = foreach ($arg in $ArgumentList) {
		if ($arg -match '[\s"]') {
			'"' + ($arg -replace '"', '\"') + '"'
		} else {
			$arg
		}
	}
	$psi.Arguments = [string]::Join(" ", $quoted)
	$psi.UseShellExecute = $false
	$psi.CreateNoWindow = $true
	$psi.RedirectStandardOutput = -not $InheritOutput
	$psi.RedirectStandardError = -not $InheritOutput
	foreach ($entry in $Environment.GetEnumerator()) {
		$psi.Environment[$entry.Key] = [string]$entry.Value
	}

	$proc = [System.Diagnostics.Process]::new()
	$proc.StartInfo = $psi
	[void]$proc.Start()
	$stdout = ""
	$stderr = ""
	if (-not $InheritOutput) {
		$stdout = $proc.StandardOutput.ReadToEnd()
		$stderr = $proc.StandardError.ReadToEnd()
	}
	$proc.WaitForExit()
	return [pscustomobject]@{
		ExitCode = $proc.ExitCode
		Stdout   = $stdout
		Stderr   = $stderr
	}
}

function Normalize-PrimeVersion {
	param([string]$Version)
	$normalized = $Version.Trim().TrimStart("v")
	if (-not $normalized) {
		throw "empty Prime Agent version."
	}
	if ($normalized -notmatch '^[0-9A-Za-z.-]+$') {
		throw "invalid Prime Agent version: $Version"
	}
	return $normalized
}

function Resolve-PrimeAgentVersion {
	param([string]$Requested)
	if ($Requested) {
		if ($Requested -in @("stable", "beta")) {
			$channel = $Requested
		} else {
			return Normalize-PrimeVersion $Requested
		}
	} else {
		$channel = $PrimeAgentReleaseChannel
	}

	if ($env:PRIME_AGENT_VERSION) {
		return Normalize-PrimeVersion $env:PRIME_AGENT_VERSION
	}

	if ($channel -notin @("stable", "beta")) {
		throw "invalid Prime Agent release channel: $channel"
	}

	$channelUrl = "$PrimeAgentBaseUrl/$channel"
	Write-Host "Resolving latest $channel release..."
	$channelVersion = (Invoke-WebRequest -UseBasicParsing -Uri $channelUrl).Content.Trim()
	if (-not $channelVersion) {
		throw "could not resolve latest Prime Agent version from $channelUrl"
	}
	return Normalize-PrimeVersion $channelVersion
}

function Confirm-YesNo {
	param([string]$Prompt, [string]$Detail)
	if ($env:PRIME_AGENT_INSTALLER_YES -eq "1") {
		return $true
	}
	if (-not [Console]::IsInputRedirected -and $Host.UI.RawUI) {
		Write-Host $Detail
		$answer = Read-Host "$Prompt [Y/n]"
		return $answer -notmatch '^(n|no)$'
	}
	Write-Host "No terminal detected; continuing without confirmation."
	return $true
}

function Test-Preflight {
	$ok = $true
	$node = Find-Command "node"
	if ($node) {
		$nodeVersion = (& node --version)
		if (-not (Test-NodeVersion $nodeVersion)) {
			Write-PrimeError "Prime Agent requires Node.js 20.6.0 or newer. Found $nodeVersion."
			$ok = $false
		}
	} else {
		Write-PrimeError "Node.js 20.6.0 or newer is required to install Prime Agent."
		$ok = $false
	}

	if (-not (Find-Command "npm")) {
		Write-PrimeError "npm is required to install Prime Agent."
		$ok = $false
	}

	if (-not $ok) {
		Write-Host ""
		Write-Host "Install Node.js LTS, then re-run this installer:"
		Write-Host "  winget install OpenJS.NodeJS.LTS"
		Write-Host "  https://nodejs.org/"
	}

	$existing = Find-Command $PrimeAgentCmd
	if ($existing) {
		Write-Host "Existing $PrimeAgentCmd found at: $existing"
		Write-Host ""
	}

	return $ok
}

function Get-SelectedChecksum {
	param([string]$ChecksumsPath, [string]$TarballName)
	foreach ($line in Get-Content -LiteralPath $ChecksumsPath) {
		$parts = $line.Trim() -split '\s+', 2
		if ($parts.Count -eq 2 -and $parts[1] -eq $TarballName) {
			return $parts[0]
		}
	}
	throw "checksum for $TarballName was not found in $ChecksumsPath"
}

function Install-PrimeAgentPackage {
	param([string]$TarballPath, [bool]$BootstrapKernel)
	if (-not (Find-Command "npm")) {
		throw "npm is required to install Prime Agent."
	}

	$envMap = @{
		PRIME_AGENT_BOOTSTRAP_TOOLS_ON_INSTALL = "1"
	}
	if ($BootstrapKernel) {
		$envMap.PRIME_AGENT_BOOTSTRAP_KERNEL_ON_INSTALL = "1"
		$envMap.PRIME_AGENT_INSTALL_UV = "1"
	}

	# npm is a .cmd shim on Windows; CreateProcess cannot exec it directly.
	# cmd.exe /d /c with CreateNoWindow keeps the install in this console session.
	$cmdExe = Join-Path $env:SystemRoot "System32\cmd.exe"
	Write-Host "Installing Prime Agent with npm (no extra console windows)..."
	$result = Invoke-HiddenProcess -FilePath $cmdExe -ArgumentList @(
		"/d", "/s", "/c",
		"npm install -g --no-fund --no-audit --loglevel=error --progress=false `"$TarballPath`""
	) -Environment $envMap
	if ($result.ExitCode -ne 0) {
		if ($result.Stdout) { Write-Host $result.Stdout }
		if ($result.Stderr) { [Console]::Error.WriteLine($result.Stderr) }
		throw "npm install -g failed with exit code $($result.ExitCode)"
	}
}

function Main {
	if ($PrimeAgentBaseUrl -eq $PrimeAgentUnconfiguredBaseUrl) {
		Write-PrimeError "installer download URL is not configured."
		[Console]::Error.WriteLine("Set PRIME_AGENT_DOWNLOAD_BASE_URL or use the installer published by the release workflow.")
		exit 1
	}

	Write-Host ""
	Write-Host "Installing Prime Agent"
	Write-Host "Windows 11 PowerShell installer"
	Write-Host ""

	if (-not (Test-Preflight)) {
		exit 1
	}

	$version = Resolve-PrimeAgentVersion $VersionOrChannel
	$tarballName = "$PrimeAgentPackage-$version.tgz"
	$tarballUrl = "$PrimeAgentBaseUrl/releases/v$version/$tarballName"

	if (-not (Confirm-YesNo -Prompt "Install?" -Detail "Download, verify, and npm install -g Prime Agent v$version")) {
		Write-Host "Installation cancelled."
		exit 0
	}

	$bootstrapKernel = $false
	switch ($env:PRIME_AGENT_BOOTSTRAP_KERNEL_ON_INSTALL) {
		"1" { $bootstrapKernel = $true }
		"0" { $bootstrapKernel = $false }
		default {
			$bootstrapKernel = Confirm-YesNo -Prompt "Prepare?" -Detail "Prepare the Python runtime now? Installs uv, Python 3.11, and the Prime Agent runtime."
		}
	}

	$script:DownloadDir = Join-Path ([System.IO.Path]::GetTempPath()) ("prime-agent-install-" + [guid]::NewGuid().ToString("N"))
	New-Item -ItemType Directory -Path $script:DownloadDir | Out-Null
	$tarballPath = Join-Path $script:DownloadDir $tarballName
	$checksumsPath = Join-Path $script:DownloadDir "SHA256SUMS"

	try {
		Write-Host "Downloading release checksums..."
		Invoke-WebRequest -UseBasicParsing -Uri "$PrimeAgentBaseUrl/releases/v$version/SHA256SUMS" -OutFile $checksumsPath
		Write-Host "Downloading Prime Agent v$version..."
		Invoke-WebRequest -UseBasicParsing -Uri $tarballUrl -OutFile $tarballPath

		Write-Host "Verifying SHA-256..."
		$expected = Get-SelectedChecksum -ChecksumsPath $checksumsPath -TarballName $tarballName
		$actual = (Get-FileHash -LiteralPath $tarballPath -Algorithm SHA256).Hash.ToLowerInvariant()
		if ($actual -ne $expected.ToLowerInvariant()) {
			throw "SHA-256 mismatch for $tarballName (expected $expected, got $actual)"
		}

		Install-PrimeAgentPackage -TarballPath $tarballPath -BootstrapKernel $bootstrapKernel
	} finally {
		if ($script:DownloadDir -and (Test-Path -LiteralPath $script:DownloadDir)) {
			Remove-Item -LiteralPath $script:DownloadDir -Recurse -Force -ErrorAction SilentlyContinue
		}
	}

	$installed = Find-Command $PrimeAgentCmd
	Write-Host ""
	Write-Host "Prime Agent was installed successfully."
	if ($installed) {
		Write-Host "Run it with: $PrimeAgentCmd"
	} else {
		Write-Host "The $PrimeAgentCmd command was installed, but it is not on your PATH yet."
		Write-Host "Check npm's global bin directory with:"
		Write-Host ""
		Write-Host "  npm bin -g"
		Write-Host ""
		Write-Host "Then add that directory to your user PATH and reopen PowerShell."
	}
}

try {
	Main
} catch {
	Write-PrimeError $_.Exception.Message
	exit 1
}
