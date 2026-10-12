param([switch]$CheckOnly, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$appDirectory = Split-Path -Parent $PSScriptRoot
$appUrl = 'http://127.0.0.1:5173/'
function Test-AppServer {
    try {
        $response = Invoke-WebRequest -Uri $appUrl -UseBasicParsing -TimeoutSec 2
        if ($response.Content -notmatch '<title>Human Code Evaluation</title>') {
            throw 'Port 5173 is occupied by another application. Stop that server or select another port deliberately.'
        }
        return $true
    } catch {
        if ($_.Exception.Message -like 'Port 5173*') { throw }
        return $false
    }
}
if (-not (Test-AppServer)) {
    if ($CheckOnly) { throw 'The local app server is not running.' }
    $nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
    $viteEntry = Join-Path $appDirectory 'node_modules\vite\bin\vite.js'
    if (-not (Test-Path -LiteralPath $viteEntry)) { throw 'Dependencies are missing. Run npm.cmd ci in the app folder first.' }
    $runtimeDirectory = Join-Path $appDirectory '.runtime'
    New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
    $viteArguments = @(('"' + $viteEntry + '"'))
    if (Test-Path -LiteralPath (Join-Path $appDirectory 'dist\index.html')) { $viteArguments += 'preview' }
    $viteArguments += @('--host', '127.0.0.1', '--port', '5173', '--strictPort')
    $process = Start-Process -FilePath $nodeExecutable -ArgumentList $viteArguments -WorkingDirectory $appDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDirectory 'server.log') -RedirectStandardError (Join-Path $runtimeDirectory 'server-error.log') -PassThru
    $process.Id | Set-Content -LiteralPath (Join-Path $runtimeDirectory 'server.pid')
    $ready = $false
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
        if (Test-AppServer) { $ready = $true; break }
        Start-Sleep -Milliseconds 300
    }
    if (-not $ready) { throw "App server did not start. See $runtimeDirectory\server-error.log" }
}
Write-Host "Human Code Evaluation is available at $appUrl"
if (-not $CheckOnly -and -not $NoBrowser) { Start-Process $appUrl }
