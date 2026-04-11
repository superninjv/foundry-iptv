package com.foundry.iptv.ui.vod

import android.content.Context

/**
 * Shared helper for reading the persisted pairing credentials — duplicated
 * intentionally inside `ui/vod` so this package owns no files outside its
 * directory tree. Mirrors the helper inside `ui/ChannelList.kt`.
 */
internal data class Credentials(val serverUrl: String, val token: String)

internal fun readCredentials(context: Context): Credentials? {
    val prefs = context.getSharedPreferences("foundry_prefs", Context.MODE_PRIVATE)
    val serverUrl = prefs.getString("server_url", null)
    val token = prefs.getString("device_token", null)
    if (serverUrl.isNullOrBlank() || token.isNullOrBlank()) return null
    return Credentials(serverUrl, token)
}
