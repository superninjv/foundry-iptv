package com.foundry.iptv.ui.theme

import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Typography

/**
 * Tailwind-scale typography matching the web app's type system 1:1.
 *
 * Tailwind → sp mapping (root font-size = 16px):
 *   text-xs   → 12.sp
 *   text-sm   → 14.sp
 *   text-base → 16.sp
 *   text-lg   → 18.sp
 *   text-xl   → 20.sp
 *   text-2xl  → 24.sp
 *   text-3xl  → 30.sp
 *   text-4xl  → 36.sp
 *
 * Weight mapping:
 *   font-medium   → FontWeight.Medium (500)
 *   font-semibold → FontWeight.SemiBold (600)
 *   font-bold     → FontWeight.Bold (700)
 */
@OptIn(ExperimentalTvMaterial3Api::class)
val FoundryTypography = Typography(
    displayLarge = TextStyle(fontSize = 36.sp, fontWeight = FontWeight.Bold),        // text-4xl bold
    displayMedium = TextStyle(fontSize = 30.sp, fontWeight = FontWeight.Bold),       // text-3xl bold
    displaySmall = TextStyle(fontSize = 24.sp, fontWeight = FontWeight.Bold),        // text-2xl bold
    headlineLarge = TextStyle(fontSize = 24.sp, fontWeight = FontWeight.Bold),       // text-2xl bold
    headlineMedium = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.SemiBold),  // text-xl semibold
    headlineSmall = TextStyle(fontSize = 18.sp, fontWeight = FontWeight.SemiBold),   // text-lg semibold
    titleLarge = TextStyle(fontSize = 18.sp, fontWeight = FontWeight.SemiBold),      // text-lg semibold
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),     // text-base semibold
    titleSmall = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.SemiBold),      // text-sm semibold
    bodyLarge = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.Normal),         // text-base
    bodyMedium = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Normal),        // text-sm
    bodySmall = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Normal),         // text-xs
    labelLarge = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Medium),        // text-sm medium
    labelMedium = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium),       // text-xs medium
    labelSmall = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium),        // text-xs medium
)
