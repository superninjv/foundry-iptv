package com.foundry.iptv.ui.common

import android.content.Context
import com.foundry.iptv.core.ApiClient

/**
 * Process-wide singleton wrapper around [ApiClient]. Every feature screen used
 * to rebuild its own client on every recompose, which meant re-reading
 * SharedPreferences and re-initialising `reqwest` on the Rust side hundreds of
 * times per session. This holder keeps a single instance and only rebuilds
 * when the paired server URL or device token actually change.
 */
object ApiClientHolder {
    private var cached: ApiClient? = null
    private var cachedUrl: String? = null
    private var cachedToken: String? = null
    private val lock = Any()

    /**
     * Returns the shared [ApiClient], or `null` if the device has not been
     * paired yet (missing `server_url` / `device_token` in `foundry_prefs`).
     */
    fun getOrNull(context: Context): ApiClient? {
        val prefs = context.applicationContext
            .getSharedPreferences("foundry_prefs", Context.MODE_PRIVATE)
        val url = prefs.getString("server_url", null) ?: return null
        val token = prefs.getString("device_token", null) ?: return null
        synchronized(lock) {
            if (cached == null || url != cachedUrl || token != cachedToken) {
                cached = ApiClient(url).also { it.setToken(token) }
                cachedUrl = url
                cachedToken = token
            }
            return cached
        }
    }

    /**
     * Returns the shared [ApiClient] or throws if credentials are missing.
     * Use when the caller already knows pairing has completed.
     */
    fun get(context: Context): ApiClient =
        getOrNull(context) ?: error("Foundry: missing credentials — re-pair required")

    /**
     * Forget the cached client so the next [getOrNull] call rebuilds from
     * current prefs. Call this after clearing the device token from prefs
     * (e.g. during unpair). Does NOT mutate the underlying Rust client in
     * place — in-flight FFI calls on the old instance finish with their
     * captured token, which avoids the race where a concurrent request
     * sees a half-torn-down client.
     */
    fun invalidate() {
        synchronized(lock) {
            cached = null
            cachedUrl = null
            cachedToken = null
        }
    }
}
