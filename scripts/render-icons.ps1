# Renders brand/icons/{16,32,48,128,512}.png from brand/icon-master.png using
# Windows built-in System.Drawing. Zero npm dependencies. Run from repo root:
#
#   powershell -ExecutionPolicy Bypass -File scripts/render-icons.ps1
#
# Rerun this any time brand/icon-master.png changes, then commit the resized
# outputs. scripts/build.mjs copies them verbatim into dist/icons/ at build
# time; there is no runtime image processing in the build.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$masterPath = Join-Path $repoRoot 'brand\icon-master.png'
$outDir = Join-Path $repoRoot 'brand\icons'

if (-not (Test-Path $masterPath)) {
  throw "Master icon not found at $masterPath"
}
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile($masterPath)
try {
  foreach ($size in 16, 32, 48, 128, 512) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
      $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $g.DrawImage($src, 0, 0, $size, $size)
      $outPath = Join-Path $outDir "$size.png"
      $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
      Write-Host "  wrote brand/icons/$size.png"
    } finally {
      $g.Dispose()
      $bmp.Dispose()
    }
  }
} finally {
  $src.Dispose()
}
Write-Host 'Icons rendered. Remember to commit brand/icons/*.png.'
