param([switch]$OpenBrowser, [switch]$RefreshDemo)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $projectRoot
$logRoot = Join-Path $projectRoot 'logs'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$python = Join-Path $projectRoot 'backend/.venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $python)) { throw 'Install backend dependencies first; see QUICKSTART.md.' }

function Listening([int]$Port) {
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}
function Launch([string]$Name, [string]$Executable, [string[]]$Arguments, [string]$Directory, [int]$Port = 0) {
    if ($Port -and (Listening $Port)) { Write-Host "$Name already listening on $Port"; return }
    if (!(Test-Path -LiteralPath $Executable)) { throw "Missing $Name executable: $Executable. See QUICKSTART.md." }
    Start-Process -FilePath $Executable -ArgumentList $Arguments -WorkingDirectory $Directory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot "$Name.out.log") -RedirectStandardError (Join-Path $logRoot "$Name.err.log") | Out-Null
    if ($Port) {
        $ready = $false
        for ($attempt=0; $attempt -lt 30; $attempt++) {
            if (Listening $Port) { $ready=$true; break }
            Start-Sleep -Milliseconds 500
        }
        if (!$ready) { throw "$Name did not start. Inspect logs/$Name.err.log." }
    }
    Write-Host "$Name started"
}

if (!(Listening 5432)) {
    $pgCtl = Join-Path $projectRoot '.local-tools/pg/package/native/bin/pg_ctl.exe'
    $pgData = Join-Path $projectRoot '.local-tools/pgdata'
    if (!(Test-Path -LiteralPath $pgData)) { throw 'Initialize PostgreSQL first; see QUICKSTART.md.' }
    & $pgCtl -D $pgData -l (Join-Path $logRoot 'postgres.log') -o '-p 5432 -c listen_addresses=127.0.0.1' start
    if ($LASTEXITCODE) { throw 'PostgreSQL failed to start.' }
}
$redisData = Join-Path $projectRoot '.local-tools/redis-data'
New-Item -ItemType Directory -Path $redisData -Force | Out-Null
Launch 'redis' (Join-Path $projectRoot '.local-tools/redis/Redis-8.10.2-Windows-x64-msys2/redis-server.exe') @('--port','6379','--bind','127.0.0.1','--dir',('"' + $redisData + '"'),'--dbfilename','cache.rdb') $projectRoot 6379
Launch 'mailpit' (Join-Path $projectRoot '.local-tools/mailpit/mailpit.exe') @('--smtp','127.0.0.1:2525','--listen','127.0.0.1:8025') $projectRoot 8025
if (!(Test-Path -LiteralPath 'backend/.env')) {
    & $python backend/scripts/init_local_env.py
    if ($LASTEXITCODE) { throw 'Local environment setup failed.' }
}
& $python backend/scripts/sync_frontend_env.py
if ($LASTEXITCODE) { throw 'Frontend environment synchronization failed.' }
& $python backend/manage.py migrate --noinput
if ($LASTEXITCODE) { throw 'Migration failed.' }
if ($RefreshDemo) {
    & $python backend/manage.py seed_store
    if ($LASTEXITCODE) { throw 'Demo seed failed.' }
    & $python backend/manage.py refresh_demo_catalog
    if ($LASTEXITCODE) { throw 'Demo asset refresh failed.' }
}
Launch 'django' $python @('manage.py','runserver','127.0.0.1:8000','--noreload') (Join-Path $projectRoot 'backend') 8000
Launch 'next' $env:ComSpec @('/c','npm run dev -- -p 3000 -H 127.0.0.1') (Join-Path $projectRoot 'frontend') 3000
$projectWorkers = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like "$projectRoot\backend\.venv\*" -and $_.CommandLine -like '*celery*' }
if (!($projectWorkers | Where-Object { $_.CommandLine -like '* worker *' })) {
    Launch 'worker' (Join-Path $projectRoot 'backend/.venv/Scripts/celery.exe') @('-A','config','worker','--pool=solo','-l','info') (Join-Path $projectRoot 'backend')
}
if (!($projectWorkers | Where-Object { $_.CommandLine -like '* beat *' })) {
    Launch 'beat' (Join-Path $projectRoot 'backend/.venv/Scripts/celery.exe') @('-A','config','beat','-l','info') (Join-Path $projectRoot 'backend')
}
Launch 'caddy' (Join-Path $projectRoot '.local-tools/caddy/caddy.exe') @('run','--config','infra/Caddyfile.dev','--adapter','caddyfile') $projectRoot 8088
Write-Host 'TANPOOSH: http://localhost:8088 | Owner login: /manage/login | Mailpit: http://127.0.0.1:8025'
if ($OpenBrowser) { Start-Process 'http://localhost:8088' }
