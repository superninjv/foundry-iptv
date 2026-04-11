package com.foundry.iptv.ui.multiview

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.view.ViewGroup
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
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
import com.foundry.iptv.core.MediaType
import com.foundry.iptv.player.PlayerHost
import com.foundry.iptv.player.WarmPlayerPool
import com.foundry.iptv.ui.common.ApiClientHolder
import com.foundry.iptv.ui.common.ChannelPicker
import com.foundry.iptv.ui.common.LibraryStore
import com.foundry.iptv.ui.common.WatchTracker
import com.foundry.iptv.ui.focus.KeyboardHandler
import com.foundry.iptv.ui.focus.firstFocus
import com.foundry.iptv.ui.focus.rememberFirstFocus
import com.foundry.iptv.ui.theme.FoundryColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Multiview: a grid of concurrently-playing PlayerView surfaces backed by
 * the shared [WarmPlayerPool].
 *
 * Track J R4 rewrite — feature parity with the web:
 *   - 4 layout presets: 2x2, 3x3, 1+3, 2+4.
 *   - LayoutPicker chips at the top.
 *   - Per-tile ChannelPicker to assign channels manually; empty tiles
 *     render a "+ Add channel" placeholder.
 *   - Selection persisted in SharedPreferences (`foundry_prefs_multiview`).
 *   - Lite devices are capped to 2x2 / 1+3 to avoid OOM with >4 concurrent
 *     1080p ExoPlayers.
 */
enum class MultiviewLayout(val label: String, val tileCount: Int) {
    Grid2x2("2x2", 4),
    Grid3x3("3x3", 9),
    OnePlusThree("1+3", 4),
    TwoPlusFour("2+4", 6),
}

private const val PREFS_NAME = "foundry_prefs_multiview"
private const val KEY_LAYOUT = "layout"
private const val KEY_CHANNELS = "channels"

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun MultiviewScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val prefs = remember { context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE) }

    val liteDevice = remember { isLowRamFireTv(context) }
    // On Lite, 3x3 and 2+4 are disabled.
    val allLayouts = remember(liteDevice) {
        if (liteDevice) {
            listOf(MultiviewLayout.Grid2x2, MultiviewLayout.OnePlusThree)
        } else {
            MultiviewLayout.values().toList()
        }
    }

    // Restore persisted layout + channel assignments.
    var layout by remember {
        mutableStateOf(
            prefs.getString(KEY_LAYOUT, null)
                ?.let { name -> runCatching { MultiviewLayout.valueOf(name) }.getOrNull() }
                ?.takeIf { it in allLayouts }
                ?: MultiviewLayout.Grid2x2
        )
    }
    // Sparse channel slots — List<String?> of length `layout.tileCount`.
    var slots by remember {
        mutableStateOf(
            restoreSlots(prefs.getString(KEY_CHANNELS, null), layout.tileCount),
        )
    }
    // Resolved tiles — one per slot, or null if unassigned / loading.
    var tiles by remember { mutableStateOf<List<MultiviewTile?>>(List(layout.tileCount) { null }) }
    var error by remember { mutableStateOf<String?>(null) }
    var zoomed by remember { mutableStateOf<MultiviewTile?>(null) }

    // Channel picker state.
    var pickerSlot by remember { mutableStateOf<Int?>(null) }

    // Pool sized to max possible concurrent tiles.
    val pool = remember {
        val cap = if (liteDevice) 4 else 9
        WarmPlayerPool(context, cap)
    }
    DisposableEffect(pool) { onDispose { pool.releaseAll() } }

    // Persist whenever layout or slots change.
    LaunchedEffect(layout, slots) {
        prefs.edit()
            .putString(KEY_LAYOUT, layout.name)
            .putString(KEY_CHANNELS, slots.joinToString(",") { it ?: "" })
            .apply()
    }

    // Resize slots list when layout tile count changes.
    LaunchedEffect(layout) {
        if (slots.size != layout.tileCount) {
            slots = List(layout.tileCount) { i -> slots.getOrNull(i) }
        }
    }

    // Resolve the tiles: fetch channel metadata + start streams for any
    // populated slot, ignore nulls. Uses the library-scoped channel list
    // (history-filtered) so we avoid the 52k-channel JNI crossing that
    // used to slow every layout change on the FireStick Lite.
    LaunchedEffect(slots) {
        error = null
        val current = slots
        val result = runCatching {
            val ids = current.filterNotNull().distinct()
            if (ids.isEmpty()) {
                List<MultiviewTile?>(current.size) { null }
            } else {
                val libraryChannels = LibraryStore.getLive(context)
                val byId = libraryChannels.associateBy { it.id }
                val sessionsById = mutableMapOf<String, MultiviewTile>()
                withContext(Dispatchers.IO) {
                    val client = ApiClientHolder.get(context)
                    for (id in ids) {
                        val ch = byId[id] ?: continue
                        val session = client.startStream(id)
                        sessionsById[id] = MultiviewTile(
                            channel = ch,
                            sid = session.sid,
                            hlsUrl = session.hlsUrl,
                        )
                    }
                }
                current.map { slot -> slot?.let { sessionsById[it] } }
            }
        }
        result.onSuccess { newTiles ->
            pool.releaseAll()
            newTiles.filterNotNull().forEach { t ->
                pool.prepare(t.channel.id, t.hlsUrl)
            }
            tiles = newTiles
        }.onFailure { e ->
            error = e.message ?: "Failed to load tiles"
        }
    }

    var focusedIndex by remember { mutableStateOf(0) }

    // Zoomed full-screen single view.
    zoomed?.let { tile ->
        LaunchedEffect(tile.channel.id) {
            WatchTracker.recordWatch(scope, context, MediaType.LIVE, tile.channel.id, tile.channel.name)
        }
        KeyboardHandler(onBack = { zoomed = null }) {
            PlayerHost(
                hlsUrl = tile.hlsUrl,
                channelName = tile.channel.name,
                onBack = { zoomed = null },
            )
        }
        return
    }

    val firstChip = rememberFirstFocus()

    KeyboardHandler(onBack = {
        if (pickerSlot != null) pickerSlot = null
    }) {
        Box(modifier = modifier.fillMaxSize().background(FoundryColors.Background)) {
            Column(Modifier.fillMaxSize().padding(16.dp)) {
                // ---- Top header: layout picker --------------------------
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Multiview",
                        color = FoundryColors.OnBackground,
                        fontSize = 28.sp,
                    )
                    Spacer(Modifier.width(24.dp))
                    allLayouts.forEachIndexed { i, preset ->
                        PresetChip(
                            label = preset.label,
                            selected = preset == layout,
                            onClick = {
                                if (preset != layout) {
                                    layout = preset
                                    focusedIndex = 0
                                }
                            },
                            modifier = if (i == 0) Modifier.firstFocus(firstChip) else Modifier,
                        )
                        Spacer(Modifier.width(8.dp))
                    }
                    if (liteDevice) {
                        Spacer(Modifier.width(16.dp))
                        Text(
                            text = "(Lite device — 3x3 / 2+4 disabled)",
                            color = FoundryColors.OnSurfaceVariant,
                            fontSize = 12.sp,
                        )
                    }
                }
                Spacer(Modifier.height(12.dp))

                // ---- Grid body ------------------------------------------
                if (error != null) {
                    Text(
                        text = error!!,
                        color = Color(0xFFFF6666),
                        fontSize = 16.sp,
                    )
                } else {
                    LayoutGrid(
                        layout = layout,
                        tiles = tiles,
                        focusedIndex = focusedIndex,
                        pool = pool,
                        onFocusChange = { newIdx ->
                            if (newIdx in 0 until layout.tileCount) {
                                focusedIndex = newIdx
                            }
                        },
                        onZoom = { idx ->
                            tiles.getOrNull(idx)?.let { zoomed = it }
                        },
                        onAssign = { idx -> pickerSlot = idx },
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }

            // Channel picker overlay.
            pickerSlot?.let { idx ->
                ChannelPicker(
                    onPick = { channel ->
                        pickerSlot = null
                        slots = slots.toMutableList().also { it[idx] = channel.id }
                    },
                    onDismiss = { pickerSlot = null },
                )
            }
        }
    }
}

/**
 * Renders the grid of tiles for the given [layout]. All layouts share a
 * uniform index model: index 0..(tileCount-1) addresses tiles in reading
 * order (left-to-right, top-to-bottom), which matches both the URL-style
 * serialization and the D-pad key handler below.
 */
@Composable
private fun LayoutGrid(
    layout: MultiviewLayout,
    tiles: List<MultiviewTile?>,
    focusedIndex: Int,
    pool: WarmPlayerPool,
    onFocusChange: (Int) -> Unit,
    onZoom: (Int) -> Unit,
    onAssign: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    when (layout) {
        MultiviewLayout.Grid2x2 -> UniformGrid(
            rows = 2, cols = 2, tiles = tiles, focusedIndex = focusedIndex, pool = pool,
            onFocusChange = onFocusChange, onZoom = onZoom, onAssign = onAssign,
            modifier = modifier,
        )
        MultiviewLayout.Grid3x3 -> UniformGrid(
            rows = 3, cols = 3, tiles = tiles, focusedIndex = focusedIndex, pool = pool,
            onFocusChange = onFocusChange, onZoom = onZoom, onAssign = onAssign,
            modifier = modifier,
        )
        MultiviewLayout.OnePlusThree -> OnePlusThreeLayout(
            tiles = tiles, focusedIndex = focusedIndex, pool = pool,
            onFocusChange = onFocusChange, onZoom = onZoom, onAssign = onAssign,
            modifier = modifier,
        )
        MultiviewLayout.TwoPlusFour -> TwoPlusFourLayout(
            tiles = tiles, focusedIndex = focusedIndex, pool = pool,
            onFocusChange = onFocusChange, onZoom = onZoom, onAssign = onAssign,
            modifier = modifier,
        )
    }
}

@Composable
private fun UniformGrid(
    rows: Int,
    cols: Int,
    tiles: List<MultiviewTile?>,
    focusedIndex: Int,
    pool: WarmPlayerPool,
    onFocusChange: (Int) -> Unit,
    onZoom: (Int) -> Unit,
    onAssign: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        for (row in 0 until rows) {
            Row(
                modifier = Modifier.fillMaxWidth().weight(1f),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                for (col in 0 until cols) {
                    val index = row * cols + col
                    MultiviewTileView(
                        tile = tiles.getOrNull(index),
                        index = index,
                        focused = index == focusedIndex,
                        pool = pool,
                        onFocusChange = onFocusChange,
                        onZoom = onZoom,
                        onAssign = onAssign,
                        onNav = { k ->
                            when (k) {
                                NavKey.Left -> if (col > 0) onFocusChange(index - 1)
                                NavKey.Right -> if (col < cols - 1) onFocusChange(index + 1)
                                NavKey.Up -> if (row > 0) onFocusChange(index - cols)
                                NavKey.Down -> if (row < rows - 1) onFocusChange(index + cols)
                            }
                        },
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                    )
                }
            }
        }
    }
}

/**
 * 1 large tile on the left (full height) + 3 stacked tiles on the right.
 * Index model:
 *   0 = big left tile
 *   1, 2, 3 = right column top→bottom
 */
@Composable
private fun OnePlusThreeLayout(
    tiles: List<MultiviewTile?>,
    focusedIndex: Int,
    pool: WarmPlayerPool,
    onFocusChange: (Int) -> Unit,
    onZoom: (Int) -> Unit,
    onAssign: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // Left hero — weight 2.
        MultiviewTileView(
            tile = tiles.getOrNull(0),
            index = 0,
            focused = focusedIndex == 0,
            pool = pool,
            onFocusChange = onFocusChange,
            onZoom = onZoom,
            onAssign = onAssign,
            onNav = { k ->
                when (k) {
                    NavKey.Right -> onFocusChange(1)
                    else -> {}
                }
            },
            modifier = Modifier.weight(2f).fillMaxHeight(),
        )
        // Right stack — weight 1.
        Column(
            modifier = Modifier.weight(1f).fillMaxHeight(),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            for (i in 1..3) {
                MultiviewTileView(
                    tile = tiles.getOrNull(i),
                    index = i,
                    focused = focusedIndex == i,
                    pool = pool,
                    onFocusChange = onFocusChange,
                    onZoom = onZoom,
                    onAssign = onAssign,
                    onNav = { k ->
                        when (k) {
                            NavKey.Left -> onFocusChange(0)
                            NavKey.Up -> if (i > 1) onFocusChange(i - 1)
                            NavKey.Down -> if (i < 3) onFocusChange(i + 1)
                            else -> {}
                        }
                    },
                    modifier = Modifier.fillMaxWidth().weight(1f),
                )
            }
        }
    }
}

/**
 * 2 large tiles on top + 4 smaller tiles below.
 * Index model:
 *   0, 1 = top row
 *   2, 3, 4, 5 = bottom row
 */
@Composable
private fun TwoPlusFourLayout(
    tiles: List<MultiviewTile?>,
    focusedIndex: Int,
    pool: WarmPlayerPool,
    onFocusChange: (Int) -> Unit,
    onZoom: (Int) -> Unit,
    onAssign: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // Top: 2 hero tiles, weight 2.
        Row(
            modifier = Modifier.fillMaxWidth().weight(2f),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            for (i in 0..1) {
                MultiviewTileView(
                    tile = tiles.getOrNull(i),
                    index = i,
                    focused = focusedIndex == i,
                    pool = pool,
                    onFocusChange = onFocusChange,
                    onZoom = onZoom,
                    onAssign = onAssign,
                    onNav = { k ->
                        when (k) {
                            NavKey.Left -> if (i == 1) onFocusChange(0)
                            NavKey.Right -> if (i == 0) onFocusChange(1)
                            NavKey.Down -> onFocusChange(if (i == 0) 2 else 4)
                            else -> {}
                        }
                    },
                    modifier = Modifier.weight(1f).fillMaxHeight(),
                )
            }
        }
        // Bottom: 4 tiles, weight 1.
        Row(
            modifier = Modifier.fillMaxWidth().weight(1f),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            for (j in 0..3) {
                val idx = 2 + j
                MultiviewTileView(
                    tile = tiles.getOrNull(idx),
                    index = idx,
                    focused = focusedIndex == idx,
                    pool = pool,
                    onFocusChange = onFocusChange,
                    onZoom = onZoom,
                    onAssign = onAssign,
                    onNav = { k ->
                        when (k) {
                            NavKey.Left -> if (j > 0) onFocusChange(idx - 1)
                            NavKey.Right -> if (j < 3) onFocusChange(idx + 1)
                            NavKey.Up -> onFocusChange(if (j < 2) 0 else 1)
                            else -> {}
                        }
                    },
                    modifier = Modifier.weight(1f).fillMaxHeight(),
                )
            }
        }
    }
}

private enum class NavKey { Left, Right, Up, Down }

@Composable
private fun MultiviewTileView(
    tile: MultiviewTile?,
    index: Int,
    focused: Boolean,
    pool: WarmPlayerPool,
    onFocusChange: (Int) -> Unit,
    onZoom: (Int) -> Unit,
    onAssign: (Int) -> Unit,
    onNav: (NavKey) -> Unit,
    modifier: Modifier = Modifier,
) {
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) { if (index == 0) runCatching { focusRequester.requestFocus() } }
    LaunchedEffect(focused) { if (focused) runCatching { focusRequester.requestFocus() } }

    val playerViewRef = remember { Array<PlayerView?>(1) { null } }
    LaunchedEffect(focused, tile?.channel?.id) {
        val pv = playerViewRef[0] ?: return@LaunchedEffect
        val channelId = tile?.channel?.id ?: return@LaunchedEffect
        if (focused) pool.attachFocused(channelId, pv) else pool.attachMuted(channelId, pv)
    }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(Color.Black)
            .border(
                width = if (focused) 3.dp else 1.dp,
                color = if (focused) FoundryColors.Orange else Color(0x33FFFFFF),
                shape = RoundedCornerShape(8.dp),
            )
            .focusRequester(focusRequester)
            .focusable()
            .onFocusChanged { if (it.isFocused) onFocusChange(index) }
            .onKeyEvent { ev ->
                if (ev.type != KeyEventType.KeyDown) return@onKeyEvent false
                when (ev.key) {
                    Key.DirectionCenter, Key.Enter, Key.NumPadEnter -> {
                        if (tile != null) {
                            onZoom(index)
                        } else {
                            onAssign(index)
                        }
                        true
                    }
                    Key.Menu -> {
                        onAssign(index); true
                    }
                    Key.DirectionLeft -> { onNav(NavKey.Left); true }
                    Key.DirectionRight -> { onNav(NavKey.Right); true }
                    Key.DirectionUp -> { onNav(NavKey.Up); true }
                    Key.DirectionDown -> { onNav(NavKey.Down); true }
                    else -> false
                }
            },
    ) {
        if (tile != null) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        useController = false
                        layoutParams = ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT,
                        )
                        playerViewRef[0] = this
                        if (focused) pool.attachFocused(tile.channel.id, this)
                        else pool.attachMuted(tile.channel.id, this)
                    }
                },
            )
            Box(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(8.dp)
                    .background(Color(0xCC000000), RoundedCornerShape(4.dp))
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            ) {
                Text(
                    text = tile.channel.name,
                    color = FoundryColors.OnSurface,
                    fontSize = 12.sp,
                )
            }
        } else {
            // Empty-slot placeholder.
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "+ Add channel",
                    color = if (focused) FoundryColors.Orange else FoundryColors.OnSurfaceVariant,
                    fontSize = 16.sp,
                )
            }
        }
    }
}

@Composable
private fun PresetChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var focused by remember { mutableStateOf(false) }
    val bg = when {
        focused -> FoundryColors.Orange
        selected -> FoundryColors.OrangeDim
        else -> FoundryColors.SurfaceVariant
    }
    Box(
        modifier = modifier
            .height(40.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(bg)
            .border(
                width = 2.dp,
                color = if (focused) FoundryColors.OrangeBright else FoundryColors.Border,
                shape = RoundedCornerShape(20.dp),
            )
            .padding(horizontal = 18.dp)
            .focusable()
            .onFocusChanged { focused = it.isFocused }
            .onKeyEvent { ev ->
                if (ev.type == KeyEventType.KeyDown &&
                    (ev.key == Key.DirectionCenter || ev.key == Key.Enter ||
                            ev.key == Key.NumPadEnter)
                ) {
                    onClick(); true
                } else false
            },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = if (focused) FoundryColors.OnPrimary else FoundryColors.OnSurface,
            fontSize = 15.sp,
        )
    }
}

internal data class MultiviewTile(
    val channel: Channel,
    val sid: String,
    val hlsUrl: String,
)

/**
 * Detect FireStick Lite (or any low-RAM Fire TV) so we can cap the grid
 * to layouts that use at most 4 concurrent streams.
 */
private fun isLowRamFireTv(context: Context): Boolean {
    val modelHit = Build.MODEL?.contains("AFTSS", ignoreCase = true) == true
    val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
    val lowMem = (am?.memoryClass ?: 256) < 256
    return modelHit || lowMem
}

/** Parse a comma-separated channel-id list from SharedPreferences. */
private fun restoreSlots(raw: String?, size: Int): List<String?> {
    if (raw.isNullOrBlank()) return List(size) { null }
    val parts = raw.split(',')
    return List(size) { i ->
        val v = parts.getOrNull(i)?.trim().orEmpty()
        if (v.isEmpty()) null else v
    }
}
