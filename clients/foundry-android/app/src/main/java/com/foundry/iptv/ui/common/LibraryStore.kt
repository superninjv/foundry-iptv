package com.foundry.iptv.ui.common

import android.content.Context
import com.foundry.iptv.core.Channel
import com.foundry.iptv.core.SeriesItem
import com.foundry.iptv.core.VodItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * Process-wide cache for the user's *library* — the set of items they have
 * already watched, scoped server-side by `iptv_watch_history`.
 *
 * Jack's mandate: "the only way we find things is through search". Every
 * library tab (Live / Guide / VOD / Series) renders from these lists and
 * never touches the full catalog. The Rust side already applies a 5 s TTL to
 * `list_library_*`; this adds a Kotlin-side 10 s burst-suppression so rapid
 * tab switches within the same window don't even pay the JNI crossing.
 *
 * Thread-safe via per-kind [Mutex]. Call [invalidate] after a new watch is
 * recorded so the next tab visit refetches.
 */
object LibraryStore {
    private data class CacheEntry<T>(val at: Long, val data: T)

    private const val TTL_MS = 10_000L

    private val liveMutex = Mutex()
    private val vodMutex = Mutex()
    private val seriesMutex = Mutex()

    @Volatile private var live: CacheEntry<List<Channel>>? = null
    @Volatile private var vod: CacheEntry<List<VodItem>>? = null
    @Volatile private var series: CacheEntry<List<SeriesItem>>? = null

    suspend fun getLive(context: Context, force: Boolean = false): List<Channel> {
        if (!force) fresh(live)?.let { return it }
        return liveMutex.withLock {
            if (!force) fresh(live)?.let { return@withLock it }
            val data = withContext(Dispatchers.IO) {
                ApiClientHolder.get(context).listLibraryLive()
            }
            live = CacheEntry(System.currentTimeMillis(), data)
            data
        }
    }

    suspend fun getVod(context: Context, force: Boolean = false): List<VodItem> {
        if (!force) fresh(vod)?.let { return it }
        return vodMutex.withLock {
            if (!force) fresh(vod)?.let { return@withLock it }
            val data = withContext(Dispatchers.IO) {
                ApiClientHolder.get(context).listLibraryVod()
            }
            vod = CacheEntry(System.currentTimeMillis(), data)
            data
        }
    }

    suspend fun getSeries(context: Context, force: Boolean = false): List<SeriesItem> {
        if (!force) fresh(series)?.let { return it }
        return seriesMutex.withLock {
            if (!force) fresh(series)?.let { return@withLock it }
            val data = withContext(Dispatchers.IO) {
                ApiClientHolder.get(context).listLibrarySeries()
            }
            series = CacheEntry(System.currentTimeMillis(), data)
            data
        }
    }

    /** Drop all cached entries. Next getter call will refetch. */
    fun invalidate() {
        live = null
        vod = null
        series = null
    }

    private fun <T> fresh(entry: CacheEntry<T>?): T? {
        if (entry == null) return null
        val age = System.currentTimeMillis() - entry.at
        return if (age < TTL_MS) entry.data else null
    }
}
