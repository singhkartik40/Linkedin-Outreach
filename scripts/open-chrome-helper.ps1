$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$extensionFolder = Join-Path $projectRoot 'chrome-extension'
$candidates = @(
  (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
)
$chrome = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $chrome) { $command = Get-Command chrome.exe -ErrorAction SilentlyContinue; if ($command) { $chrome = $command.Source } }
if (-not $chrome) { throw 'Google Chrome was not found. Open chrome://extensions in Chrome and load the chrome-extension folder manually.' }
Start-Process -FilePath $chrome -ArgumentList 'chrome://extensions/'
Start-Process -FilePath explorer.exe -ArgumentList ('"' + $extensionFolder + '"')
