# Installs or removes the subtitles helper for the current Windows user (no admin needed).
#   install:   powershell -ExecutionPolicy Bypass -File setup.ps1
#   uninstall: powershell -ExecutionPolicy Bypass -File setup.ps1 -Uninstall
param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$HOST_NAME = 'play_in_potplayer.subtitles'
# Fixed by the "key" in extension/manifest.json, the same in every install.
$EXTENSION_ID = 'khldldjegimchfeflmdgpdbphjhpijfj'

$browsers = [ordered]@{
    'Google Chrome' = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts'
    'Microsoft Edge' = 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts'
    'Brave' = 'HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts'
    'Chromium' = 'HKCU:\Software\Chromium\NativeMessagingHosts'
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifestPath = Join-Path $here "$HOST_NAME.json"

if ($Uninstall) {
    foreach ($root in $browsers.Values) {
        Remove-Item -Path (Join-Path $root $HOST_NAME) -Recurse -Force -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $manifestPath -Force -ErrorAction SilentlyContinue
    # Subtitle files the helper downloaded.
    Remove-Item -LiteralPath (Join-Path $env:TEMP 'play-in-potplayer-subs') -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host ''
    Write-Host 'Subtitles helper removed. "Play in PotPlayer" now opens videos without subtitles.' -ForegroundColor Green
    return
}

foreach ($f in 'host.bat', 'host.ps1') {
    if (-not (Test-Path -LiteralPath (Join-Path $here $f))) { throw "$f is missing. Keep all files of the helper folder together." }
}

# Files unzipped from a download carry Windows' "from the internet" mark, which can make
# Windows show a security warning when the helper runs. Remove it from the helper's own files.
Get-ChildItem -LiteralPath $here -File | Where-Object { $_.Extension -in '.bat', '.ps1', '.txt' } |
    ForEach-Object { Unblock-File -LiteralPath $_.FullName -ErrorAction SilentlyContinue }

$manifest = [ordered]@{
    name = $HOST_NAME
    description = 'Play in PotPlayer for Stremio: subtitles helper'
    path = (Join-Path $here 'host.bat')
    type = 'stdio'
    allowed_origins = @("chrome-extension://$EXTENSION_ID/")
}
[IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))

foreach ($root in $browsers.Values) {
    $key = Join-Path $root $HOST_NAME
    New-Item -Path $key -Force | Out-Null
    Set-Item -Path $key -Value $manifestPath
}

Write-Host ''
Write-Host 'Subtitles helper installed.' -ForegroundColor Green
Write-Host "Folder: $here"
Write-Host 'Keep this folder where it is. If you move it, run install.bat again.'
Write-Host 'Reload Stremio Web (F5), then use "Play in PotPlayer" as usual.'
