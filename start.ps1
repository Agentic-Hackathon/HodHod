param([switch]$Production)
$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskRuntime=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$taskNode=Join-Path $taskRuntime 'node\bin\node.exe'
$taskPython=Join-Path $taskRuntime 'python\python.exe'
$taskPnpm=Join-Path $taskRuntime 'bin\fallback\pnpm.cmd'
if (-not (Test-Path -LiteralPath $taskNode)) { $taskNode=(Get-Command node -ErrorAction Stop).Source }
if (-not (Test-Path -LiteralPath $taskPython)) { $taskPython=(Get-Command python -ErrorAction Stop).Source }
$env:Path=(Split-Path -Parent $taskNode)+';'+(Split-Path -Parent $taskPython)+';'+$env:Path
$env:PYTHONIOENCODING='utf-8'
if (-not (Test-Path -LiteralPath 'node_modules\vite')) {
  if (-not (Test-Path -LiteralPath $taskPnpm)) { $taskPnpm=(Get-Command pnpm -ErrorAction Stop).Source }
  & $taskPnpm install
  if ($LASTEXITCODE -ne 0) {throw 'Dependency installation failed.'}
}
& $taskPython scripts/data_service.py --import-only
if ($LASTEXITCODE -ne 0) {throw 'Dataset import failed. Set TOROB_DATA_DIR to the CSV folder.'}
$taskBrainPython=Join-Path $PSScriptRoot '.local\brain-venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $taskBrainPython)) {
 & $taskPython -m venv .local/brain-venv
 if ($LASTEXITCODE -ne 0) {throw 'Creating the agent Python environment failed.'}
}
& $taskBrainPython -c 'import django, openai, anthropic, psycopg, dotenv, waitress, tzdata'
if ($LASTEXITCODE -ne 0) {
 & $taskBrainPython -m pip install -r backend/requirements-workspace.txt
 if ($LASTEXITCODE -ne 0) {throw 'Agent dependency installation failed.'}
}
$env:DJANGO_SETTINGS_MODULE='config.workspace_settings'
& $taskBrainPython backend/manage.py migrate --noinput
if ($LASTEXITCODE -ne 0) {throw 'Agent database migration failed.'}
& $taskBrainPython backend/manage.py import_workspace
if ($LASTEXITCODE -ne 0) {throw 'Agent catalogue import failed.'}
if (-not $env:TOROB_API_PORT) {$env:TOROB_API_PORT='8787'}
if (-not $env:HODHOD_BRAIN_PORT) {$env:HODHOD_BRAIN_PORT='8790'}
foreach ($taskPort in @([int]$env:TOROB_API_PORT,[int]$env:HODHOD_BRAIN_PORT,5173)) {
 $taskListener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$taskPort)
 try {$taskListener.Start()} catch {throw "Port $taskPort is unavailable. Stop the earlier application before starting another copy."} finally {$taskListener.Stop()}
}
if ($Production) {
 & $taskNode node_modules/typescript/bin/tsc -b
 if ($LASTEXITCODE -ne 0) {throw 'Type check failed.'}
 & $taskNode node_modules/vite/bin/vite.js build
 if ($LASTEXITCODE -ne 0) {throw 'Build failed.'}
}
$taskApi=$null
$taskBrain=$null
try {
 $taskApi=Start-Process -FilePath $taskPython -ArgumentList 'scripts/data_service.py' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput '.local\api.log' -RedirectStandardError '.local\api-error.log'
 $taskBrain=Start-Process -FilePath $taskBrainPython -ArgumentList 'scripts/serve_brain.py' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput '.local\brain.log' -RedirectStandardError '.local\brain-error.log'
 $taskReady=$false
 for ($taskAttempt=0; $taskAttempt -lt 30; $taskAttempt++) {
  if ($taskBrain.HasExited -or $taskApi.HasExited) {throw 'A backend stopped. Inspect .local/brain-error.log and .local/api-error.log.'}
  try {
   $taskHealth=Invoke-RestMethod "http://127.0.0.1:$($env:HODHOD_BRAIN_PORT)/api/workspace/bootstrap/" -TimeoutSec 2
   if ($taskHealth.status -eq 'ready') {$taskReady=$true;break}
  } catch {Start-Sleep -Milliseconds 500}
 }
 if (-not $taskReady) {throw 'Agent startup timed out.'}
 Write-Host "HodHod: http://127.0.0.1:5173 | model: $($taskHealth.model) | LLM configured: $($taskHealth.llmConfigured)"
 if (-not $taskHealth.llmConfigured) {Write-Host 'Run .\configure-model.ps1 to configure the model securely. Catalogue chat remains available.'}
 if ($Production) { & $taskNode node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5173 --strictPort }
 else { & $taskNode node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort }
} finally {
 foreach ($taskProcess in @($taskApi,$taskBrain)) {if ($taskProcess -and -not $taskProcess.HasExited) {Stop-Process -Id $taskProcess.Id}}
}
