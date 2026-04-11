package com.foundry.iptv.ui.decks

import android.view.ViewGroup
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.ui.PlayerView
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text
import com.foundry.iptv.core.Channel
import com.foundry.iptv.core.Deck
import com.foundry.iptv.core.DeckEntry
import com.foundry.iptv.core.MediaType
import com.foundry.iptv.player.WarmPlayerPool
import com.foundry.iptv.ui.common.ApiClientHolder
import com.foundry.iptv.ui.common.ChannelPicker
import com.foundry.iptv.ui.common.WatchTracker
import com.foundry.iptv.ui.focus.KeyboardHandler
import com.foundry.iptv.ui.image.ChannelLogo
import com.foundry.iptv.ui.theme.FoundryColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Deck playback + editing screen.
 *
 * View mode: hero PlayerView driven by the warm pool + thumbnail row.
 * Edit mode: overlay with Add / Remove per-entry controls and a Delete
 * button that returns to the list.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun DeckScreen(
    deckId: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val pool = remember {
        WarmPlayerPool(context, WarmPlayerPool.recommendedCapacity(context))
    }
    DisposableEffect(pool) {
        onDispose { pool.releaseAll() }
    }

    var deck by remember(deckId) { mutableStateOf<Deck?>(null) }
    var error by remember(deckId) { mutableStateOf<String?>(null) }
    var focusedIndex by remember(deckId) { mutableStateOf(0) }
    var playerViewRef by remember { mutableStateOf<PlayerView?>(null) }
    var warmReady by remember(deckId) { mutableStateOf(false) }

    // Edit-mode state.
    var editing by remember { mutableStateOf(false) }
    var showPicker by remember { mutableStateOf(false) }
    var pendingDelete by remember { mutableStateOf(false) }
    var reloadTick by remember { mutableStateOf(0) }

    // --- load the deck and prewarm the pool ------------------------------
    LaunchedEffect(deckId, reloadTick) {
        val loaded = withContext(Dispatchers.IO) {
            runCatching {
                val client = ApiClientHolder.get(context)
                val d = client.getDeck(deckId)
                val warms = d.entries.map { entry ->
                    val session = client.startStream(entry.channelId)
                    entry.channelId to session.hlsUrl
                }
                d to warms
            }
        }
        loaded.onSuccess { (d, warms) ->
            deck = d
            pool.releaseAll()
            for ((channelId, hlsUrl) in warms) {
                pool.prepare(channelId, hlsUrl)
            }
            warmReady = true
            if (focusedIndex >= d.entries.size) focusedIndex = 0
        }.onFailure {
            error = it.message ?: "Failed to load deck"
        }
    }

    LaunchedEffect(warmReady, focusedIndex, playerViewRef, deck) {
        val d = deck ?: return@LaunchedEffect
        if (!warmReady) return@LaunchedEffect
        val view = playerViewRef ?: return@LaunchedEffect
        val entry = d.entries.getOrNull(focusedIndex) ?: return@LaunchedEffect
        pool.attachFocused(entry.channelId, view)
        WatchTracker.recordWatch(
            scope, context, MediaType.LIVE,
            entry.channelId,
            entry.channel?.name ?: entry.channelId,
        )
    }

    KeyboardHandler(onBack = {
        when {
            showPicker -> showPicker = false
            pendingDelete -> pendingDelete = false
            editing -> editing = false
            else -> onBack()
        }
    }) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(Color.Black),
        ) {
            when {
                error != null -> Text(
                    text = error!!,
                    color = Color(0xFFFF6666),
                    fontSize = 18.sp,
                    modifier = Modifier.align(Alignment.Center),
                )

                deck == null -> Text(
                    text = "Loading deck…",
                    color = FoundryColors.OnSurfaceVariant,
                    fontSize = 20.sp,
                    modifier = Modifier.align(Alignment.Center),
                )

                else -> {
                    val d = deck!!
                    Column(modifier = Modifier.fillMaxSize()) {
                        // Hero video (70% of height).
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(0.7f)
                                .background(Color.Black),
                        ) {
                            AndroidView(
                                modifier = Modifier.fillMaxSize(),
                                factory = { ctx ->
                                    PlayerView(ctx).apply {
                                        useController = false
                                        layoutParams = ViewGroup.LayoutParams(
                                            ViewGroup.LayoutParams.MATCH_PARENT,
                                            ViewGroup.LayoutParams.MATCH_PARENT,
                                        )
                                    }.also { playerViewRef = it }
                                },
                            )
                            Text(
                                text = d.name,
                                color = FoundryColors.OnBackground,
                                fontSize = 22.sp,
                                modifier = Modifier
                                    .align(Alignment.TopStart)
                                    .padding(24.dp),
                            )
                            // Top-right Edit toggle.
                            Row(
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .padding(24.dp),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                HeaderButton(
                                    label = if (editing) "Done" else "Edit",
                                    onClick = { editing = !editing },
                                )
                                if (editing) {
                                    HeaderButton(
                                        label = "Delete Deck",
                                        onClick = { pendingDelete = true },
                                    )
                                }
                            }
                        }

                        // Bottom row: thumbnails (view mode) or edit row.
                        if (editing) {
                            DeckEditRow(
                                deck = d,
                                onAdd = { showPicker = true },
                                onRemove = { entry ->
                                    scope.launch {
                                        val result = withContext(Dispatchers.IO) {
                                            runCatching {
                                                ApiClientHolder.get(context)
                                                    .removeDeckEntry(d.id, entry.entryId)
                                            }
                                        }
                                        result.onSuccess { reloadTick += 1 }
                                            .onFailure { error = it.message ?: "Remove failed" }
                                    }
                                },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .weight(0.3f),
                            )
                        } else {
                            DeckThumbRow(
                                deck = d,
                                focusedIndex = focusedIndex,
                                onFocusChange = { newIndex ->
                                    if (newIndex != focusedIndex &&
                                        newIndex in d.entries.indices
                                    ) {
                                        focusedIndex = newIndex
                                    }
                                },
                                onBack = onBack,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .weight(0.3f),
                            )
                        }
                    }
                }
            }

            // Channel picker overlay.
            if (showPicker) {
                ChannelPicker(
                    onPick = { channel ->
                        showPicker = false
                        scope.launch {
                            val result = withContext(Dispatchers.IO) {
                                runCatching {
                                    ApiClientHolder.get(context)
                                        .addDeckEntry(deckId, channel.id)
                                }
                            }
                            result.onSuccess { reloadTick += 1 }
                                .onFailure { error = it.message ?: "Add failed" }
                        }
                    },
                    onDismiss = { showPicker = false },
                )
            }

            // Delete-deck confirmation.
            if (pendingDelete) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color(0xCC000000)),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(
                        modifier = Modifier
                            .width(520.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .background(FoundryColors.Surface)
                            .border(2.dp, FoundryColors.Border, RoundedCornerShape(16.dp))
                            .padding(24.dp),
                    ) {
                        Text(
                            "Delete \"${deck?.name ?: ""}\"?",
                            color = FoundryColors.OnBackground,
                            fontSize = 20.sp,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "Removes the deck and all its entries.",
                            color = FoundryColors.OnSurfaceVariant,
                            fontSize = 14.sp,
                        )
                        Spacer(Modifier.height(16.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            HeaderButton(
                                label = "Cancel",
                                onClick = { pendingDelete = false },
                            )
                            HeaderButton(
                                label = "Delete",
                                onClick = {
                                    pendingDelete = false
                                    scope.launch {
                                        val result = withContext(Dispatchers.IO) {
                                            runCatching {
                                                ApiClientHolder.get(context).deleteDeck(deckId)
                                            }
                                        }
                                        result.onSuccess { onBack() }
                                            .onFailure { error = it.message ?: "Delete failed" }
                                    }
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * Horizontal row of deck-entry thumbnails along the bottom of [DeckScreen]
 * in view mode.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun DeckThumbRow(
    deck: Deck,
    focusedIndex: Int,
    onFocusChange: (Int) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focusRequester.requestFocus() } }

    Row(
        modifier = modifier
            .background(Color(0xCC0A0A0A))
            .padding(16.dp)
            .focusRequester(focusRequester)
            .focusable()
            .onKeyEvent { ev ->
                if (ev.type != KeyEventType.KeyDown) return@onKeyEvent false
                when (ev.key) {
                    Key.DirectionLeft -> {
                        if (focusedIndex > 0) {
                            onFocusChange(focusedIndex - 1); true
                        } else false
                    }
                    Key.DirectionRight -> {
                        if (focusedIndex < deck.entries.size - 1) {
                            onFocusChange(focusedIndex + 1); true
                        } else false
                    }
                    Key.Back, Key.Escape -> {
                        onBack(); true
                    }
                    else -> false
                }
            },
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        deck.entries.forEachIndexed { index, entry ->
            DeckEntryTile(
                entry = entry,
                channel = entry.channel,
                focused = index == focusedIndex,
            )
        }
    }
}

/** Bottom row shown in edit mode: remove buttons per entry + Add Channel. */
@Composable
private fun DeckEditRow(
    deck: Deck,
    onAdd: () -> Unit,
    onRemove: (DeckEntry) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .background(Color(0xCC0A0A0A))
            .padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        deck.entries.forEach { entry ->
            EditableEntryTile(
                entry = entry,
                channel = entry.channel,
                onRemove = { onRemove(entry) },
            )
        }
        // Trailing Add button.
        Box(
            modifier = Modifier
                .width(140.dp)
                .height(150.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(FoundryColors.SurfaceVariant),
        ) {
            HeaderButton(
                label = "+ Add Channel",
                onClick = onAdd,
                modifier = Modifier.align(Alignment.Center),
            )
        }
    }
}

@Composable
private fun EditableEntryTile(
    entry: DeckEntry,
    channel: Channel?,
    onRemove: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val fallbackName = channel?.name ?: entry.channelId.take(8)
    Column(
        modifier = Modifier
            .width(160.dp)
            .height(150.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(
                if (focused) FoundryColors.OrangeDim else FoundryColors.SurfaceVariant,
            )
            .border(
                width = if (focused) 3.dp else 0.dp,
                color = if (focused) FoundryColors.Orange else Color.Transparent,
                shape = RoundedCornerShape(10.dp),
            )
            .padding(8.dp)
            .focusable()
            .onFocusChanged { focused = it.isFocused }
            .onKeyEvent { ev ->
                if (ev.type == KeyEventType.KeyDown &&
                    (ev.key == Key.DirectionCenter || ev.key == Key.Enter ||
                            ev.key == Key.NumPadEnter)
                ) {
                    onRemove(); true
                } else false
            },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (channel != null) {
            ChannelLogo(channel = channel, sizeDp = 56.dp)
        } else {
            Spacer(Modifier.height(56.dp))
        }
        Spacer(Modifier.height(4.dp))
        Text(
            text = fallbackName,
            color = FoundryColors.OnSurface,
            fontSize = 12.sp,
            maxLines = 1,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = if (focused) "OK to remove" else "Remove",
            color = Color(0xFFFF8080),
            fontSize = 11.sp,
        )
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun DeckEntryTile(
    entry: DeckEntry,
    channel: Channel?,
    focused: Boolean,
) {
    val borderColor = if (focused) FoundryColors.Orange else Color.Transparent
    val fallbackName = channel?.name ?: entry.channelId.take(8)

    Column(
        modifier = Modifier
            .width(160.dp)
            .height(150.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(
                if (focused) FoundryColors.OrangeDim else FoundryColors.SurfaceVariant,
            )
            .border(
                width = if (focused) 3.dp else 0.dp,
                color = borderColor,
                shape = RoundedCornerShape(10.dp),
            )
            .padding(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        if (channel != null) {
            ChannelLogo(channel = channel, sizeDp = 72.dp)
        } else {
            Box(
                modifier = Modifier
                    .height(72.dp)
                    .width(72.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFF222222)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "#${entry.position}",
                    color = FoundryColors.OnSurfaceVariant,
                    fontSize = 16.sp,
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(
            text = fallbackName,
            color = FoundryColors.OnSurface,
            fontSize = 14.sp,
            maxLines = 1,
        )
    }
}
