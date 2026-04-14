package com.foundry.iptv.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Foundry brand palette — 1:1 mapping of the web app's CSS variables declared
 * in `src/app/globals.css:3-14`. Every hex below cites the exact CSS var so
 * the native client stays pixel-parity with the SSR web client.
 *
 * Web CSS vars (`src/app/globals.css:3`):
 *   --bg:         #07090c
 *   --bg-raised:  #0e1218
 *   --fg:         #e7ecf3
 *   --fg-muted:   #8893a4
 *   --accent:     #ff9548
 *   --border:     #1a1f28
 *   --success:    #34d399
 *   --error:      #f87171
 *   --hover:      #161c26
 */
object FoundryColors {
    // --- Accent (--accent #ff9548) -----------------------------------------
    // `src/app/globals.css:8`
    val Orange = Color(0xFFFF9548)
    // Focus-ring is rgba(255, 149, 72, 0.5) in the web
    // (`src/app/globals.css:13`). We expose OrangeDim for subtle fills like
    // "skip ads" chip background (rgba 0.2 against --bg-raised).
    val OrangeDim = Color(0xFF993D17)
    val OrangeBright = Color(0xFFFFB27A)

    // --- Surfaces ----------------------------------------------------------
    // Background (--bg #07090c) `src/app/globals.css:4`
    val Background = Color(0xFF07090C)
    // Raised surface for cards (--bg-raised #0e1218) `src/app/globals.css:5`
    val Surface = Color(0xFF0E1218)
    // Hover / focus surface (--hover #161c26) `src/app/globals.css:12`
    val SurfaceVariant = Color(0xFF161C26)
    // Slightly brighter lift used for focused-card backgrounds. No direct
    // web equivalent (web uses outline + border colour only); keep a subtle
    // lift so D-pad focus is obvious on a 10-foot display without scaling.
    val SurfaceBright = Color(0xFF1A2030)

    // --- Foreground (--fg #e7ecf3, --fg-muted #8893a4) ---------------------
    // `src/app/globals.css:6-7`
    val OnBackground = Color(0xFFE7ECF3)
    val OnSurface = Color(0xFFE7ECF3)
    val OnSurfaceVariant = Color(0xFF8893A4)
    // Accent buttons use the background color for text (web: color: var(--bg))
    val OnPrimary = Color(0xFF07090C)

    // --- Border (--border #1a1f28) -----------------------------------------
    // `src/app/globals.css:9`
    val Border = Color(0xFF1A1F28)
    val BorderFocused = Orange

    // --- Status ------------------------------------------------------------
    // --error #f87171 (`src/app/globals.css:11`)
    val Error = Color(0xFFF87171)
    // --success #34d399 (`src/app/globals.css:10`)
    val Success = Color(0xFF34D399)
}
