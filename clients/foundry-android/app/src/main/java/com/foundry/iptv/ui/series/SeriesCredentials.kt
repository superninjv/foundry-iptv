package com.foundry.iptv.ui.series

import android.content.Context

/**
 * Pairing credentials snapshot for the series package. Mirrors the helper
 * inside `ui/vod` — each package keeps its own reader so file ownership
 * boundaries between wave agents stay clean.
 */
internal data class Credentials(val serverUrl: String, val token: String)

internal fun readCredentials(context: Context): Credentials? {
    val prefs = context.getSharedPreferences("foundry_prefs", Context.MODE_PRIVATE)
    val serverUrl = prefs.getString("server_url", null)
    val token = prefs.getString("device_token", null)
    if (serverUrl.isNullOrBlank() || token.isNullOrBlank()) return null
    return Credentials(serverUrl, token)
}
