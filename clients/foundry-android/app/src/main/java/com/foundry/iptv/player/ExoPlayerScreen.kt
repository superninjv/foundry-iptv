package com.foundry.iptv.player

import android.view.ViewGroup
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.ui.PlayerView
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text

/**
 * Full-screen ExoPlayer composable for HLS playback.
 *
 * @deprecated W1-D introduced [PlayerHost] as the reusable replacement. This function
 * remains only because [MainActivity] still imports it; W4-A will migrate callers to
 * [PlayerHost] and delete this file. Do not add new call sites.
 */
@Deprecated(
    message = "Use PlayerHost from W1-D. Will be removed in W4-A.",
    replaceWith = ReplaceWith("PlayerHost(hlsUrl = hlsUrl, channelName = \"\", onBack = onStop)"),
)
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun ExoPlayerScreen(
    hlsUrl: String,
    onStop: () -> Unit,
) {
    val context = LocalContext.current
    var playerError by remember { mutableStateOf<String?>(null) }

    // Build the ExoPlayer once and bind its lifecycle to this composable.
    val exoPlayer = remember {
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
        onDispose {
            exoPlayer.release()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        // PlayerView — renders the video surface
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                PlayerView(ctx).apply {
                    player = exoPlayer
                    useController = false // custom controls via Compose overlay
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
                }
            },
        )

        // Error overlay
        playerError?.let { msg ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xCC000000)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "Playback error: $msg",
                    color = Color.Red,
                    modifier = Modifier.padding(32.dp),
                )
            }
        }
    }
}
