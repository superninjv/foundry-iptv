package com.foundry.iptv.ui.live

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text
import com.foundry.iptv.core.Channel
import com.foundry.iptv.core.MediaType
import com.foundry.iptv.player.PlayerHost
import com.foundry.iptv.ui.common.ApiClientHolder
import com.foundry.iptv.ui.common.EmptyLibraryState
import com.foundry.iptv.ui.common.LibraryStore
import com.foundry.iptv.ui.common.WatchTracker
import com.foundry.iptv.ui.image.ChannelLogo
import com.foundry.iptv.ui.theme.FoundryColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Live TV *library* — only channels the user has watched before.
 *
 * Per Jack's mandate ("the only way we find things is through search"),
 * there is no catalog browse, no category rail, and no 52k-channel scan on
 * this screen. Discovery lives entirely in the Search tab; this tab is a
 * small grid of already-known favorites backed by server-side
 * `iptv_watch_history`.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun LiveScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var channels by remember { mutableStateOf<List<Channel>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var errorText by remember { mutableStateOf<String?>(null) }

    // Playback state: once set, PlayerHost takes over the whole section.
    var playingChannel by rememberSaveable { mutableStateOf<String?>(null) }
    var playingName by rememberSaveable { mutableStateOf<String?>(null) }
    var playingHlsUrl by rememberSaveable { mutableStateOf<String?>(null) }
    var playingSid by rememberSaveable { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        runCatching { LibraryStore.getLive(context) }
            .onSuccess {
                channels = it
                loading = false
            }
            .onFailure {
                errorText = it.message ?: "Failed to load library"
                loading = false
            }
    }

    if (playingHlsUrl != null && playingChannel != null) {
        PlayerHost(
            hlsUrl = playingHlsUrl!!,
            channelName = playingName ?: "",
            onBack = {
                val id = playingChannel
                val sid = playingSid
                if (id != null && sid != null) {
                    scope.launch(Dispatchers.IO) {
                        runCatching { ApiClientHolder.getOrNull(context)?.stopStream(id, sid) }
                    }
                }
                playingChannel = null
                playingHlsUrl = null
                playingSid = null
                playingName = null
            },
        )
        return
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(FoundryColors.Background),
    ) {
        when {
            loading -> Text(
                text = "Loading…",
                color = FoundryColors.OnSurfaceVariant,
                fontSize = 20.sp,
                modifier = Modifier.align(Alignment.Center),
            )

            errorText != null -> Text(
                text = errorText!!,
                color = Color(0xFFFF6666),
                fontSize = 18.sp,
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(32.dp),
            )

            channels.isEmpty() -> EmptyLibraryState()

            else -> LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 260.dp),
                contentPadding = PaddingValues(24.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                items(channels, key = { it.id }) { channel ->
                    LibraryChannelCard(
                        channel = channel,
                        onPlay = {
                            WatchTracker.recordWatch(
                                scope, context, MediaType.LIVE, channel.id, channel.name,
                            )
                            scope.launch {
                                val result = withContext(Dispatchers.IO) {
                                    runCatching {
                                        ApiClientHolder.get(context).startStream(channel.id)
                                    }
                                }
                                result.onSuccess { session ->
                                    playingChannel = channel.id
                                    playingName = channel.name
                                    playingHlsUrl = session.hlsUrl
                                    playingSid = session.sid
                                }.onFailure {
                                    errorText = it.message ?: "Stream start failed"
                                }
                            }
                        },
                    )
                }
            }
        }
    }
}

/**
 * Horizontal 72dp channel card — logo + name + optional subtitle.
 *
 * Focus: scale animates to 1.05, background lifts to SurfaceBright, and
 * a 3dp Orange border appears.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
internal fun LibraryChannelCard(
    channel: Channel,
    subtitle: String? = null,
    onPlay: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = if (focused) 1.05f else 1f,
        label = "channelCardScale",
    )
    val borderColor = if (focused) FoundryColors.Orange else FoundryColors.Border
    val borderWidth = if (focused) 3.dp else 1.dp
    val bgColor = if (focused) FoundryColors.SurfaceBright else FoundryColors.Surface

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .height(72.dp)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(RoundedCornerShape(12.dp))
            .background(bgColor)
            .border(borderWidth, borderColor, RoundedCornerShape(12.dp))
            .padding(horizontal = 12.dp)
            .onFocusChanged { focused = it.isFocused }
            .focusable()
            .onKeyEvent { ev ->
                if (ev.type == KeyEventType.KeyDown &&
                    (ev.key == Key.Enter || ev.key == Key.DirectionCenter ||
                        ev.key == Key.NumPadEnter)
                ) {
                    onPlay()
                    true
                } else {
                    false
                }
            },
    ) {
        Box(
            modifier = Modifier.size(48.dp),
            contentAlignment = Alignment.Center,
        ) {
            ChannelLogo(channel = channel, sizeDp = 48.dp)
        }
        Spacer(Modifier.width(12.dp))
        androidx.compose.foundation.layout.Column(
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                text = channel.name,
                color = FoundryColors.OnSurface,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
            if (!subtitle.isNullOrBlank()) {
                Text(
                    text = subtitle,
                    color = FoundryColors.OnSurfaceVariant,
                    fontSize = 12.sp,
                    maxLines = 1,
                )
            }
        }
    }
}
