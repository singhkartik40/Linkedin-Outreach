$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = (Get-Command node -ErrorAction Stop).Source
$mutex = New-Object System.Threading.Mutex($false, 'Local\OutreachDeskService')
if (-not $mutex.WaitOne(0)) { $mutex.Dispose(); exit 0 }
try {
  while ($true) {
    try {
      $health = Invoke-RestMethod -Uri 'http://127.0.0.1:4318/api/health' -TimeoutSec 3
      if ($health.app -eq 'outreach-desk') { Start-Sleep -Seconds 30; continue }
    } catch {}
    $service = Start-Process -FilePath $nodePath -ArgumentList '--env-file-if-exists=.env', 'server/index.mjs' -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectRoot 'server.log') -RedirectStandardError (Join-Path $projectRoot 'server-error.log')
    $service.WaitForExit()
    Start-Sleep -Seconds 15
  }
} finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
