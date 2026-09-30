$ErrorActionPreference = 'Stop'
$links = @(
    (Join-Path ([Environment]::GetFolderPath('Programs')) 'THIRSTY.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Startup')) 'THIRSTY.lnk')
)
foreach ($link in $links) {
    if (Test-Path -LiteralPath $link) { Remove-Item -LiteralPath $link }
}
$appKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
if (Test-Path -LiteralPath $appKey) {
    Remove-ItemProperty -LiteralPath $appKey -Name 'THIRSTY' -ErrorAction SilentlyContinue
    # Builds before 30 Sep 2026 registered under Electron's default name; remove it only if it points here.
    $legacy = (Get-ItemProperty -LiteralPath $appKey).'electron.app.Electron'
    if ($legacy -and $legacy.Contains($PSScriptRoot)) { Remove-ItemProperty -LiteralPath $appKey -Name 'electron.app.Electron' }
}
Write-Output 'Removed THIRSTY shortcuts. Your local counts and project files are retained.'
