package com.foundry.iptv.ui.nowplaying

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import com.foundry.iptv.core.Channel
import com.foundry.iptv.core.MediaType
import com.foundry.iptv.player.PlayerHost
import com.foundry.iptv.ui.common.ApiClientHolder
import com.foundry.iptv.ui.common.WatchTracker
import com.foundry.iptv.ui.focus.KeyboardHandler
import com.foundry.iptv.ui.focus.firstFocus
import com.foundry.iptv.ui.focus.rememberFirstFocus
import com.foundry.iptv.ui.history.HistoryItem
import com.foundry.iptv.ui.history.LocalHistoryStore
import com.foundry.iptv.ui.history.mergeHistory
import com.foundry.iptv.ui.history.relativeTime
import com.foundry.iptv.ui.image.ChannelLogo
import com.foundry.iptv.ui.theme.FoundryColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Single-card "Resume last watched" shortcut the hub can host above the
 * section rail. Shows the most recent watch-history entry with a prominent
 * Resume button. Falls back to a gentle CTA when history is empty.
 *
 * Shares backing store with [com.foundry.iptv.ui.history.HistoryScreen] —
 * primary source is [ApiClient.listWatchHistory], supplemented by the
 * [LocalHistoryStore] prefs fallback. Playback started here is recorded
 * into local history so a subsequent visit still resolves to the right
 * channel even if the server hasn't caught up.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun NowPlayingDeck(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var top by remember { mutableStateOf<HistoryItem?>(null) }
    var loading by remember { mutableStateOf(true) }
    var playing by remember { mutableStateOf<Pair<Channel, String>?>(null) }

    LaunchedEffect(Unit) {
        loading = true
        val result = withContext(Dispatchers.IO) {
            runCatching {
                val client = ApiClientHolder.get(context)
                val serverHistory = runCatching { client.listWatchHistory() }
                    .getOrDefault(emptyList())
                val local = LocalHistoryStore.read(context)
                val channelsById = runCatching { client.listChannels() }
                    .getOrDefault(emptyList())
                    .associateBy { it.id }
                mergeHistory(serverHistory, local, channelsById).firstOrNull()
            }
        }
        top = result.getOrNull()
        loading = false
    }

    playing?.let { (channel, url) ->
        KeyboardHandler(onBack = { playing = null }) {
            PlayerHost(
                hlsUrl = url,
                channelName = channel.name,
                onBack = { playing = null },
            )
        }
        return
    }

    Box(modifier = modifier.fillMaxWidth()) {
        when {
            loading -> Text(
                text = "Checking recent history…",
                color = FoundryColors.OnSurfaceVariant,
                fontSize = 16.sp,
                modifier = Modifier.padding(16.dp),
            )

            top == null -> EmptyCta()

            else -> {
                val firstFocus = rememberFirstFocus()
                val entry = top!!
                ResumeCard(
                    entry = entry,
                    onResume = {
                        WatchTracker.recordWatch(scope, context, MediaType.LIVE, entry.channelId, entry.channelName)
                        scope.launch {
                            val res = withContext(Dispatchers.IO) {
                                runCatching {
                                    ApiClientHolder.get(context).startStream(entry.channelId)
                                }
                            }
                            res.onSuccess { s ->
                                LocalHistoryStore.record(
                                    ctx = context,
                                    channelId = entry.channelId,
                                    channelName = entry.channelName,
                                )
                                val ch = entry.channel ?: Channel(
                                    id = entry.channelId,
                                    name = entry.channelName,
                                    group = null,
                                    logoUrl = null,
                                    tvgId = null,
                                )
                                playing = ch to s.hlsUrl
                            }
                        }
                    },
                    modifier = Modifier.firstFocus(firstFocus),
                )
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun ResumeCard(
    entry: HistoryItem,
    onResume: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .height(140.dp)
            .padding(8.dp)
            .clip(RoundedCornerShape(16.dp)),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = FoundryColors.Surface,
            focusedContainerColor = FoundryColors.OrangeDim,
        ),
        onClick = onResume,
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val ch = entry.channel
            if (ch != null) {
                ChannelLogo(channel = ch, sizeDp = 96.dp)
            } else {
                Spacer(Modifier.width(96.dp))
            }
            Spacer(Modifier.width(24.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Resume",
                    color = FoundryColors.Orange,
                    fontSize = 14.sp,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = entry.channelName,
                    color = FoundryColors.OnSurface,
                    fontSize = 28.sp,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = relativeTime(entry.timestampMs),
                    color = FoundryColors.OnSurfaceVariant,
                    fontSize = 14.sp,
                )
            }
            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = "\u25B6",
                    color = FoundryColors.Orange,
                    fontSize = 40.sp,
                )
                Text(
                    text = "OK to play",
                    color = FoundryColors.OnSurfaceVariant,
                    fontSize = 12.sp,
                )
            }
        }
    }
}

@Composable
private fun EmptyCta() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(24.dp),
    ) {
        Text(
            text = "No recent channels",
            color = FoundryColors.OnBackground,
            fontSize = 22.sp,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = "Head to Live to start watching — your most recent pick will show up here.",
            color = FoundryColors.OnSurfaceVariant,
            fontSize = 14.sp,
        )
    }
}

// ApiClient wiring moved to ui/common/ApiClientHolder.kt (W5-B).
