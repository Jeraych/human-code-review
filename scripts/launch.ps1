param([switch]$CheckOnly, [switch]$NoBrowser, [int]$Port = 5173, [string]$EnvironmentFile = '.env.local')
$ErrorActionPreference = 'Stop'
$appDirectory = Split-Path -Parent $PSScriptRoot
$appUrl = "http://127.0.0.1:$Port/"
function Test-AppServer {
    try {
        $response = Invoke-WebRequest -Uri $appUrl -UseBasicParsing -TimeoutSec 2
        if ($response.Content -notmatch '(?:<title>Human Code Evaluation</title>|name="application-name" content="Human Code Evaluation")') {
            throw "Port $Port is occupied by another application. Stop that server or select another port deliberately."
        }
        $health = Invoke-RestMethod -Uri ($appUrl + 'api/health') -TimeoutSec 2
        if ($health.protocolVersion -ne 'human-validation-v2') { throw 'This app server does not provide V2 persistence. Use npm.cmd run serve or stop the preview before launching V2.' }
        return $true
    } catch {
        if ($_.Exception.Message -like 'Port *' -or $_.Exception.Message -like 'This app server*') { throw }
        # Do not attempt to take over an occupied static preview or unrelated port.
        if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "Port $Port is already in use. Stop its server deliberately before launching V2." }
        return $false
    }
}
if (-not (Test-AppServer)) {
    if ($CheckOnly) { throw 'The local app server is not running.' }
    $nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
    if (-not (Test-Path -LiteralPath (Join-Path $appDirectory 'dist\index.html'))) { throw 'Production build is missing. Run npm.cmd ci and npm.cmd run build first.' }
    $envPath = Join-Path $appDirectory $EnvironmentFile
    if (-not (Test-Path -LiteralPath $envPath)) {
        if ($EnvironmentFile -ne '.env.local') { throw 'The selected environment file is missing.' }
        Write-Host 'Choose one Study access code to share with Conrad (8-100 letters, digits, underscore or hyphen). It is saved only in ignored .env.local.'
        $secureCode = Read-Host 'Study access code' -AsSecureString
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureCode)
        try { $plainCode = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
        if ($plainCode -notmatch '^[A-Za-z0-9_-]{8,100}$') { throw 'Access code must have 8-100 letters, digits, underscore or hyphen.' }
        "STUDY_ACCESS_CODE=$plainCode" | Set-Content -LiteralPath $envPath -Encoding ascii
        $plainCode = $null
    }
    $runtimeDirectory = Join-Path $appDirectory '.runtime'
    New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
    $serviceArguments = @('--env-file="' + $envPath + '"', 'server/api.ts')
    $previousPort = $env:PORT
    try {
        $env:PORT = [string]$Port
        $process = Start-Process -FilePath $nodeExecutable -ArgumentList $serviceArguments -WorkingDirectory $appDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDirectory 'server.log') -RedirectStandardError (Join-Path $runtimeDirectory 'server-error.log') -PassThru
    } finally { $env:PORT = $previousPort }
    $process.Id | Set-Content -LiteralPath (Join-Path $runtimeDirectory 'server.pid')
    $ready = $false
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
        if (Test-AppServer) { $ready = $true; break }
        Start-Sleep -Milliseconds 300
    }
    if (-not $ready) { throw "App server did not start. See $runtimeDirectory\server-error.log" }
}
Write-Host "Code / Choice V2 is available at $appUrl"
if (-not $CheckOnly -and -not $NoBrowser) { Start-Process $appUrl }
