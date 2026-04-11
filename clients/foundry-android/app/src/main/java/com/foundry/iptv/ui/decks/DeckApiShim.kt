package com.foundry.iptv.ui.decks

import android.content.Context
import com.foundry.iptv.core.Channel
import com.foundry.iptv.core.Deck
import com.foundry.iptv.core.DeckEntry
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Direct HTTP shim for the decks endpoints, bypassing the Rust `ApiClient`
 * transport.
 *
 * ## Why this exists (Track J R3 T3)
 *
 * The server's `src/middleware.ts` rewrites `Authorization: Bearer <token>`
 * into an `x-device-bearer` request header — but **only** for routes listed
 * in its internal `APP_PREFIXES` array. `/api/channels`, `/api/stream`, etc.
 * are in that list, so the Rust `ApiClient` (which uses `reqwest::bearer_auth`)
 * reaches every Live/Guide/VOD/Series/Search/Settings endpoint just fine.
 *
 * `/api/decks`, `/api/decks/{id}`, and `/api/favorites` are **not** in
 * `APP_PREFIXES`. When the middleware sees a Bearer token on those paths it
 * falls through without setting `x-device-bearer`, so the route handler's
 * `getApiUser()` (in `src/lib/auth/session.ts`) finds neither a cookie session
 * nor a bearer header and returns HTTP 401. The Rust client then maps that
 * 401 via `Self::check` → `ApiError::Unauthenticated`, which stringifies to
 * "Unauthenticated — call set_token() first" — the exact error this wave is
 * fixing.
 *
 * The proper long-term fix is to extend `APP_PREFIXES` in `src/middleware.ts`
 * (or to have `getApiUser()` read `Authorization` directly). Track J R3 T3 is
 * scoped to the Kotlin FireStick client and is explicitly forbidden from
 * touching the server source tree or the Rust core crate, so we work around
 * the server bug here by issuing the request ourselves with OkHttp and setting
 * `x-device-bearer` manually — exactly the header the route handler reads.
 *
 * The `Deck` / `DeckEntry` / `Channel` data classes we return are the same
 * types produced by the uniffi-generated FFI, so the rest of the Decks UI is
 * unchanged.
 */
internal object DeckApiShim {

    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    /** GET /api/decks — returns a list of summary decks (entries left empty). */
    fun listDecks(context: Context): List<Deck> {
        val (url, token) = credentials(context)
        val body = httpGetJson("$url/api/decks", token)
        val arr = body.optJSONArray("decks") ?: return emptyList()
        val out = ArrayList<Deck>(arr.length())
        for (i in 0 until arr.length()) {
            val d = arr.optJSONObject(i) ?: continue
            out += Deck(
                id = stringifyId(d, "id"),
                name = d.optString("name", ""),
                entries = emptyList(), // list endpoint does not include entries
            )
        }
        return out
    }

    /** GET /api/decks/{id} — returns a fully-populated deck with entries. */
    fun getDeck(context: Context, deckId: String): Deck {
        val (url, token) = credentials(context)
        val body = httpGetJson("$url/api/decks/$deckId", token)
        val d = body.optJSONObject("deck")
            ?: error("decks API: missing 'deck' field")
        val entriesArr = d.optJSONArray("entries") ?: JSONArray()
        val entries = ArrayList<DeckEntry>(entriesArr.length())
        for (i in 0 until entriesArr.length()) {
            val e = entriesArr.optJSONObject(i) ?: continue
            val channelId = e.optString("channelId", e.optString("channel_id", ""))
            val position = e.optInt("position", i)
            val inCommercial = e.optBoolean(
                "inCommercial",
                e.optBoolean("in_commercial", false),
            )
            val channelJson = e.optJSONObject("channel")
            val channel = channelJson?.let { parseChannel(it) }
            entries += DeckEntry(
                channelId = channelId,
                position = position,
                inCommercial = inCommercial,
                channel = channel,
            )
        }
        return Deck(
            id = stringifyId(d, "id"),
            name = d.optString("name", ""),
            entries = entries,
        )
    }

    // ---------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------

    private fun credentials(context: Context): Pair<String, String> {
        val prefs = context.applicationContext
            .getSharedPreferences("foundry_prefs", Context.MODE_PRIVATE)
        val url = prefs.getString("server_url", null)
            ?: error("Foundry: missing server_url — re-pair required")
        val token = prefs.getString("device_token", null)
            ?: error("Foundry: missing device_token — re-pair required")
        return url.trimEnd('/') to token
    }

    private fun httpGetJson(url: String, token: String): JSONObject {
        val req = Request.Builder()
            .url(url)
            // The middleware strips/rewrites Authorization only for routes in
            // APP_PREFIXES; for /api/decks and /api/favorites it does not, so
            // we set the header the route handler actually reads.
            .header("x-device-bearer", token)
            .header("Accept", "application/json")
            .get()
            .build()
        http.newCall(req).execute().use { resp ->
            val text = resp.body?.string() ?: ""
            if (!resp.isSuccessful) {
                error("HTTP ${resp.code} from $url: ${text.take(200)}")
            }
            return JSONObject(text)
        }
    }

    private fun stringifyId(obj: JSONObject, key: String): String {
        val v = obj.opt(key) ?: return ""
        return v.toString()
    }

    private fun parseChannel(c: JSONObject): Channel {
        // The server's `/api/decks/{id}` response uses `logo` for the art URL
        // and may omit `group` / `tvgId`. Match the uniffi Channel shape.
        return Channel(
            id = c.optString("id", ""),
            name = c.optString("name", ""),
            group = c.optString("group").ifEmpty { null },
            logoUrl = c.optString("logo").ifEmpty {
                c.optString("logoUrl").ifEmpty { null }
            },
            tvgId = c.optString("epgId").ifEmpty {
                c.optString("tvgId").ifEmpty { null }
            },
        )
    }
}
