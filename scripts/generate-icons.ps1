# Generates the app icon PNGs used by manifest.webmanifest and apple-touch-icon.
# One-time asset generation (Windows-only, uses System.Drawing) — re-run if you
# want to change the icon design. Output files are committed to the repo.
#
# Design: a trivia-wheel (colored answer wedges, like a quiz board) on the
# app's accent gradient, with a "T" hub for Trivia — reads clearly down to
# 32px and ties back to the in-app palette (correct/incorrect/accent colors).

Add-Type -AssemblyName System.Drawing

$sizes = @(32, 180, 192, 512)

$accentStart = [System.Drawing.Color]::FromArgb(255, 0x6c, 0x8c, 0xff)
$accentEnd   = [System.Drawing.Color]::FromArgb(255, 0x3f, 0x5f, 0xe0)
$hubText     = [System.Drawing.Color]::FromArgb(255, 0x3f, 0x5f, 0xe0)
$white       = [System.Drawing.Color]::White

# Wedge colors pulled from the app's own palette (accent, correct, incorrect)
# plus a few complementary hues, so the icon feels native to the app.
$wedgeColors = @(
    [System.Drawing.Color]::FromArgb(255, 0xff, 0xd1, 0x4d), # gold
    [System.Drawing.Color]::FromArgb(255, 0xff, 0x6b, 0x6b), # incorrect red
    [System.Drawing.Color]::FromArgb(255, 0x3e, 0xcf, 0x8e), # correct green
    [System.Drawing.Color]::FromArgb(255, 0x6c, 0x8c, 0xff), # accent blue
    [System.Drawing.Color]::FromArgb(255, 0xb3, 0x88, 0xff), # violet
    [System.Drawing.Color]::FromArgb(255, 0x4e, 0xcd, 0xc4)  # teal
)

$outDir = Join-Path $PSScriptRoot "..\icons"
if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir | Out-Null
}

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # Background: diagonal accent gradient, matching the app's --accent color.
    $bgRect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $bgRect, $accentStart, $accentEnd, [single]45.0
    )
    $g.FillRectangle($bgBrush, $bgRect)
    $bgBrush.Dispose()

    $cx = $size / 2.0
    $cy = $size / 2.0
    $wheelD = $size * 0.74
    $wheelX = [single]($cx - $wheelD / 2)
    $wheelY = [single]($cy - $wheelD / 2)
    $wheelRect = New-Object System.Drawing.RectangleF($wheelX, $wheelY, [single]$wheelD, [single]$wheelD)

    # Trivia wheel: six colored answer wedges.
    $sweep = 360.0 / $wedgeColors.Count
    for ($i = 0; $i -lt $wedgeColors.Count; $i++) {
        $start = -90.0 + ($i * $sweep)
        $brush = New-Object System.Drawing.SolidBrush $wedgeColors[$i]
        $g.FillPie($brush, $wheelX, $wheelY, [single]$wheelD, [single]$wheelD, [single]$start, [single]$sweep)
        $brush.Dispose()
    }

    # Thin white ring for separation against the background.
    $ringPenWidth = [Math]::Max(1.0, $size * 0.012)
    $ringPen = New-Object System.Drawing.Pen $white, $ringPenWidth
    $g.DrawEllipse($ringPen, $wheelRect)
    $ringPen.Dispose()

    # Center hub with a "T" (Trivia).
    $hubD = $wheelD * 0.44
    $hubRect = New-Object System.Drawing.RectangleF(
        [single]($cx - $hubD / 2), [single]($cy - $hubD / 2), [single]$hubD, [single]$hubD
    )
    $hubBrush = New-Object System.Drawing.SolidBrush $white
    $g.FillEllipse($hubBrush, $hubRect)
    $hubBrush.Dispose()

    $fontSize = [single]($hubD * 0.58)
    $font = New-Object System.Drawing.Font("Georgia", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $textBrush = New-Object System.Drawing.SolidBrush $hubText
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $textRect = New-Object System.Drawing.RectangleF(
        [single]($cx - $hubD / 2), [single]($cy - $hubD / 2 - $hubD * 0.03), [single]$hubD, [single]$hubD
    )
    $g.DrawString("T", $font, $textBrush, $textRect, $format)

    $outPath = Join-Path $outDir "icon-$size.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $g.Dispose()
    $bmp.Dispose()
    $font.Dispose()
    $textBrush.Dispose()

    Write-Host "Wrote $outPath"
}
