param(
  [Parameter(Position = 0)]
  [int[]]$Ports = @(3000, 3001, 3002, 5173, 8080, 8081),

  [switch]$WhatIf
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-ValidPort([int]$Port) {
  if ($Port -lt 1 -or $Port -gt 65535) {
    throw "Invalid port: $Port. Valid range is 1-65535."
  }
}

$Ports = @($Ports | Where-Object { $_ -ne $null } | Sort-Object -Unique)
if ($Ports.Count -eq 0) {
  Write-Host "No ports provided." -ForegroundColor Yellow
  exit 0
}

foreach ($p in $Ports) { Assert-ValidPort $p }

$connections = foreach ($p in $Ports) {
  Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
}

if (-not $connections) {
  Write-Host ("No LISTENING processes found on ports: {0}" -f ($Ports -join ', ')) -ForegroundColor Green
  exit 0
}

$targets = $connections |
  Select-Object -Property LocalPort, OwningProcess -Unique |
  Sort-Object -Property LocalPort

Write-Host "Will stop these listeners:" -ForegroundColor Cyan
$targets | ForEach-Object {
  $procId = $_.OwningProcess
  $name = ''
  try { $name = (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch { $name = '<unknown>' }
  Write-Host ("  Port {0} -> PID {1} ({2})" -f $_.LocalPort, $procId, $name)
}

if ($WhatIf) {
  Write-Host "WhatIf: not stopping any processes." -ForegroundColor Yellow
  exit 0
}

$killed = @()
foreach ($t in $targets) {
  $procId = $t.OwningProcess
  try {
    Stop-Process -Id $procId -Force -ErrorAction Stop
    $killed += $procId
  } catch {
    Write-Host ("Failed to stop PID {0} (port {1}): {2}" -f $procId, $t.LocalPort, $_.Exception.Message) -ForegroundColor Red
  }
}

$killed = @($killed | Sort-Object -Unique)
if ($killed.Count -gt 0) {
  Write-Host ("Stopped PIDs: {0}" -f ($killed -join ', ')) -ForegroundColor Green
} else {
  Write-Host "No processes were stopped." -ForegroundColor Yellow
}
