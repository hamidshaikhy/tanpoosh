param([switch]$IncludePostgres)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
# Match the resolved workspace path. Never stop unrelated services by port/name.
$allProcesses = Get-CimInstance Win32_Process
$processes = $allProcesses | Where-Object {
    ($_.ExecutablePath -like "$projectRoot\backend\.venv\*" -and ($_.CommandLine -like '*manage.py runserver*' -or $_.CommandLine -like '*celery*')) -or
    ($_.ExecutablePath -like "$projectRoot\.local-tools\*" -and $_.Name -in @('redis-server.exe','mailpit.exe','caddy.exe')) -or
    ($_.Name -eq 'node.exe' -and $_.CommandLine -like "*$projectRoot\frontend\*next*")
}
# Python virtualenv launchers can spawn the base Python executable. Include their
# descendants so a stopped launcher cannot leave its worker holding ports/logs.
$ids = [System.Collections.Generic.HashSet[int]]::new()
$processes | ForEach-Object { [void]$ids.Add([int]$_.ProcessId) }
do {
    $added = $false
    foreach ($process in $allProcesses) {
        if ($ids.Contains([int]$process.ParentProcessId) -and $ids.Add([int]$process.ProcessId)) { $added = $true }
    }
} while ($added)
$ids | ForEach-Object { Stop-Process -Id $_ -ErrorAction SilentlyContinue }
if ($IncludePostgres) {
    & (Join-Path $projectRoot '.local-tools/pg/package/native/bin/pg_ctl.exe') -D (Join-Path $projectRoot '.local-tools/pgdata') stop -m fast
}
Write-Host 'Project web services stopped. PostgreSQL is kept running unless -IncludePostgres was specified.'
