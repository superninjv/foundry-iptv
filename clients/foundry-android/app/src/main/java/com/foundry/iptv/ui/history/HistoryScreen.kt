package com.foundry.iptv.ui.history

import android.content.Context
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import com.foundry.iptv.core.ApiClient
import com.foundry.iptv.core.Channel
import com.foundry.iptv.player.PlayerHost
import com.foundry.iptv.ui.focus.KeyboardHandler
import com.foundry.iptv.ui.focus.firstFocus
import com.foundry.iptv.ui.focus.rememberFirstFocus
import com.foundry.iptv.ui.image.ChannelLogo
import com.foundry.iptv.ui.theme.FoundryColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Recently-watched screen. Pulls the server's watch history
 * ([ApiClient.listWatchHistory]) and merges with [LocalHistoryStore] for
 * entries initiated from within the history / now-playing surfaces.
 *
 * Each row shows logo + channel name + relative time ("watched 5m ago").
 * OK on a row starts playback through [PlayerHost] and records a local
 * entry so the fallback stays warm even if the server is slow.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun HistoryScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var entries by remember { mutableStateOf<List<HistoryItem>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var refreshKey by remember { mutableStateOf(0) }
    var playing by remember { mutableStateOf<Pair<Channel, String>?>(null) }

    LaunchedEffect(refreshKey) {
        loading = true
        val result = withContext(Dispatchers.IO) {
            runCatching {
                val client = buildApiClient(context)
                // Server history is primary. Missing / flaky → empty list.
                val serverHistory = runCatching { client.listWatchHistory() }.getOrDefault(emptyList())
                val local = LocalHistoryStore.read(context)
                val channelsById = runCatching { client.listChannels() }
                    .getOrDefault(emptyList())
                    .associateBy { it.id }
                mergeHistory(serverHistory, local, channelsById)
            }
        }
        result.onSuccess {
            entries = it
            loading = false
        }.onFailure {
            error = it.message ?: "Failed to load history"
            loading = false
        }
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

    Box(modifier = modifier.fillMaxSize()) {
        when {
            loading -> Text(
                text = "Loading history…",
                color = FoundryColors.OnSurfaceVariant,
                fontSize = 20.sp,
                modifier = Modifier.align(Alignment.Center),
            )

            error != null -> Text(
                text = error!!,
                color = Color(0xFFFF6666),
                fontSize = 18.sp,
                modifier = Modifier.align(Alignment.Center),
            )

            entries.isEmpty() -> Text(
                text = "No recent channels yet. Watch something and come back.",
                color = FoundryColors.OnSurfaceVariant,
                fontSize = 18.sp,
                modifier = Modifier.align(Alignment.Center),
            )

            else -> {
                val firstRow = rememberFirstFocus()
                Column(Modifier.fillMaxSize()) {
                    Text(
                        text = "Recently watched",
                        color = FoundryColors.OnBackground,
                        fontSize = 28.sp,
                        modifier = Modifier.padding(bottom = 12.dp),
                    )
                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                        items(entries, key = { it.channelId }) { entry ->
                            val isFirst = entry == entries.first()
                            HistoryRow(
                                entry = entry,
                                onPlay = {
                                    scope.launch {
                                        val res = withContext(Dispatchers.IO) {
                                            runCatching {
                                                buildApiClient(context).startStream(entry.channelId)
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
                                modifier = if (isFirst) Modifier.firstFocus(firstRow) else Modifier,
                            )
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun HistoryRow(
    entry: HistoryItem,
    onPlay: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .height(72.dp)
            .padding(vertical = 4.dp)
            .clip(RoundedCornerShape(8.dp)),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = FoundryColors.Surface,
            focusedContainerColor = FoundryColors.OrangeDim,
        ),
        onClick = onPlay,
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val ch = entry.channel
            if (ch != null) {
                ChannelLogo(channel = ch, sizeDp = 48.dp)
            } else {
                Spacer(Modifier.width(48.dp))
            }
            Spacer(Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = entry.channelName,
                    color = FoundryColors.OnSurface,
                    fontSize = 20.sp,
                )
                Text(
                    text = relativeTime(entry.timestampMs),
                    color = FoundryColors.OnSurfaceVariant,
                    fontSize = 14.sp,
                )
            }
        }
    }
}

/**
 * Inline ApiClient factory — reads pairing prefs and applies the stored token.
 * Duplicated from other wave packages rather than shared, per ownership rules.
 */
internal fun buildApiClient(ctx: Context): ApiClient {
    val prefs = ctx.getSharedPreferences("foundry_prefs", Context.MODE_PRIVATE)
    val baseUrl = prefs.getString("server_url", null)
        ?: error("No server_url in foundry_prefs — device not paired")
    val token = prefs.getString("device_token", null).orEmpty()
    return ApiClient(baseUrl).also { it.setToken(token) }
}
