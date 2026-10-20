<#
Install or update the Experiment map plugin in an Obsidian vault (Windows).

  powershell -ExecutionPolicy Bypass -File install.ps1 [-Vault <path>] [-Claude | -NoClaude] [-Version X.Y.Z] [-From <folder or URL>]

Or put install.ps1 in the vault folder, right-click it and choose "Run with PowerShell".
The vault defaults to the current folder if it is a vault, else the script's own folder.
Re-run it to update. -Claude also installs the Claude skill (and the CLI it uses);
once installed, updates keep it current. -From takes the files from a folder or URL
instead of the latest GitHub release (for testing a local build).
Works with Windows PowerShell 5.1 and PowerShell 7.
#>
param(
  [string]$Vault = '',
  [switch]$Claude,
  [switch]$NoClaude,
  [string]$Version = '',
  [string]$From = ''
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Repo = 'taw181/obsidian-experiment-map'
$PluginId = 'experiment-map'
$Start = '<!-- experiment-map:start -->'
$End = '<!-- experiment-map:end -->'
# Started by right-click ("Run with PowerShell"): keep the window open at the end.
$Pause = ($PSBoundParameters.Count -eq 0)

function Finish([int]$code) {
  if ($Pause) { Read-Host 'Press Enter to close' | Out-Null }
  exit $code
}

function Fail-Download([string]$file, [string]$reason) {
  Write-Host "Download failed: $file ($reason). Nothing was changed." -ForegroundColor Red
  Finish 2
}

$Tmp = $null
# Any other error (a locked file, a full disk): say so instead of closing the window.
trap {
  Write-Host "Install failed: $($_.Exception.Message)" -ForegroundColor Red
  if ($Tmp) { Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue }
  Finish 1
}

if (-not $Vault) {
  if (Test-Path -LiteralPath (Join-Path (Get-Location).Path '.obsidian') -PathType Container) { $Vault = (Get-Location).Path }
  else { $Vault = $PSScriptRoot }
}
if (-not (Test-Path -LiteralPath (Join-Path $Vault '.obsidian') -PathType Container)) {
  Write-Host "Not an Obsidian vault: $Vault has no .obsidian folder. Open this folder in Obsidian first, or pass the vault's path." -ForegroundColor Red
  Finish 1
}
$Vault = (Resolve-Path -LiteralPath $Vault).Path

if ($From) { $Base = $From.TrimEnd('/', '\') }
elseif ($Version) { $Base = "https://github.com/$Repo/releases/download/$Version" }
else { $Base = "https://github.com/$Repo/releases/latest/download" }
$IsUrl = $Base -match '^https?://'
if ($IsUrl) { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 }

$Tmp = Join-Path ([IO.Path]::GetTempPath()) ("experiment-map-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $Tmp | Out-Null

function Fetch([string]$name) {
  $dest = Join-Path $Tmp $name
  try {
    if ($IsUrl) { Invoke-WebRequest -UseBasicParsing -Uri "$Base/$name" -OutFile $dest }
    else { Copy-Item -LiteralPath (Join-Path $Base $name) -Destination $dest }
  } catch {
    Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue
    if ($IsUrl) { Fail-Download $name $_.Exception.Message } else { Fail-Download $name "not found in $Base" }
  }
  if ((Get-Item -LiteralPath $dest).Length -eq 0) {
    Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue
    Fail-Download $name 'the file is empty'
  }
}

function Manifest-Version([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  $m = [regex]::Match([IO.File]::ReadAllText($path), '"version"\s*:\s*"([^"]*)"')
  if ($m.Success) { return $m.Groups[1].Value } else { return $null }
}

$PluginDir = Join-Path $Vault ".obsidian\plugins\$PluginId"
$SkillDir = Join-Path $Vault '.claude\skills\experiment-map'
$Old = Manifest-Version (Join-Path $PluginDir 'manifest.json')
if (-not $Old) { $Old = 'not installed' }

if ($Claude) { $WithClaude = $true }
elseif ($NoClaude) { $WithClaude = $false }
elseif (Test-Path -LiteralPath $SkillDir -PathType Container) { $WithClaude = $true }
elseif ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
  $answer = Read-Host 'Also install the Claude skill? [y/N]'
  $WithClaude = $answer -match '^[yY]'
} else { $WithClaude = $false }

# Everything is downloaded before anything in the vault is touched.
$Files = @('main.js', 'manifest.json', 'styles.css')
$ClaudeFiles = @('cli.js', 'SKILL.md', 'CLAUDE-snippet.md')
foreach ($f in $Files) { Fetch $f }
if ($WithClaude) { foreach ($f in $ClaudeFiles) { Fetch $f } }
if ([IO.File]::ReadAllText((Join-Path $Tmp 'manifest.json')) -notmatch ('"id"\s*:\s*"' + $PluginId + '"')) {
  Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue
  Fail-Download 'manifest.json' "it is not the Experiment map plugin's manifest"
}
$New = Manifest-Version (Join-Path $Tmp 'manifest.json')

New-Item -ItemType Directory -Force -Path $PluginDir | Out-Null
foreach ($f in $Files) { Copy-Item -LiteralPath (Join-Path $Tmp $f) -Destination (Join-Path $PluginDir $f) -Force }

if ($WithClaude) {
  Copy-Item -LiteralPath (Join-Path $Tmp 'cli.js') -Destination (Join-Path $PluginDir 'cli.js') -Force
  New-Item -ItemType Directory -Force -Path $SkillDir | Out-Null
  Copy-Item -LiteralPath (Join-Path $Tmp 'SKILL.md') -Destination (Join-Path $SkillDir 'SKILL.md') -Force

  # The CLAUDE.md block: replaced in place, or appended. Nothing outside the
  # markers changes, and the file keeps its line endings.
  $Utf8 = New-Object Text.UTF8Encoding $false
  $Md = Join-Path $Vault 'CLAUDE.md'
  $Snippet = [IO.File]::ReadAllText((Join-Path $Tmp 'CLAUDE-snippet.md')) -replace "`r`n", "`n"
  if (-not (Test-Path -LiteralPath $Md)) {
    [IO.File]::WriteAllText($Md, $Snippet, $Utf8)
  } else {
    $Text = [IO.File]::ReadAllText($Md)
    $Nl = if ($Text.Contains("`r`n")) { "`r`n" } else { "`n" }
    $Block = $Snippet.TrimEnd("`n") -replace "`n", $Nl
    $s = $Text.IndexOf($Start)
    $e = if ($s -ge 0) { $Text.IndexOf($End, $s) } else { -1 }
    if ($s -ge 0 -and $e -ge 0) {
      $Text = $Text.Substring(0, $s) + $Block + $Text.Substring($e + $End.Length)
      [IO.File]::WriteAllText($Md, $Text, $Utf8)
    } elseif ($s -ge 0) {
      Write-Host "Warning: $Md has '$Start' but no '$End'; fix the block by hand. CLAUDE.md was not changed." -ForegroundColor Yellow
    } else {
      $Prefix = if ($Text.Length -gt 0 -and -not $Text.EndsWith("`n")) { $Nl } else { '' }
      [IO.File]::WriteAllText($Md, $Text + $Prefix + $Nl + $Block + $Nl, $Utf8)
    }
  }
}

Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Experiment map $Old -> $New in $Vault"
if ($WithClaude) {
  Write-Host "Claude skill: $(Join-Path $SkillDir 'SKILL.md') (the CLI it uses needs Node 18 or later: node .obsidian/plugins/$PluginId/cli.js)"
}
if ($Old -eq 'not installed') {
  Write-Host ''
  Write-Host 'Next, in Obsidian:'
  Write-Host '  1. Settings > Community plugins: turn off Restricted mode if asked, then enable "Experiment map"'
  Write-Host '     (if it isn''t listed, press the reload button there, or restart Obsidian).'
  Write-Host '  2. Run "Experiment map: Set up this vault" from the command palette.'
} else {
  Write-Host 'Restart Obsidian (or turn the plugin off and on in Settings > Community plugins) to load the new version.'
}
Finish 0
