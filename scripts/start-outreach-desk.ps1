param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$url = 'http://127.0.0.1:4318/'
function Test-OutreachDesk {
  try { return (Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2).StatusCode -eq 200 }
  catch { return $false }
}

if (-not (Test-OutreachDesk)) {
  Start-Process -FilePath 'node' `
    -ArgumentList '--env-file-if-exists=.env', 'server/index.mjs' `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $projectRoot 'server.log') `
    -RedirectStandardError (Join-Path $projectRoot 'server-error.log')

  $deadline = (Get-Date).AddSeconds(12)
  do {
    Start-Sleep -Milliseconds 300
    $ready = Test-OutreachDesk
  } until ($ready -or (Get-Date) -gt $deadline)
}

if (-not (Test-OutreachDesk)) { throw 'Outreach Desk did not start. Check server-error.log.' }
if (-not $NoBrowser) { Start-Process $url }
