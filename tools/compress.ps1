# Compress an exported system .glb in place with meshopt.
# Usage: powershell -File tools/compress.ps1 skeletal
# --join false / --instance false keep one node per mesh so parts stay individually
# selectable and hideable in the viewer.
param([Parameter(Mandatory = $true)][string]$System)

$ErrorActionPreference = 'Stop'
$glb = Join-Path $PSScriptRoot "..\static\models\$System.glb"
$before = (Get-Item $glb).Length

npx --yes @gltf-transform/cli@4 optimize $glb $glb `
	--compress meshopt `
	--texture-compress false `
	--join false `
	--instance false `
	--simplify false

$after = (Get-Item $glb).Length
"{0}: {1:N1} MB -> {2:N1} MB" -f $System, ($before / 1MB), ($after / 1MB)
