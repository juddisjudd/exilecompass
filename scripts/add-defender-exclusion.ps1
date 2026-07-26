#Requires -RunAsAdministrator
<#
  Adds ExileCompass's install folder and executable to the Windows Defender
  exclusion list.

  Why this exists: ExileCompass's Windows build isn't code-signed (see
  README/FAQ for why), and unsigned auto-updating apps that read window
  titles / simulate focus (which the overlay needs to do to attach to the
  game) are exactly the shape of thing Defender's heuristics flag on sight.
  This is a false positive, but Defender has no way to know that until the
  binary earns reputation or Microsoft reviews a submitted sample.

  This script only touches Defender's *exclusion list* for ExileCompass's
  own install folder/exe — it does not disable Defender, change any other
  setting, or touch anything outside that folder.

  Usage: right-click this file -> "Run with PowerShell as Administrator".
  Safe to re-run.
#>

$ErrorActionPreference = 'Stop'

function Resolve-InstallDir {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\exilecompass'),
        (Join-Path $env:LOCALAPPDATA 'Programs\ExileCompass'),
        (Join-Path $env:ProgramFiles 'ExileCompass'),
        (Join-Path ${env:ProgramFiles(x86)} 'ExileCompass')
    )
    foreach ($c in $candidates) {
        if ($c -and (Test-Path (Join-Path $c 'exilecompass.exe'))) { return $c }
    }

    $uninstallKeys = @(
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    foreach ($key in $uninstallKeys) {
        $match = Get-ItemProperty $key -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -like 'ExileCompass*' -and $_.InstallLocation } |
            Select-Object -First 1
        if ($match) { return $match.InstallLocation.TrimEnd('\') }
    }

    return $null
}

Write-Host 'Looking for your ExileCompass install...' -ForegroundColor Cyan
$installDir = Resolve-InstallDir

if (-not $installDir) {
    Write-Host "Couldn't find it automatically." -ForegroundColor Yellow
    $installDir = Read-Host 'Enter the full path to the folder containing exilecompass.exe'
}

$installDir = $installDir.Trim('"').TrimEnd('\')
if (-not (Test-Path $installDir)) {
    Write-Error "Path not found: $installDir"
    exit 1
}

$exePath = Join-Path $installDir 'exilecompass.exe'

Write-Host "Adding Defender exclusions for:`n  $installDir" -ForegroundColor Cyan
Add-MpPreference -ExclusionPath $installDir

if (Test-Path $exePath) {
    Add-MpPreference -ExclusionProcess $exePath
    Write-Host "  $exePath" -ForegroundColor Cyan
}

Write-Host "`nDone. Restart ExileCompass if it's currently running." -ForegroundColor Green
