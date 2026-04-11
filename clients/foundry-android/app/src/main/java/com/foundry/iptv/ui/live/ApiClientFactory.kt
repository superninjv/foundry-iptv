package com.foundry.iptv.ui.live

import android.content.Context
import com.foundry.iptv.core.ApiClient

/**
 * Minimal helper that reads the server URL + device token from the pairing
 * SharedPreferences and returns a configured [ApiClient]. Returns null if
 * credentials are missing (the hub should never mount in that state, but we
 * defend against it regardless).
 *
 * Duplicated deliberately inside `ui/live` (and mirrored in `ui/guide`) so
 * this wave's file-ownership boundary stays clean — W4-A can promote this to
 * a shared module later if desired.
 */
internal data class FoundryCredentials(val baseUrl: String, val token: String)

internal fun readCredentials(context: Context): FoundryCredentials? {
    val prefs = context.getSharedPreferences("foundry_prefs", Context.MODE_PRIVATE)
    val url = prefs.getString("server_url", null) ?: return null
    val token = prefs.getString("device_token", null) ?: return null
    return FoundryCredentials(url, token)
}

internal fun buildApiClient(context: Context): ApiClient? {
    val creds = readCredentials(context) ?: return null
    return ApiClient(creds.baseUrl).also { it.setToken(creds.token) }
}
