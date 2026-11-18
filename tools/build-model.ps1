# Full pipeline for one system: FBX -> glb + manifest -> meshopt compression.
# Usage: powershell -File tools/build-model.ps1 -System skeletal -Fbx SkeletalSystem100.fbx
# Blender: set $env:BLENDER to blender.exe, otherwise the default Windows install path is used.
param(
	[Parameter(Mandatory = $true)][string]$System,
	[Parameter(Mandatory = $true)][string]$Fbx
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$blender = $env:BLENDER
if (-not $blender) {
	$blender = Get-ChildItem 'C:\Program Files\Blender Foundation\*\blender.exe' -ErrorAction SilentlyContinue |
		Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $blender -or -not (Test-Path $blender)) { throw 'Blender not found. Set $env:BLENDER to blender.exe.' }

$src = Join-Path $root "tools\source\$Fbx"
$glb = Join-Path $root "static\models\$System.glb"
$json = Join-Path $root "src\lib\data\manifest\$System.json"
New-Item -ItemType Directory -Force (Split-Path $glb), (Split-Path $json) | Out-Null

& $blender -b --factory-startup -P (Join-Path $PSScriptRoot 'convert.py') -- $src $System $glb $json 2>&1 |
	Select-String 'CONVERTED|Error|Traceback'
& (Join-Path $PSScriptRoot 'compress.ps1') -System $System
