package com.foundry.iptv.ui.lists

import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
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
import com.foundry.iptv.core.Channel
import com.foundry.iptv.core.MediaType
import com.foundry.iptv.core.UserList
import com.foundry.iptv.player.PlayerHost
import com.foundry.iptv.ui.common.ApiClientHolder
import com.foundry.iptv.ui.common.WatchTracker
import com.foundry.iptv.ui.focus.KeyboardHandler
import com.foundry.iptv.ui.focus.firstFocus
import com.foundry.iptv.ui.focus.rememberFirstFocus
import com.foundry.iptv.ui.image.ChannelLogo
import com.foundry.iptv.ui.theme.FoundryColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * User-defined channel lists section.
 *
 * Top-level lands on a grid of the user's lists; selecting one drills into a
 * [ListDetailScreen] showing its member channels. Picking a channel launches
 * [PlayerHost] with the HLS URL from [ApiClient.startStream].
 *
 * W4-A wires [onBack] for any deeper navigation wiring it may need; internal
 * detail/player states are managed here so the hub's Back key naturally falls
 * through this hierarchy.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun ListsScreen(
    modifier: Modifier = Modifier,
    onBack: () -> Unit = {},
) {
    val context = LocalContext.current
    var lists by remember { mutableStateOf<List<UserList>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    // Nav state — null = grid, non-null list = detail view.
    var openList by remember { mutableStateOf<UserList?>(null) }
    // Active playback (from detail view).
    var playing by remember { mutableStateOf<PlayingChannel?>(null) }

    LaunchedEffect(Unit) {
        val result = withContext(Dispatchers.IO) {
            runCatching { ApiClientHolder.get(context).listLists() }
        }
        result.onSuccess {
            lists = it
            loading = false
        }.onFailure {
            error = it.message ?: "Failed to load lists"
            loading = false
        }
    }

    // Playback takes over the whole pane.
    playing?.let { pc ->
        KeyboardHandler(onBack = { playing = null }) {
            PlayerHost(
                hlsUrl = pc.hlsUrl,
                channelName = pc.channel.name,
                onBack = { playing = null },
            )
        }
        return
    }

    openList?.let { list ->
        ListDetailScreen(
            list = list,
            modifier = modifier,
            onBack = { openList = null },
            onPlay = { playing = it },
        )
        return
    }

    Box(modifier = modifier.fillMaxSize()) {
        when {
            loading -> Text(
                text = "Loading lists…",
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

            lists.isEmpty() -> Text(
                text = "No lists yet. Create one from the web admin.",
                color = FoundryColors.OnSurfaceVariant,
                fontSize = 18.sp,
                modifier = Modifier.align(Alignment.Center),
            )

            else -> {
                val firstTile = rememberFirstFocus()
                Column(modifier = Modifier.fillMaxSize()) {
                    Text(
                        text = "Your Lists",
                        color = FoundryColors.OnBackground,
                        fontSize = 28.sp,
                        modifier = Modifier.padding(bottom = 16.dp),
                    )
                    LazyVerticalGrid(
                        columns = GridCells.Adaptive(minSize = 260.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        items(lists, key = { it.id }) { list ->
                            val isFirst = list == lists.first()
                            ListCard(
                                list = list,
                                onClick = { openList = list },
                                modifier = if (isFirst) Modifier.firstFocus(firstTile) else Modifier,
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
private fun ListCard(
    list: UserList,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .height(120.dp)
            .clip(RoundedCornerShape(12.dp)),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = FoundryColors.SurfaceVariant,
            focusedContainerColor = FoundryColors.OrangeDim,
        ),
        onClick = onClick,
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = list.name,
                color = FoundryColors.OnSurface,
                fontSize = 22.sp,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = "${list.channelCount} channels · ${list.kind}",
                color = FoundryColors.OnSurfaceVariant,
                fontSize = 14.sp,
            )
        }
    }
}

/**
 * Drill-down view: one list, its channels. Picking a channel calls
 * [ApiClient.startStream] and hands the resulting HLS URL back via [onPlay].
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
internal fun ListDetailScreen(
    list: UserList,
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
    onPlay: (PlayingChannel) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var channels by remember(list.id) { mutableStateOf<List<Channel>>(emptyList()) }
    var loading by remember(list.id) { mutableStateOf(true) }
    var error by remember(list.id) { mutableStateOf<String?>(null) }

    LaunchedEffect(list.id) {
        val result = withContext(Dispatchers.IO) {
            runCatching { ApiClientHolder.get(context).listListChannels(list.id) }
        }
        result.onSuccess {
            channels = it
            loading = false
        }.onFailure {
            error = it.message ?: "Failed to load channels"
            loading = false
        }
    }

    KeyboardHandler(onBack = onBack) {
        Column(
            modifier = modifier
                .fillMaxSize()
                .padding(8.dp),
        ) {
            Text(
                text = list.name,
                color = FoundryColors.OnBackground,
                fontSize = 28.sp,
                modifier = Modifier.padding(bottom = 12.dp),
            )
            when {
                loading -> Text(
                    text = "Loading…",
                    color = FoundryColors.OnSurfaceVariant,
                    fontSize = 18.sp,
                )

                error != null -> Text(
                    text = error!!,
                    color = Color(0xFFFF6666),
                    fontSize = 18.sp,
                )

                channels.isEmpty() -> Text(
                    text = "This list is empty.",
                    color = FoundryColors.OnSurfaceVariant,
                    fontSize = 18.sp,
                )

                else -> {
                    val firstRow = rememberFirstFocus()
                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                        items(channels, key = { it.id }) { channel ->
                            val isFirst = channel == channels.first()
                            ListChannelRow(
                                channel = channel,
                                onSelect = {
                                    WatchTracker.recordWatch(scope, context, MediaType.LIVE, channel.id, channel.name)
                                    scope.launch {
                                        val result = withContext(Dispatchers.IO) {
                                            runCatching {
                                                ApiClientHolder.get(context).startStream(channel.id)
                                            }
                                        }
                                        result.onSuccess { session ->
                                            onPlay(PlayingChannel(channel, session.hlsUrl))
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
private fun ListChannelRow(
    channel: Channel,
    onSelect: () -> Unit,
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
        onClick = onSelect,
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ChannelLogo(channel = channel, sizeDp = 48.dp)
            Spacer(Modifier.width(16.dp))
            Column {
                Text(
                    text = channel.name,
                    color = FoundryColors.OnSurface,
                    fontSize = 20.sp,
                )
                channel.group?.let { grp ->
                    Text(
                        text = grp,
                        color = FoundryColors.OnSurfaceVariant,
                        fontSize = 14.sp,
                    )
                }
            }
        }
    }
}

internal data class PlayingChannel(val channel: Channel, val hlsUrl: String)

// ApiClient wiring moved to ui/common/ApiClientHolder.kt (W5-B).
