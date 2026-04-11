package com.foundry.iptv.player

import android.content.Context
import android.view.ViewGroup
import androidx.media3.common.MediaItem
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.ui.PlayerView

// TODO: delete after W3-A merge
//
// Temporary shim for W3-A's WarmPlayerPool so W3-B (Multiview) can build in
// isolation in its worktree. W4-A's glue phase will delete this file when the
// real WarmPlayerPool.kt lands in `player/`.
//
// The shape matches the public API documented in the W3-B handoff:
//   class WarmPlayerPool(context, capacity)
//     fun prepare(channelId, hlsUrl)
//     fun attachFocused(channelId, playerView)
//     fun attachMuted(channelId, playerView)
//     fun release(channelId)
//     fun releaseAll()
//
// This shim is a minimally working implementation so the APK is not broken
// at runtime even if a real merge slips. Real W3-A version will manage an
// LRU pool with proper surface handoff hygiene; this version just builds one
// ExoPlayer per channel and hands it the requested PlayerView.
class WarmPlayerPool(
    private val context: Context,
    @Suppress("unused") private val capacity: Int,
) {
    private val players: MutableMap<String, ExoPlayer> = linkedMapOf()
    private val attached: MutableMap<String, PlayerView> = mutableMapOf()

    fun prepare(channelId: String, hlsUrl: String) {
        if (players.containsKey(channelId)) return
        val player = ExoPlayer.Builder(context).build().also { p ->
            val source = HlsMediaSource.Factory(DefaultHttpDataSource.Factory())
                .createMediaSource(MediaItem.fromUri(hlsUrl))
            p.setMediaSource(source)
            p.volume = 0f
            p.playWhenReady = true
            p.prepare()
        }
        players[channelId] = player
    }

    fun attachFocused(channelId: String, playerView: PlayerView) {
        val player = players[channelId] ?: return
        detachExisting(channelId, playerView)
        playerView.player = player
        playerView.layoutParams = playerView.layoutParams ?: ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        )
        player.volume = 1f
        player.playWhenReady = true
        attached[channelId] = playerView
    }

    fun attachMuted(channelId: String, playerView: PlayerView) {
        val player = players[channelId] ?: return
        detachExisting(channelId, playerView)
        playerView.player = player
        player.volume = 0f
        player.playWhenReady = true
        attached[channelId] = playerView
    }

    fun release(channelId: String) {
        attached.remove(channelId)?.apply { player = null }
        players.remove(channelId)?.release()
    }

    fun releaseAll() {
        attached.values.forEach { it.player = null }
        attached.clear()
        players.values.forEach { it.release() }
        players.clear()
    }

    private fun detachExisting(channelId: String, newView: PlayerView) {
        val previous = attached[channelId]
        if (previous != null && previous !== newView) {
            previous.player = null
        }
    }
}
