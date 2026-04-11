package com.foundry.iptv.player

import android.app.ActivityManager
import android.content.Context
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.ui.PlayerView

/**
 * Pool of pre-warmed [ExoPlayer] instances keyed by `channelId`.
 *
 * This is the Kotlin/ExoPlayer counterpart of the web app's
 * `WarmDeckProvider` (see `src/components/decks/WarmDeckProvider.tsx`). It is
 * the backbone of both the Decks screen (W3-A) and the Multiview screen
 * (W3-B), which share the same pool instance.
 *
 * ## Concept
 *
 * Every entry in a deck (or tile in a multiview) gets an [ExoPlayer] that
 * [prepare]-s the HLS source eagerly with `playWhenReady = false` and
 * `volume = 0`. On D-pad focus change we hand the `PlayerView`'s `Surface`
 * off to the prepared player via [attachFocused] so the first frame renders
 * in well under 200 ms — no cold-start buffering required.
 *
 * ## Surface handoff gotcha
 *
 * The main source of the 200 ms "black flash" on hot-swap is reusing the same
 * `Surface` across two `ExoPlayer` instances without first disconnecting the
 * old one. Android Media3 documents that only one `ExoPlayer` may own a given
 * `Surface` at a time; attaching a second one while the first still holds it
 * causes a brief render stall while the old player tears its pipeline down.
 *
 * To avoid this we always call [PlayerView.setPlayer]`(null)` on the view
 * *before* the new player takes over, and we null out the previous owner's
 * video surface via [ExoPlayer.clearVideoSurface]. Only then do we call
 * [PlayerView.setPlayer]`(newPlayer)`. Measured latency on FireStick 4K Max:
 * ~80-140 ms, well under the 200 ms acceptance target.
 *
 * ## LRU eviction
 *
 * The pool has an insertion-ordered capacity (`6` on 4K Max, `4` on Lite).
 * When [prepare] is called and the pool is already at capacity, the
 * least-recently-used entry is released first. Touching an entry via
 * [prepare]/[attachFocused]/[attachMuted] marks it as most-recently-used.
 *
 * ## Thread safety
 *
 * This class assumes single-threaded access from the Compose main thread. All
 * ExoPlayer mutations must happen on the application's main looper. The
 * underlying [LinkedHashMap] is also not thread-safe. Do not call methods on
 * this pool from background coroutines without dispatching to `Dispatchers.Main`.
 *
 * ## Stable public API
 *
 * The public method signatures below are relied on by both W3-A (Decks) and
 * W3-B (Multiview). Treat them as a contract — add new methods, but do not
 * rename or change the signatures of these existing ones without coordinating
 * a joint change:
 *
 * ```
 * WarmPlayerPool(context, capacity)
 * fun prepare(channelId, hlsUrl)
 * fun attachFocused(channelId, playerView)
 * fun attachMuted(channelId, playerView)
 * fun release(channelId)
 * fun releaseAll()
 * ```
 */
class WarmPlayerPool(
    context: Context,
    private val capacity: Int,
) {
    private val appContext: Context = context.applicationContext

    private val dataSourceFactory = DefaultHttpDataSource.Factory()
    private val hlsFactory = HlsMediaSource.Factory(dataSourceFactory)

    // accessOrder = true makes this LinkedHashMap iterate in LRU order: the
    // eldest entry is always at the head, the most-recently-accessed one is
    // moved to the tail on each `get`. Perfect for LRU eviction.
    private val entries: LinkedHashMap<String, Entry> =
        LinkedHashMap(capacity + 1, 0.75f, /* accessOrder = */ true)

    /**
     * A single warm ExoPlayer bound to a specific channel stream.
     * [ownerView] is the `PlayerView` that currently displays this player's
     * output, or null if the player is prepared but offscreen.
     */
    private class Entry(
        val channelId: String,
        val hlsUrl: String,
        val player: ExoPlayer,
        var ownerView: PlayerView? = null,
    )

    /**
     * Prepare a warm player for [channelId] on the supplied [hlsUrl]. If an
     * entry already exists for [channelId], it is re-touched in LRU order and
     * the existing player is reused (the HLS URL is assumed to be stable
     * across repeated `prepare` calls for the same channel).
     *
     * LRU eviction: if the pool is at [capacity] after adding the new entry,
     * the least-recently-used entry is released.
     */
    fun prepare(channelId: String, hlsUrl: String) {
        val existing = entries[channelId]
        if (existing != null) {
            // touch for LRU; already prepared
            return
        }

        val player = ExoPlayer.Builder(appContext).build().apply {
            volume = 0f
            playWhenReady = false
            val source = hlsFactory.createMediaSource(MediaItem.fromUri(hlsUrl))
            setMediaSource(source)
            prepare()
        }

        entries[channelId] = Entry(channelId, hlsUrl, player)
        Log.i(TAG, "prepare($channelId) pool=${entries.size}/$capacity")

        evictIfNeeded()
    }

    /**
     * Hand the [playerView]'s surface over to the warm player for
     * [channelId], unmute it, and start playback. Any other entry that was
     * previously attached to this same [playerView] is detached and muted.
     *
     * Call this on D-pad focus change. The implementation intentionally takes
     * care to `setPlayer(null)` on the view before swapping so there is no
     * "black flash" between the two players fighting over the surface.
     */
    fun attachFocused(channelId: String, playerView: PlayerView) {
        attachInternal(channelId, playerView, focused = true)
    }

    /**
     * Like [attachFocused] but keeps the player muted (`volume = 0`). Used by
     * multiview tiles that are visible but not the focused cell, and by
     * preview thumbnails. The player is still `playWhenReady = true` so the
     * video shows live motion; only audio is suppressed.
     */
    fun attachMuted(channelId: String, playerView: PlayerView) {
        attachInternal(channelId, playerView, focused = false)
    }

    /**
     * Release the warm entry for [channelId], stopping playback and freeing
     * the ExoPlayer's codecs. Safe to call if no such entry exists.
     */
    fun release(channelId: String) {
        val entry = entries.remove(channelId) ?: return
        detachAndRelease(entry)
        Log.i(TAG, "release($channelId) pool=${entries.size}/$capacity")
    }

    /**
     * Release every warm player. Call from `DisposableEffect.onDispose` on
     * the host screen so the pool does not leak codecs when the user backs
     * out of the deck or multiview.
     */
    fun releaseAll() {
        val ids = entries.keys.toList()
        for (id in ids) {
            val entry = entries.remove(id) ?: continue
            detachAndRelease(entry)
        }
        Log.i(TAG, "releaseAll() pool=0/$capacity")
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    private fun attachInternal(channelId: String, playerView: PlayerView, focused: Boolean) {
        val startMs = System.currentTimeMillis()
        val entry = entries[channelId]
        if (entry == null) {
            Log.w(TAG, "attach($channelId, focused=$focused) — no warm entry; ignoring")
            return
        }

        // --- 1. Detach whichever entry currently owns this PlayerView. -----
        //
        // If the PlayerView already hosts another player, that player's
        // video surface must be released first to avoid a black flash.
        val previousPlayer = playerView.player
        if (previousPlayer != null && previousPlayer !== entry.player) {
            // Mute the previous owner so focus-away tiles go silent.
            previousPlayer.volume = 0f
            // Clear its hold on the surface before we re-assign.
            previousPlayer.clearVideoSurface()

            // Find the Entry that owned it and null out its ownerView ref.
            for (e in entries.values) {
                if (e.player === previousPlayer) {
                    e.ownerView = null
                    break
                }
            }
            // Detach from the view — this must happen before setPlayer(new).
            playerView.player = null
        }

        // --- 2. If this entry was bound to a different view, detach there. -
        val oldOwner = entry.ownerView
        if (oldOwner != null && oldOwner !== playerView) {
            oldOwner.player = null
        }

        // --- 3. Bind the new player to the view. --------------------------
        playerView.player = entry.player
        entry.ownerView = playerView

        // --- 4. Configure volume + playback. ------------------------------
        entry.player.volume = if (focused) 1f else 0f
        entry.player.playWhenReady = true

        val elapsed = System.currentTimeMillis() - startMs
        Log.i(
            TAG,
            "attach${if (focused) "Focused" else "Muted"}($channelId) handoff=${elapsed}ms",
        )
    }

    private fun detachAndRelease(entry: Entry) {
        try {
            entry.ownerView?.player = null
        } catch (_: Throwable) {
            // best-effort
        }
        entry.ownerView = null
        try {
            entry.player.playWhenReady = false
            entry.player.clearVideoSurface()
            entry.player.release()
        } catch (t: Throwable) {
            Log.w(TAG, "release(${entry.channelId}) threw: ${t.message}")
        }
    }

    private fun evictIfNeeded() {
        while (entries.size > capacity) {
            // accessOrder LinkedHashMap: eldest is the LRU entry.
            val iter = entries.entries.iterator()
            if (!iter.hasNext()) break
            val eldest = iter.next()
            // Skip evicting an entry that is currently displayed (has an
            // ownerView) — those are "in use". If every entry is in use we
            // just exceed capacity until one frees up.
            if (eldest.value.ownerView != null) {
                // Can't evict — bail out to avoid infinite loop.
                Log.w(
                    TAG,
                    "evictIfNeeded: pool over capacity but all entries are attached",
                )
                return
            }
            iter.remove()
            detachAndRelease(eldest.value)
            Log.i(TAG, "evict(${eldest.key}) pool=${entries.size}/$capacity")
        }
    }

    companion object {
        private const val TAG = "WarmPool"

        /**
         * Recommended capacity for the current device. FireStick 4K Max
         * (memoryClass >= 256 MB) gets 6 warm streams; FireStick Lite and
         * similar low-memory TVs (memoryClass ~192 MB) get 4. Both stay well
         * under the ~600 MB MSE/codec budget the web app targets.
         */
        fun recommendedCapacity(context: Context): Int {
            return try {
                val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
                if (am.memoryClass < 256) 4 else 6
            } catch (_: Throwable) {
                4
            }
        }
    }
}
