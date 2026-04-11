package com.foundry.iptv.ui.favorites

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import com.foundry.iptv.core.Channel
import com.foundry.iptv.core.MediaType
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
 * Shortcut view of the user's favorited channels.
 *
 * FFI returns a list of channel IDs from [ApiClient.listFavorites]; we cross-
 * reference with [ApiClient.listChannels] to get names and logos. Pressing OK
 * plays the channel; pressing Menu (or the star button on the row) toggles
 * the favorite state via [ApiClient.toggleFavorite] and refreshes the list.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun FavoritesScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var favChannels by remember { mutableStateOf<List<Channel>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var refreshKey by remember { mutableStateOf(0) }
    var playing by remember { mutableStateOf<Pair<Channel, String>?>(null) }
    var focusedChannelId by remember { mutableStateOf<String?>(null) }

    suspend fun loadOnce(): Result<List<Channel>> = withContext(Dispatchers.IO) {
        runCatching {
            val client = ApiClientHolder.get(context)
            val favIds = client.listFavorites().toSet()
            if (favIds.isEmpty()) {
                emptyList()
            } else {
                client.listChannels().filter { it.id in favIds }
            }
        }
    }

    LaunchedEffect(refreshKey) {
        loading = true
        loadOnce().onSuccess {
            favChannels = it
            loading = false
        }.onFailure {
            error = it.message ?: "Failed to load favorites"
            loading = false
        }
    }

    fun toggleFocused() {
        val id = focusedChannelId ?: return
        scope.launch {
            withContext(Dispatchers.IO) {
                runCatching { ApiClientHolder.get(context).toggleFavorite(id) }
            }
            refreshKey++
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

    KeyboardHandler(onMenu = { toggleFocused() }) {
        Box(modifier = modifier.fillMaxSize()) {
            when {
                loading -> Text(
                    text = "Loading favorites…",
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

                favChannels.isEmpty() -> Text(
                    text = "No favorites yet. Press Menu on a channel to star it.",
                    color = FoundryColors.OnSurfaceVariant,
                    fontSize = 18.sp,
                    modifier = Modifier.align(Alignment.Center),
                )

                else -> {
                    val firstRow = rememberFirstFocus()
                    Column(Modifier.fillMaxSize()) {
                        Text(
                            text = "Favorites",
                            color = FoundryColors.OnBackground,
                            fontSize = 28.sp,
                            modifier = Modifier.padding(bottom = 12.dp),
                        )
                        LazyColumn(modifier = Modifier.fillMaxSize()) {
                            items(favChannels, key = { it.id }) { channel ->
                                val isFirst = channel == favChannels.first()
                                FavoriteRow(
                                    channel = channel,
                                    onFocused = { focusedChannelId = channel.id },
                                    onPlay = {
                                        WatchTracker.recordWatch(scope, context, MediaType.LIVE, channel.id, channel.name)
                                        scope.launch {
                                            val res = withContext(Dispatchers.IO) {
                                                runCatching {
                                                    ApiClientHolder.get(context).startStream(channel.id)
                                                }
                                            }
                                            res.onSuccess { s ->
                                                playing = channel to s.hlsUrl
                                            }
                                        }
                                    },
                                    onToggleStar = {
                                        scope.launch {
                                            withContext(Dispatchers.IO) {
                                                runCatching {
                                                    ApiClientHolder.get(context).toggleFavorite(channel.id)
                                                }
                                            }
                                            refreshKey++
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
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun FavoriteRow(
    channel: Channel,
    onFocused: () -> Unit,
    onPlay: () -> Unit,
    onToggleStar: () -> Unit,
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
        onClick = {
            onFocused()
            onPlay()
        },
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ChannelLogo(channel = channel, sizeDp = 48.dp)
            Spacer(Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = channel.name,
                    color = FoundryColors.OnSurface,
                    fontSize = 20.sp,
                )
                channel.group?.let {
                    Text(
                        text = it,
                        color = FoundryColors.OnSurfaceVariant,
                        fontSize = 14.sp,
                    )
                }
            }
            StarBadge(onClick = onToggleStar)
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun StarBadge(onClick: () -> Unit) {
    Surface(
        modifier = Modifier
            .size(40.dp)
            .clip(RoundedCornerShape(20.dp)),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = Color.Transparent,
            focusedContainerColor = FoundryColors.OrangeBright,
        ),
        onClick = onClick,
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            // Plain glyph — avoids pulling in an icon dep just for this.
            Text(
                text = "\u2605",
                color = FoundryColors.Orange,
                fontSize = 22.sp,
            )
        }
    }
}

// ApiClient wiring moved to ui/common/ApiClientHolder.kt (W5-B).
