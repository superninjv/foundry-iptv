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
import com.foundry.iptv.ui.common.WatchTracker
import com.foundry.iptv.ui.focus.KeyboardHandler
import com.foundry.iptv.ui.image.ChannelLogo
import com.foundry.iptv.ui.theme.FoundryColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Deck playback screen — the hero feature of Track J Wave 3-A.
 *
 * A [Deck] is a small ordered list of channels (usually 2-6). This screen
 * loads the deck's entries, warms an [com.foundry.iptv.player.WarmPlayerPool]
 * entry for each, then binds the currently-focused entry's ExoPlayer to the
 * big full-screen [PlayerView]. D-pad Left/Right on the bottom thumbnail row
 * swaps which warm player owns the surface — target visible latency on
 * FireStick 4K Max is under 200 ms, measured via `logcat -s WarmPool:V`.
 *
 * ## Channel metadata for thumbnails
 *
 * The current `get_deck` FFI (W1-A) returns [DeckEntry] with only
 * `channelId`, `position`, and `inCommercial` — no names or logos. To show
 * rich thumbnails we fetch `listChannels()` once and build an in-memory
 * `Map<String, Channel>` to look up each entry's metadata. This is cheap at
 * load time and lets the thumbnail row use the existing
 * [ChannelLogo] component with no changes.
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

    // Pool survives focus changes but is torn down on screen dispose.
    val pool = remember {
        WarmPlayerPool(context, WarmPlayerPool.recommendedCapacity(context))
    }
    DisposableEffect(pool) {
        onDispose { pool.releaseAll() }
    }

    var deck by remember(deckId) { mutableStateOf<Deck?>(null) }
    var error by remember(deckId) { mutableStateOf<String?>(null) }
    var focusedIndex by remember(deckId) { mutableStateOf(0) }
    // Shared PlayerView for the full-screen hero video. We keep a reference
    // to it outside the AndroidView factory so the key-event handler can pass
    // it to pool.attachFocused on every swap.
    var playerViewRef by remember { mutableStateOf<PlayerView?>(null) }
    // Reload counter: bumped once after we prepare all warm entries, so the
    // LaunchedEffect(focusedIndex, ...) can then perform the initial attach.
    var warmReady by remember(deckId) { mutableStateOf(false) }

    // --- load the deck and prewarm the pool ------------------------------
    // W5-A: DeckEntry now carries `channel: Channel?` directly from the
    // server, so we no longer need to run a separate `listChannels()` join
    // to render thumbnails — each entry already knows its own name/logo.
    LaunchedEffect(deckId) {
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
            // prepare() must run on the main thread (ExoPlayer).
            for ((channelId, hlsUrl) in warms) {
                pool.prepare(channelId, hlsUrl)
            }
            warmReady = true
        }.onFailure {
            error = it.message ?: "Failed to load deck"
        }
    }

    // --- perform the initial + subsequent focus attaches ----------------
    LaunchedEffect(warmReady, focusedIndex, playerViewRef, deck) {
        val d = deck ?: return@LaunchedEffect
        if (!warmReady) return@LaunchedEffect
        val view = playerViewRef ?: return@LaunchedEffect
        val entry = d.entries.getOrNull(focusedIndex) ?: return@LaunchedEffect
        pool.attachFocused(entry.channelId, view)
        // Track whatever the user is actively watching as they step through
        // the deck — fire-and-forget via the shared WatchTracker.
        WatchTracker.recordWatch(
            scope, context, MediaType.LIVE,
            entry.channelId,
            entry.channel?.name ?: entry.channelId,
        )
    }

    KeyboardHandler(onBack = onBack) {
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
                            // Deck name overlay.
                            Text(
                                text = d.name,
                                color = FoundryColors.OnBackground,
                                fontSize = 22.sp,
                                modifier = Modifier
                                    .align(Alignment.TopStart)
                                    .padding(24.dp),
                            )
                        }

                        // Thumbnail row (30% of height).
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
    }
}

/**
 * Horizontal row of deck-entry thumbnails along the bottom of [DeckScreen].
 *
 * Focus lives on a single invisible `focusable` Box that owns the key events.
 * D-pad Left/Right moves [focusedIndex] through the entries; OK/Back fall
 * through to the parent `KeyboardHandler`.
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
                            onFocusChange(focusedIndex - 1)
                            true
                        } else false
                    }
                    Key.DirectionRight -> {
                        if (focusedIndex < deck.entries.size - 1) {
                            onFocusChange(focusedIndex + 1)
                            true
                        } else false
                    }
                    Key.Back, Key.Escape -> {
                        onBack()
                        true
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
