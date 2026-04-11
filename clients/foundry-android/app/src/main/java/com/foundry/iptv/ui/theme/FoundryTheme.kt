package com.foundry.iptv.ui.theme

import androidx.compose.runtime.Composable
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme

/**
 * Top-level theme for the Foundry IPTV client. Wrap the app content in
 * this composable so every screen inherits the brand colors and TV-tuned
 * typography.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun FoundryTheme(content: @Composable () -> Unit) {
    val colors = darkColorScheme(
        primary = FoundryColors.Orange,
        onPrimary = FoundryColors.OnPrimary,
        primaryContainer = FoundryColors.OrangeDim,
        onPrimaryContainer = FoundryColors.OnBackground,
        secondary = FoundryColors.OrangeBright,
        onSecondary = FoundryColors.OnPrimary,
        background = FoundryColors.Background,
        onBackground = FoundryColors.OnBackground,
        surface = FoundryColors.Surface,
        onSurface = FoundryColors.OnSurface,
        surfaceVariant = FoundryColors.SurfaceVariant,
        onSurfaceVariant = FoundryColors.OnSurfaceVariant,
    )
    MaterialTheme(
        colorScheme = colors,
        typography = FoundryTypography,
        content = content,
    )
}
