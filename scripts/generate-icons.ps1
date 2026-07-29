# Generates the app icon PNGs used by manifest.webmanifest and apple-touch-icon.
# One-time asset generation (Windows-only, uses System.Drawing) — re-run if you
# want to change the icon design. Output files are committed to the repo.

Add-Type -AssemblyName System.Drawing

$sizes = @(32, 180, 192, 512)
$bg = [System.Drawing.Color]::FromArgb(255, 0x6c, 0x8c, 0xff)
$fg = [System.Drawing.Color]::White

$outDir = Join-Path $PSScriptRoot "..\icons"
if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir | Out-Null
}

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $g.Clear($bg)

    $fontSize = [single]($size * 0.62)
    $font = New-Object System.Drawing.Font("Georgia", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $brush = New-Object System.Drawing.SolidBrush $fg
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center

    $rect = New-Object System.Drawing.RectangleF 0, ([float]($size * -0.03)), $size, $size
    $g.DrawString("?", $font, $brush, $rect, $format)

    $outPath = Join-Path $outDir "icon-$size.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $g.Dispose()
    $bmp.Dispose()
    $font.Dispose()
    $brush.Dispose()

    Write-Host "Wrote $outPath"
}
