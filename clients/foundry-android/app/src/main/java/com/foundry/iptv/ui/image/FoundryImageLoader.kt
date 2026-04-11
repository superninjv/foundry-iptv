package com.foundry.iptv.ui.image

import android.content.Context
import coil3.ImageLoader
import coil3.disk.DiskCache
import coil3.disk.directory
import coil3.memory.MemoryCache
import coil3.request.crossfade
import okio.Path.Companion.toOkioPath

/**
 * Singleton [ImageLoader] used by the Compose TV client for every remote
 * image (channel logos, VOD posters, series artwork, ...).
 *
 * Tuned conservatively for the Fire TV Stick Lite:
 *   - disk cache prioritized over memory (logos easily fit in a 256 MiB slab)
 *   - memory cache capped at 25 % of app RAM so a 52k-channel scroll can't OOM
 *   - cleartext OkHttp (cleartext is already enabled via usesCleartextTraffic
 *     in AndroidManifest.xml — LAN HTTP only, no TLS verification work)
 */
object FoundryImageLoader {
    @Volatile
    private var instance: ImageLoader? = null

    fun get(context: Context): ImageLoader {
        val existing = instance
        if (existing != null) return existing
        synchronized(this) {
            val again = instance
            if (again != null) return again
            val appCtx = context.applicationContext
            val loader = ImageLoader.Builder(appCtx)
                .memoryCache {
                    MemoryCache.Builder()
                        .maxSizePercent(appCtx, 0.25)
                        .build()
                }
                .diskCache {
                    DiskCache.Builder()
                        .directory(appCtx.cacheDir.resolve("img").toOkioPath())
                        .maxSizeBytes(256L * 1024 * 1024) // 256 MiB
                        .build()
                }
                .crossfade(true)
                .build()
            instance = loader
            return loader
        }
    }
}
