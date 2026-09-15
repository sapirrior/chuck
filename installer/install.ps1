# PowerShell Installer for Steward on Windows
$ErrorActionPreference = 'Stop'

$Repo = "sapirrior/steward"
$Asset = "steward-windows-x64.zip"
$DownloadUrl = "https://github.com/$Repo/releases/latest/download/$Asset"

Write-Host "[+] Installing Steward - Engineering Agent..." -ForegroundColor Cyan

$InstallDir = Join-Path $env:LOCALAPPDATA "steward\bin"
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

$TempZip = Join-Path ([System.IO.Path]::GetTempPath()) "steward-install.zip"
$TempExtract = Join-Path ([System.IO.Path]::GetTempPath()) "steward-extract-$([System.Guid]::NewGuid().ToString('N'))"

try {
    Write-Host "  - Target:       Windows x64" -ForegroundColor Gray
    Write-Host "  - Install path: $InstallDir\steward.exe" -ForegroundColor Gray
    Write-Host "  - Downloading:  $DownloadUrl" -ForegroundColor Gray

    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $TempZip -UseBasicParsing

    if (Test-Path $TempExtract) {
        Remove-Item -Recurse -Force $TempExtract
    }
    Expand-Archive -Path $TempZip -DestinationPath $TempExtract -Force

    $SourceExe = Join-Path $TempExtract "steward.exe"
    if (-not (Test-Path $SourceExe)) {
        throw "Failed to find steward.exe in the downloaded archive."
    }

    Copy-Item -Path $SourceExe -Destination (Join-Path $InstallDir "steward.exe") -Force

    Write-Host "[*] Successfully installed steward to $InstallDir\steward.exe" -ForegroundColor Green

    # Verify / Update PATH
    $UserPath = [Environment]::GetEnvironmentVariable("Path", [EnvironmentVariableTarget]::User)
    if ($UserPath -notlike "*$InstallDir*") {
        Write-Host "[i] Adding $InstallDir to User PATH..." -ForegroundColor Cyan
        [Environment]::SetEnvironmentVariable("Path", "$UserPath;$InstallDir", [EnvironmentVariableTarget]::User)
        $env:Path = "$env:Path;$InstallDir"
        Write-Host "[*] Added to PATH. (Restart your terminal if steward is not recognized immediately)." -ForegroundColor Yellow
    }

    Write-Host "Run 'steward' to get started." -ForegroundColor White
}
finally {
    if (Test-Path $TempZip) {
        Remove-Item -Force $TempZip -ErrorAction SilentlyContinue
    }
    if (Test-Path $TempExtract) {
        Remove-Item -Recurse -Force $TempExtract -ErrorAction SilentlyContinue
    }
}
