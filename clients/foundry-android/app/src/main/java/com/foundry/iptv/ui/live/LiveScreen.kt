package com.foundry.iptv.ui.live

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text
import com.foundry.iptv.core.Category
import com.foundry.iptv.core.Channel
import com.foundry.iptv.player.PlayerHost
import com.foundry.iptv.ui.image.ChannelLogo
import com.foundry.iptv.ui.theme.FoundryColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Live TV section of the Foundry hub.
 *
 * Top row: horizontal category chips (focus-selectable).
 * Main area: LazyVerticalGrid of ChannelCard tiles for the active category.
 *
 * Pressing OK (via Compose focus + keyboard handler) on a card calls
 * ApiClient.startStream(channelId) off the main thread and, on success,
 * pushes a fullscreen PlayerHost overlay. Back returns to the grid.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun LiveScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var categories by remember { mutableStateOf<List<Category>>(emptyList()) }
    var selectedCategoryId by rememberSaveable { mutableStateOf<String?>(null) }
    var channels by remember { mutableStateOf<List<Channel>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var errorText by remember { mutableStateOf<String?>(null) }

    // Playback state: once set, PlayerHost takes over the whole section.
    var playingChannel by rememberSaveable { mutableStateOf<String?>(null) }
    var playingName by rememberSaveable { mutableStateOf<String?>(null) }
    var playingHlsUrl by rememberSaveable { mutableStateOf<String?>(null) }
    var playingSid by rememberSaveable { mutableStateOf<String?>(null) }

    // Load categories once on mount.
    LaunchedEffect(Unit) {
        val result = withContext(Dispatchers.IO) {
            runCatching {
                val client = buildApiClient(context)
                    ?: error("Missing credentials — re-pair required")
                client.listCategories()
            }
        }
        result.onSuccess { cats ->
            categories = cats
            if (selectedCategoryId == null && cats.isNotEmpty()) {
                selectedCategoryId = cats.first().id
            }
            loading = false
        }.onFailure {
            errorText = it.message ?: "Failed to load categories"
            loading = false
        }
    }

    // Reload channel list whenever the selected category changes.
    LaunchedEffect(selectedCategoryId) {
        val cat = selectedCategoryId ?: return@LaunchedEffect
        val result = withContext(Dispatchers.IO) {
            runCatching {
                val client = buildApiClient(context)
                    ?: error("Missing credentials")
                client.listChannelsByCategory(cat)
            }
        }
        result.onSuccess { channels = it }
            .onFailure { errorText = it.message ?: "Failed to load channels" }
    }

    // Playback overlay takes precedence over the grid UI.
    if (playingHlsUrl != null && playingChannel != null) {
        PlayerHost(
            hlsUrl = playingHlsUrl!!,
            channelName = playingName ?: "",
            onBack = {
                val id = playingChannel
                val sid = playingSid
                if (id != null && sid != null) {
                    scope.launch(Dispatchers.IO) {
                        runCatching { buildApiClient(context)?.stopStream(id, sid) }
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

    Box(modifier = modifier.background(FoundryColors.Background)) {
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

            else -> Column(modifier = Modifier.fillMaxSize()) {
                CategoryChipRow(
                    categories = categories,
                    selectedId = selectedCategoryId,
                    onSelect = { selectedCategoryId = it },
                )
                Spacer(Modifier.height(12.dp))
                ChannelGrid(
                    channels = channels,
                    onPlay = { channel ->
                        scope.launch {
                            val result = withContext(Dispatchers.IO) {
                                runCatching {
                                    val client = buildApiClient(context)
                                        ?: error("Missing credentials")
                                    client.startStream(channel.id)
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

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun CategoryChipRow(
    categories: List<Category>,
    selectedId: String?,
    onSelect: (String) -> Unit,
) {
    val listState = rememberLazyListState()
    LazyRow(
        state = listState,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 4.dp),
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp),
    ) {
        items(categories, key = { it.id }) { cat ->
            CategoryChip(
                label = cat.name,
                selected = cat.id == selectedId,
                onSelect = { onSelect(cat.id) },
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun CategoryChip(
    label: String,
    selected: Boolean,
    onSelect: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val bg = when {
        focused -> FoundryColors.Orange
        selected -> FoundryColors.SurfaceBright
        else -> FoundryColors.Surface
    }
    val border = if (focused) FoundryColors.Orange else FoundryColors.Border
    val fg = if (focused) FoundryColors.OnPrimary else FoundryColors.OnSurface

    Box(
        modifier = Modifier
            .height(48.dp)
            .clip(RoundedCornerShape(24.dp))
            .background(bg)
            .border(2.dp, border, RoundedCornerShape(24.dp))
            .padding(horizontal = 20.dp)
            .onFocusChanged { state ->
                focused = state.isFocused
                if (state.isFocused) onSelect()
            }
            .focusable(),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = fg,
            fontSize = 16.sp,
            fontWeight = if (selected || focused) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun ChannelGrid(
    channels: List<Channel>,
    onPlay: (Channel) -> Unit,
) {
    if (channels.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(
                text = "No channels in this category",
                color = FoundryColors.OnSurfaceVariant,
                fontSize = 18.sp,
            )
        }
        return
    }
    // Fixed 4-column grid — cards are ~200dp wide so this works on 1080p.
    LazyVerticalGrid(
        columns = GridCells.Fixed(4),
        contentPadding = PaddingValues(8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        items(channels, key = { it.id }) { channel ->
            ChannelCard(channel = channel, onPlay = { onPlay(channel) })
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun ChannelCard(
    channel: Channel,
    onPlay: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val borderColor = if (focused) FoundryColors.Orange else FoundryColors.Border
    val bgColor = if (focused) FoundryColors.SurfaceBright else FoundryColors.Surface

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .fillMaxWidth()
            .height(150.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(bgColor)
            .border(2.dp, borderColor, RoundedCornerShape(12.dp))
            .padding(8.dp)
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
            }
            .onFocusChanged { focused = it.isFocused }
            .focusable(),
    ) {
        Box(
            modifier = Modifier
                .size(80.dp)
                .padding(top = 4.dp),
            contentAlignment = Alignment.Center,
        ) {
            ChannelLogo(channel = channel, sizeDp = 80.dp)
        }
        Spacer(Modifier.height(6.dp))
        Text(
            text = channel.name,
            color = FoundryColors.OnSurface,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 2,
        )
    }
}

