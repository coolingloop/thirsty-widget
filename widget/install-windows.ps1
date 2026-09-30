$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
$env:npm_config_cache = Join-Path $root '.npm-cache'
Push-Location $root
try {
    if (-not (Test-Path -LiteralPath $electron)) {
        npm ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    }
    $version = (Get-Content -LiteralPath (Join-Path $root 'node_modules\electron\package.json') -Raw | ConvertFrom-Json).version
    if ($version -ne '44.5.1') { throw "Expected Electron 44.5.1, found $version" }
    $shell = New-Object -ComObject WScript.Shell
    # Start at login is the app's own setting (a Run value named THIRSTY), so only the
    # Start Menu shortcut is created here; an old Startup shortcut would double-launch it.
    $startup = Join-Path ([Environment]::GetFolderPath('Startup')) 'THIRSTY.lnk'
    if (Test-Path -LiteralPath $startup) { Remove-Item -LiteralPath $startup }
    $links = @(Join-Path ([Environment]::GetFolderPath('Programs')) 'THIRSTY.lnk')
    foreach ($link in $links) {
        $shortcut = $shell.CreateShortcut($link)
        $shortcut.TargetPath = $electron
        $shortcut.Arguments = '"' + $root + '"'
        $shortcut.WorkingDirectory = $root
        $shortcut.Description = 'THIRSTY local AI sip counter'
        $shortcut.IconLocation = Join-Path $root 'renderer\img\thirsty.ico'
        $shortcut.Save()
    }
    Start-Process -FilePath $electron -ArgumentList ('"' + $root + '"') -WorkingDirectory $root -WindowStyle Hidden
    Write-Output 'Installed the THIRSTY Start Menu shortcut and started the desktop pet.'
} finally { Pop-Location }
