package com.foundry.iptv.ui.common

import android.content.Context
import android.util.Log
import com.foundry.iptv.core.MediaType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Global watch-history sink. Every screen that mounts `PlayerHost` should
 * fire-and-forget one of these calls immediately before or in parallel with
 * its `startStream` / `startVodStream` / `startEpisodeStream` request so the
 * server has a record of what the user actually watched.
 */
object WatchTracker {
    private const val TAG = "FoundryWatchTracker"

    /**
     * Fire-and-forget record. Grabs the shared [ApiClientHolder] client and
     * dispatches to [Dispatchers.IO]; failures are logged but never thrown.
     *
     * @param scope caller's coroutine scope so the work is tied to screen
     *              lifetime (use `rememberCoroutineScope()` in Compose).
     */
    fun recordWatch(
        scope: CoroutineScope,
        context: Context,
        kind: MediaType,
        id: String,
        displayName: String?,
    ) {
        scope.launch(Dispatchers.IO) {
            runCatching {
                ApiClientHolder.getOrNull(context)
                    ?.recordWatchHistory(kind, id, displayName)
            }.onFailure { Log.w(TAG, "recordWatch($kind,$id) failed: ${it.message}") }
        }
    }
}
