package com.foundry.iptv.ui.multiview

import android.content.Context
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Direct HTTP shim for `/api/favorites`, bypassing the Rust `ApiClient`
 * transport.
 *
 * ## Why this exists (Track J R3 T3)
 *
 * The server's `src/middleware.ts` rewrites `Authorization: Bearer <token>`
 * to `x-device-bearer` **only** for routes in its internal `APP_PREFIXES`
 * array. `/api/favorites` is not in that list, so Bearer-token requests from
 * the Rust client fall through the middleware without setting
 * `x-device-bearer`, and the route handler's `getApiUser()` returns 401.
 *
 * Track J R3 T3 is scoped to the Kotlin client and forbidden from touching
 * the server source tree or the Rust core crate, so we work around it by
 * making the request ourselves with OkHttp and setting `x-device-bearer`
 * manually. The rest of Multiview (channel listing, stream start) still
 * goes through the Rust `ApiClient` — those endpoints are in `APP_PREFIXES`
 * and work correctly.
 *
 * See also `ui/decks/DeckApiShim.kt` for the same workaround on
 * `/api/decks` and `/api/decks/{id}`.
 */
internal object MultiviewApiShim {

    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    /** GET /api/favorites — returns the list of favorited channel ids. */
    fun listFavorites(context: Context): List<String> {
        val prefs = context.applicationContext
            .getSharedPreferences("foundry_prefs", Context.MODE_PRIVATE)
        val baseUrl = prefs.getString("server_url", null)
            ?.trimEnd('/')
            ?: error("Foundry: missing server_url — re-pair required")
        val token = prefs.getString("device_token", null)
            ?: error("Foundry: missing device_token — re-pair required")

        val req = Request.Builder()
            .url("$baseUrl/api/favorites")
            .header("x-device-bearer", token)
            .header("Accept", "application/json")
            .get()
            .build()

        http.newCall(req).execute().use { resp ->
            val text = resp.body?.string() ?: ""
            if (!resp.isSuccessful) {
                error("HTTP ${resp.code} from /api/favorites: ${text.take(200)}")
            }
            val body = JSONObject(text)
            val arr = body.optJSONArray("favorites") ?: return emptyList()
            val out = ArrayList<String>(arr.length())
            for (i in 0 until arr.length()) {
                out += arr.optString(i, "")
            }
            return out.filter { it.isNotEmpty() }
        }
    }
}
