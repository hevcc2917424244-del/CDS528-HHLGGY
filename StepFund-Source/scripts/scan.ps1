$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
& node.exe node_modules/hardhat/internal/cli/bootstrap.js clean
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& npm.cmd run compile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
New-Item -ItemType Directory -Force reports/security | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
& python -m slither . --hardhat-ignore-compile --filter-paths node_modules --fail-medium --json "reports/security/slither-$stamp.json"
exit $LASTEXITCODE
