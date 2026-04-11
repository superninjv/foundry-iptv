package com.foundry.iptv.player

import android.view.ViewGroup
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.ui.PlayerView

/**
 * Reusable full-screen player composable. Any feature screen (Live, Decks, VOD, etc.)
 * can embed this to play an HLS stream with a [NowPlayingOverlay] chrome layer.
 *
 * D-pad Up/Down dispatch to [onChannelUp] / [onChannelDown] when provided.
 * Back key dispatches to [onBack]. Any key press or focus change re-shows the overlay.
 *
 * Program polling is deferred — callers pass whatever EPG info they have.
 */
@Composable
fun PlayerHost(
    hlsUrl: String,
    channelName: String,
    currentProgramTitle: String? = null,
    programStartMs: Long? = null,
    programEndMs: Long? = null,
    onBack: () -> Unit,
    onChannelUp: (() -> Unit)? = null,
    onChannelDown: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val focusRequester = remember { FocusRequester() }

    // Bump this to re-show the overlay after an interaction.
    var lastInteractionMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var overlayVisible by remember { mutableStateOf(true) }

    fun poke() {
        lastInteractionMs = System.currentTimeMillis()
        overlayVisible = true
    }

    // Auto-hide the overlay 3s after the last interaction.
    LaunchedEffect(lastInteractionMs) {
        kotlinx.coroutines.delay(3_000)
        if (System.currentTimeMillis() - lastInteractionMs >= 3_000) {
            overlayVisible = false
        }
    }

    // Build ExoPlayer once for this composition, keyed on the URL so switching
    // streams tears down and rebuilds cleanly.
    val exoPlayer = remember(hlsUrl) {
        ExoPlayer.Builder(context).build().also { player ->
            val dataSourceFactory = DefaultHttpDataSource.Factory()
            val hlsSource = HlsMediaSource.Factory(dataSourceFactory)
                .createMediaSource(MediaItem.fromUri(hlsUrl))
            player.setMediaSource(hlsSource)
            player.prepare()
            player.playWhenReady = true
        }
    }

    DisposableEffect(exoPlayer) {
        onDispose { exoPlayer.release() }
    }

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(focusRequester)
            .focusable()
            .onFocusChanged { if (it.isFocused) poke() }
            .onKeyEvent { ev ->
                if (ev.type != KeyEventType.KeyDown) {
                    return@onKeyEvent false
                }
                poke()
                when (ev.key) {
                    Key.Back, Key.Escape -> {
                        onBack()
                        true
                    }
                    Key.DirectionUp, Key.ChannelUp -> {
                        onChannelUp?.invoke()
                        onChannelUp != null
                    }
                    Key.DirectionDown, Key.ChannelDown -> {
                        onChannelDown?.invoke()
                        onChannelDown != null
                    }
                    else -> false
                }
            },
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                PlayerView(ctx).apply {
                    player = exoPlayer
                    useController = false
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
                }
            },
        )

        NowPlayingOverlay(
            visible = overlayVisible,
            channelName = channelName,
            currentProgramTitle = currentProgramTitle,
            programStartMs = programStartMs,
            programEndMs = programEndMs,
            modifier = Modifier.fillMaxSize(),
        )
    }
}
