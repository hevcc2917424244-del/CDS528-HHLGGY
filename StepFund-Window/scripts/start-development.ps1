$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $projectRoot
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $nodeCommand -or -not $npmCommand) { throw 'Install Node.js 24 LTS, or use the separate StepFund-Windows portable edition.' }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) {
    & $npmCommand.Source ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check network access and run npm ci again.' }
}
# Open only the browser. Development server stays in this visible launcher window.
$browserLauncher = '$target = "http://127.0.0.1:5173/"; for ($attempt = 0; $attempt -lt 120; $attempt++) { try { $reply = Invoke-WebRequest -Uri $target -UseBasicParsing -TimeoutSec 2; if ($reply.StatusCode -eq 200) { Start-Process $target; break } } catch {}; Start-Sleep -Seconds 1 }'
$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($browserLauncher))
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile', '-NonInteractive', '-EncodedCommand', $encoded)
& $npmCommand.Source run dev
exit $LASTEXITCODE
