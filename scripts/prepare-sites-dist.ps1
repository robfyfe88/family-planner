param(
  [string]$ProjectRoot = (Resolve-Path ".").Path
)

$openNext = Join-Path $ProjectRoot ".open-next"
$dist = Join-Path $ProjectRoot "dist"
$server = Join-Path $dist "server"

if (-not (Test-Path -LiteralPath (Join-Path $openNext "worker.js"))) {
  throw "Run npm run build:sites first."
}

New-Item -ItemType Directory -Path $server -Force | Out-Null
Copy-Item -Path (Join-Path $openNext "*") -Destination $server -Recurse -Force
Copy-Item -LiteralPath (Join-Path $openNext "worker.js") -Destination (Join-Path $server "index.js") -Force

$client = Join-Path $dist "client"
New-Item -ItemType Directory -Path $client -Force | Out-Null
Copy-Item -Path (Join-Path $openNext "assets\*") -Destination $client -Recurse -Force

$resolvedServer = (Resolve-Path -LiteralPath $server).Path
if (-not $resolvedServer.StartsWith($ProjectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to prepare an unsafe output path."
}

foreach ($relativePath in @("assets", "cache", "dynamodb-provider")) {
  $target = Join-Path $resolvedServer $relativePath
  if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
  }
}

$modules = Join-Path $resolvedServer "server-functions\default\node_modules"
Get-ChildItem -LiteralPath $modules -Recurse -File -Include "*.d.ts", "*.map" | Remove-Item -Force

$windowsEngine = Join-Path $modules ".prisma\client\query_engine-windows.dll.node"
if (Test-Path -LiteralPath $windowsEngine) {
  Remove-Item -LiteralPath $windowsEngine -Force
}
