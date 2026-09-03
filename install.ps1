#Requires -Version 5.1
<#
.SYNOPSIS
  Install Prime Agent for Windows from this repository.

.DESCRIPTION
  When a release download URL is configured, installs a verified tarball with
  npm install -g. Otherwise clones or downloads github.com/mutsuki14/prime-agent-win,
  runs npm ci, then npm run build so workspace packages have dist/. The launcher
  starts packages/coding-agent/dist/bundle/cli.js. Child processes use
  CreateNoWindow so no extra consoles flash.

.EXAMPLE
  irm https://raw.githubusercontent.com/mutsuki14/prime-agent-win/main/install.ps1 | iex
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
$PrimeAgentGitHubRepo = if ($env:PRIME_AGENT_GITHUB_REPO) { $env:PRIME_AGENT_GITHUB_REPO } else { "mutsuki14/prime-agent-win" }
$PrimeAgentGitHubRef = if ($env:PRIME_AGENT_GITHUB_REF) { $env:PRIME_AGENT_GITHUB_REF } else { "main" }
$script:DownloadDir = $null

function Write-PrimeError {
	param([string]$Message)
	[Console]::Error.WriteLine("error: $Message")
}

function Test-NodeVersion {
	param(
		[string]$Version,
		[int]$MinMajor = 20,
		[int]$MinMinor = 6
	)
	$trimmed = $Version.TrimStart("v")
	if ($trimmed -notmatch '^[0-9]') {
		return $false
	}
	$core = ($trimmed -replace '[^0-9.].*$', '')
	$parts = $core.Split(".")
	$major = [int]$parts[0]
	$minor = if ($parts.Length -gt 1) { [int]$parts[1] } else { 0 }
	return ($major -gt $MinMajor) -or ($major -eq $MinMajor -and $minor -ge $MinMinor)
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
		[string]$WorkingDirectory = "",
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
	if ($WorkingDirectory) {
		$psi.WorkingDirectory = $WorkingDirectory
	}
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
	param(
		[int]$MinMajor = 20,
		[int]$MinMinor = 6
	)
	$ok = $true
	$node = Find-Command "node"
	if ($node) {
		$nodeVersion = (& node --version)
		if (-not (Test-NodeVersion $nodeVersion -MinMajor $MinMajor -MinMinor $MinMinor)) {
			Write-PrimeError "Prime Agent requires Node.js $MinMajor.$MinMinor.0 or newer. Found $nodeVersion."
			$ok = $false
		}
	} else {
		Write-PrimeError "Node.js $MinMajor.$MinMinor.0 or newer is required to install Prime Agent."
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

function Get-SourceInstallDir {
	if ($env:PRIME_AGENT_INSTALL_DIR) {
		return $env:PRIME_AGENT_INSTALL_DIR
	}
	return (Join-Path $env:LOCALAPPDATA "Programs\prime-agent-win")
}

function Add-UserPathEntry {
	param([string]$Directory)
	$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
	if (-not $userPath) {
		$userPath = ""
	}
	$parts = @($userPath -split ';' | Where-Object { $_ })
	if ($parts -contains $Directory) {
		return
	}
	$updated = (@($parts + $Directory) -join ';')
	[Environment]::SetEnvironmentVariable("Path", $updated, "User")
	$env:Path = "$Directory;$env:Path"
}

function Write-PrimeAgentShim {
	param([string]$InstallDir)
	$binDir = Join-Path $InstallDir "bin"
	New-Item -ItemType Directory -Path $binDir -Force | Out-Null
	$cmdPath = Join-Path $binDir "prime-agent.cmd"
	# %~dp0 must stay a cmd.exe expansion. Keep these lines single-quoted so
	# PowerShell does not eat $ from %~dp0.
	@(
		"@echo off"
		"setlocal"
		'set "PRIME_AGENT_DIR=%~dp0.."'
		'set "CLI=%PRIME_AGENT_DIR%\packages\coding-agent\dist\bundle\cli.js"'
		'if not exist "%CLI%" ('
		"  echo Prime Agent is not built. Re-run the installer, or run: npm run build"
		"  echo in %PRIME_AGENT_DIR%"
		"  exit /b 1"
		")"
		'node "%CLI%" %*'
		"exit /b %ERRORLEVEL%"
	) | Set-Content -LiteralPath $cmdPath -Encoding ASCII
	Add-UserPathEntry $binDir
	return $cmdPath
}

function Install-FromGitHub {
	$installDir = Get-SourceInstallDir
	$repoUrl = "https://github.com/$PrimeAgentGitHubRepo.git"
	$zipUrl = "https://github.com/$PrimeAgentGitHubRepo/archive/refs/heads/$PrimeAgentGitHubRef.zip"
	$cmdExe = Join-Path $env:SystemRoot "System32\cmd.exe"
	$git = Find-Command "git"

	Write-Host "Installing from GitHub $PrimeAgentGitHubRepo@$PrimeAgentGitHubRef"
	Write-Host "Destination: $installDir"
	Write-Host ""

	if (-not (Confirm-YesNo -Prompt "Install?" -Detail "Download this repository, run npm ci, and build (no extra console windows).")) {
		Write-Host "Installation cancelled."
		exit 0
	}

	$parent = Split-Path -Parent $installDir
	New-Item -ItemType Directory -Path $parent -Force | Out-Null

	if ($git) {
		if (Test-Path -LiteralPath (Join-Path $installDir ".git")) {
			Write-Host "Updating existing checkout..."
			$result = Invoke-HiddenProcess -FilePath $git -ArgumentList @(
				"-C", $installDir, "fetch", "--depth", "1", "origin", $PrimeAgentGitHubRef
			) -InheritOutput
			if ($result.ExitCode -ne 0) {
				throw "git fetch failed with exit code $($result.ExitCode)"
			}
			# Keep the checkout on a named branch so `git pull origin main` keeps
			# working for manual updates instead of leaving a detached HEAD.
			$result = Invoke-HiddenProcess -FilePath $git -ArgumentList @(
				"-C", $installDir, "checkout", "-f", "-B", $PrimeAgentGitHubRef, "FETCH_HEAD"
			) -InheritOutput
			if ($result.ExitCode -ne 0) {
				throw "git checkout failed with exit code $($result.ExitCode)"
			}
		} else {
			if (Test-Path -LiteralPath $installDir) {
				Remove-Item -LiteralPath $installDir -Recurse -Force
			}
			Write-Host "Cloning repository..."
			$result = Invoke-HiddenProcess -FilePath $git -ArgumentList @(
				"clone", "--depth", "1", "--branch", $PrimeAgentGitHubRef, $repoUrl, $installDir
			) -InheritOutput
			if ($result.ExitCode -ne 0) {
				throw "git clone failed with exit code $($result.ExitCode)"
			}
		}
	} else {
		$script:DownloadDir = Join-Path ([System.IO.Path]::GetTempPath()) ("prime-agent-install-" + [guid]::NewGuid().ToString("N"))
		New-Item -ItemType Directory -Path $script:DownloadDir | Out-Null
		$zipPath = Join-Path $script:DownloadDir "source.zip"
		Write-Host "Downloading $zipUrl ..."
		Invoke-WebRequest -UseBasicParsing -Uri $zipUrl -OutFile $zipPath
		$extractDir = Join-Path $script:DownloadDir "extract"
		New-Item -ItemType Directory -Path $extractDir | Out-Null
		Add-Type -AssemblyName System.IO.Compression.FileSystem
		[System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $extractDir)
		$inner = Get-ChildItem -LiteralPath $extractDir | Select-Object -First 1
		if (-not $inner) {
			throw "GitHub zip archive was empty."
		}
		if (Test-Path -LiteralPath $installDir) {
			Remove-Item -LiteralPath $installDir -Recurse -Force
		}
		Move-Item -LiteralPath $inner.FullName -Destination $installDir
	}

	Write-Host "Running npm ci (no extra console windows)..."
	$result = Invoke-HiddenProcess -FilePath $cmdExe -ArgumentList @(
		"/d", "/s", "/c", "npm ci --no-fund --no-audit"
	) -WorkingDirectory $installDir -InheritOutput
	if ($result.ExitCode -ne 0) {
		if ($result.Stdout) { Write-Host $result.Stdout }
		if ($result.Stderr) { [Console]::Error.WriteLine($result.Stderr) }
		throw "npm ci failed with exit code $($result.ExitCode)"
	}

	# Workspace packages export dist/, which is not in git. tsx on TypeScript
	# source resolves @earendil-works/pi-agent-core to dist/index.js and fails
	# with ERR_MODULE_NOT_FOUND unless the tree is built.
	Write-Host "Building Prime Agent (no extra console windows)..."
	$result = Invoke-HiddenProcess -FilePath $cmdExe -ArgumentList @(
		"/d", "/s", "/c", "npm run build"
	) -WorkingDirectory $installDir -InheritOutput
	if ($result.ExitCode -ne 0) {
		if ($result.Stdout) { Write-Host $result.Stdout }
		if ($result.Stderr) { [Console]::Error.WriteLine($result.Stderr) }
		throw "npm run build failed with exit code $($result.ExitCode)"
	}

	$bundle = Join-Path $installDir "packages\coding-agent\dist\bundle\cli.js"
	if (-not (Test-Path -LiteralPath $bundle)) {
		throw "Build finished but $bundle is missing."
	}

	$shim = Write-PrimeAgentShim -InstallDir $installDir
	Write-Host ""
	Write-Host "Prime Agent was installed from GitHub."
	Write-Host "Launcher: $shim"
	Write-Host "Source:   $installDir"
	Write-Host ""
	Write-Host "Open a new PowerShell window, then:"
	Write-Host "  cd C:\path\to\project"
	Write-Host "  prime-agent"
	Write-Host ""
	Write-Host "To update later, re-run this installer or:"
	Write-Host "  cd `"$installDir`""
	Write-Host "  git pull origin $PrimeAgentGitHubRef"
	Write-Host "  npm ci; npm run build"
	Write-Host ""
	Write-Host "This session already has the launcher on PATH. You can run prime-agent now."
}

function Install-FromTarball {
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

function Main {
	Write-Host ""
	Write-Host "Installing Prime Agent"
	Write-Host "Windows 11 PowerShell installer"
	Write-Host ""

	$useTarball = $PrimeAgentBaseUrl -ne $PrimeAgentUnconfiguredBaseUrl
	if ($useTarball) {
		if (-not (Test-Preflight -MinMajor 20 -MinMinor 6)) {
			exit 1
		}
		Install-FromTarball
		return
	}

	Write-Host "No published tarball URL is configured. Installing this GitHub repository instead."
	Write-Host ""
	if (-not (Test-Preflight -MinMajor 22 -MinMinor 8)) {
		exit 1
	}
	Install-FromGitHub
}

try {
	Main
} catch {
	Write-PrimeError $_.Exception.Message
	exit 1
} finally {
	if ($script:DownloadDir -and (Test-Path -LiteralPath $script:DownloadDir)) {
		Remove-Item -LiteralPath $script:DownloadDir -Recurse -Force -ErrorAction SilentlyContinue
	}
}
