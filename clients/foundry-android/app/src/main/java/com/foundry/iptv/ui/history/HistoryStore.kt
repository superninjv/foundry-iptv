package com.foundry.iptv.ui.history

import android.content.Context
import com.foundry.iptv.core.ApiClient
import com.foundry.iptv.core.Channel
import com.foundry.iptv.core.WatchHistoryEntry
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.format.DateTimeParseException

/**
 * Merged watch-history record used by the UI layer.
 *
 * Primary source is the server via [ApiClient.listWatchHistory]; the local
 * SharedPreferences fallback ([LocalHistoryStore]) supplements entries for
 * playback initiated from [HistoryScreen] / [com.foundry.iptv.ui.nowplaying.NowPlayingDeck]
 * itself. Merging is done by [mergeHistory].
 *
 * Known limitation: because Wave 3-C owns only the ui/history and
 * ui/nowplaying packages, the local fallback can only observe playback that
 * starts from within these two screens. Playback initiated from Live / Guide
 * / VOD / Decks / Multiview / Search is NOT recorded locally. W4-A can add
 * a global playback-start hook later.
 */
data class HistoryItem(
    val channelId: String,
    val channelName: String,
    val timestampMs: Long,
    val channel: Channel?,
)

/**
 * SharedPreferences-backed local history store.
 *
 * Stored under the `foundry_history` prefs file as a JSON array in the `items`
 * key. Each record = `{channelId, channelName, timestampMs}`. Capped at 50
 * entries, newest first.
 */
object LocalHistoryStore {
    private const val PREFS = "foundry_history"
    private const val KEY = "items"
    private const val MAX_ENTRIES = 50

    data class Local(
        val channelId: String,
        val channelName: String,
        val timestampMs: Long,
    )

    fun record(ctx: Context, channelId: String, channelName: String) {
        val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val existing = read(ctx).toMutableList()
        // Dedup: drop any prior entry for this channel.
        existing.removeAll { it.channelId == channelId }
        existing.add(
            0,
            Local(
                channelId = channelId,
                channelName = channelName,
                timestampMs = System.currentTimeMillis(),
            ),
        )
        val trimmed = existing.take(MAX_ENTRIES)
        val arr = JSONArray()
        for (item in trimmed) {
            arr.put(
                JSONObject().apply {
                    put("channelId", item.channelId)
                    put("channelName", item.channelName)
                    put("timestampMs", item.timestampMs)
                },
            )
        }
        prefs.edit().putString(KEY, arr.toString()).apply()
    }

    fun read(ctx: Context): List<Local> {
        val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val raw = prefs.getString(KEY, null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            buildList {
                for (i in 0 until arr.length()) {
                    val obj = arr.getJSONObject(i)
                    add(
                        Local(
                            channelId = obj.optString("channelId"),
                            channelName = obj.optString("channelName"),
                            timestampMs = obj.optLong("timestampMs"),
                        ),
                    )
                }
            }
        } catch (_: Throwable) {
            emptyList()
        }
    }
}

/**
 * Parse an ISO-8601 timestamp returned by the server into epoch millis.
 * Returns 0 if unparsable — the UI displays that as "just now" gracefully
 * via [relativeTime] which handles tiny values.
 */
internal fun parseServerTs(value: String): Long {
    return try {
        Instant.parse(value).toEpochMilli()
    } catch (_: DateTimeParseException) {
        0L
    } catch (_: Throwable) {
        0L
    }
}

/**
 * Merge server history (primary) with local prefs fallback.
 *
 *  1. Convert both to [HistoryItem] keyed by channel.
 *  2. Prefer the newer timestamp when the same channel appears in both.
 *  3. Sort by timestamp descending.
 *  4. Return top 30.
 */
fun mergeHistory(
    serverHistory: List<WatchHistoryEntry>,
    local: List<LocalHistoryStore.Local>,
    channelsById: Map<String, Channel>,
): List<HistoryItem> {
    val merged = linkedMapOf<String, HistoryItem>()

    for (entry in serverHistory) {
        val ts = parseServerTs(entry.startedAt)
        val ch = channelsById[entry.channelId]
        val name = ch?.name ?: entry.channelId
        merged[entry.channelId] = HistoryItem(
            channelId = entry.channelId,
            channelName = name,
            timestampMs = ts,
            channel = ch,
        )
    }

    for (l in local) {
        val existing = merged[l.channelId]
        if (existing == null || l.timestampMs > existing.timestampMs) {
            val ch = channelsById[l.channelId]
            merged[l.channelId] = HistoryItem(
                channelId = l.channelId,
                channelName = ch?.name ?: l.channelName,
                timestampMs = l.timestampMs,
                channel = ch,
            )
        }
    }

    return merged.values
        .sortedByDescending { it.timestampMs }
        .take(30)
}

/**
 * Human-friendly relative time string: "just now", "5m ago", "2h ago",
 * "3d ago". Negative / zero inputs clamp to "just now".
 */
fun relativeTime(timestampMs: Long, nowMs: Long = System.currentTimeMillis()): String {
    if (timestampMs <= 0) return "recently"
    val diff = nowMs - timestampMs
    if (diff < 60_000) return "just now"
    val minutes = diff / 60_000
    if (minutes < 60) return "watched ${minutes}m ago"
    val hours = minutes / 60
    if (hours < 24) return "watched ${hours}h ago"
    val days = hours / 24
    return "watched ${days}d ago"
}
