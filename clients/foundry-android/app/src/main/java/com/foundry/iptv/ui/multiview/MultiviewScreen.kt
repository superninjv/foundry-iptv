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
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.ui.PlayerView
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import com.foundry.iptv.core.ApiClient
import com.foundry.iptv.core.Channel
import com.foundry.iptv.player.PlayerHost
import com.foundry.iptv.player.WarmPlayerPool
import com.foundry.iptv.ui.focus.KeyboardHandler
import com.foundry.iptv.ui.theme.FoundryColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Multiview: a 2x2 or 3x3 grid of concurrently-playing PlayerView surfaces,
 * backed by the shared [WarmPlayerPool] from W3-A.
 *
 * Only the focused tile is audible; D-pad navigates the grid and hot-swaps
 * which tile owns focus (pool demotes the old tile to muted, promotes the
 * new one). OK zooms the focused tile to full-screen single-view via
 * [PlayerHost]; Back returns to the grid.
 *
 * FireStick Lite mitigation: Lite devices (detected via model / memoryClass)
 * are capped at 2x2 to avoid OOM with 9 concurrent ExoPlayers at 1080p.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun MultiviewScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val liteDevice = remember { isLowRamFireTv(context) }
    // 2x2 is the only preset on Lite; 4K Max gets the toggle.
    var gridSize by remember { mutableStateOf(2) }
    var tiles by remember { mutableStateOf<List<MultiviewTile>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var focusedIndex by remember { mutableStateOf(0) }
    var zoomed by remember { mutableStateOf<MultiviewTile?>(null) }

    // Pool is scoped to this screen; released on dispose.
    val pool = remember {
        val cap = if (liteDevice) 4 else 9
        WarmPlayerPool(context, cap)
    }
    DisposableEffect(pool) {
        onDispose { pool.releaseAll() }
    }

    // Pick the tile source when gridSize changes.
    LaunchedEffect(gridSize) {
        loading = true
        error = null
        val target = gridSize * gridSize
        val result = withContext(Dispatchers.IO) {
            runCatching {
                val client = buildApiClient(context)
                val favIds = client.listFavorites()
                val allChannels = client.listChannels()
                val byId = allChannels.associateBy { it.id }
                val picked = mutableListOf<Channel>()
                for (id in favIds) {
                    val ch = byId[id] ?: continue
                    picked += ch
                    if (picked.size >= target) break
                }
                if (picked.size < target) {
                    for (ch in allChannels) {
                        if (picked.none { it.id == ch.id }) {
                            picked += ch
                            if (picked.size >= target) break
                        }
                    }
                }
                picked.take(target).map { ch ->
                    val session = client.startStream(ch.id)
                    MultiviewTile(channel = ch, sid = session.sid, hlsUrl = session.hlsUrl)
                }
            }
        }
        result.onSuccess { newTiles ->
            // Release stale pool entries we don't need anymore.
            pool.releaseAll()
            newTiles.forEach { t -> pool.prepare(t.channel.id, t.hlsUrl) }
            tiles = newTiles
            focusedIndex = 0
            loading = false
        }.onFailure { e ->
            error = e.message ?: "Failed to load multiview"
            loading = false
        }
    }

    // Zoomed full-screen single view of the focused tile.
    zoomed?.let { tile ->
        KeyboardHandler(onBack = { zoomed = null }) {
            PlayerHost(
                hlsUrl = tile.hlsUrl,
                channelName = tile.channel.name,
                onBack = { zoomed = null },
            )
        }
        return
    }

    KeyboardHandler {
        Box(modifier = modifier.fillMaxSize().background(FoundryColors.Background)) {
            Column(Modifier.fillMaxSize().padding(16.dp)) {
                // Top toggle bar.
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
                    PresetChip(
                        label = "2x2",
                        selected = gridSize == 2,
                        onClick = { if (gridSize != 2) gridSize = 2 },
                    )
                    Spacer(Modifier.width(8.dp))
                    PresetChip(
                        label = "3x3",
                        selected = gridSize == 3,
                        enabled = !liteDevice,
                        onClick = { if (!liteDevice && gridSize != 3) gridSize = 3 },
                    )
                    if (liteDevice) {
                        Spacer(Modifier.width(16.dp))
                        Text(
                            text = "(Lite device — 3x3 disabled)",
                            color = FoundryColors.OnSurfaceVariant,
                            fontSize = 12.sp,
                        )
                    }
                }
                Spacer(Modifier.height(12.dp))

                when {
                    loading -> Text(
                        text = "Loading tiles…",
                        color = FoundryColors.OnSurfaceVariant,
                        fontSize = 18.sp,
                    )
                    error != null -> Text(
                        text = error!!,
                        color = Color(0xFFFF6666),
                        fontSize = 16.sp,
                    )
                    tiles.isEmpty() -> Text(
                        text = "No channels available.",
                        color = FoundryColors.OnSurfaceVariant,
                        fontSize = 16.sp,
                    )
                    else -> Grid(
                        tiles = tiles,
                        gridSize = gridSize,
                        focusedIndex = focusedIndex,
                        pool = pool,
                        onFocusChange = { newIdx ->
                            if (newIdx != focusedIndex &&
                                newIdx in tiles.indices
                            ) {
                                focusedIndex = newIdx
                            }
                        },
                        onZoom = { idx ->
                            tiles.getOrNull(idx)?.let { zoomed = it }
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun Grid(
    tiles: List<MultiviewTile>,
    gridSize: Int,
    focusedIndex: Int,
    pool: WarmPlayerPool,
    onFocusChange: (Int) -> Unit,
    onZoom: (Int) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        for (row in 0 until gridSize) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                for (col in 0 until gridSize) {
                    val index = row * gridSize + col
                    if (index < tiles.size) {
                        MultiviewTileView(
                            tile = tiles[index],
                            index = index,
                            focused = index == focusedIndex,
                            pool = pool,
                            gridSize = gridSize,
                            onFocusChange = onFocusChange,
                            onZoom = onZoom,
                            modifier = Modifier.weight(1f).fillMaxSize(),
                        )
                    } else {
                        Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun MultiviewTileView(
    tile: MultiviewTile,
    index: Int,
    focused: Boolean,
    pool: WarmPlayerPool,
    gridSize: Int,
    onFocusChange: (Int) -> Unit,
    onZoom: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val focusRequester = remember { FocusRequester() }
    // Request focus the first time the 0-index tile mounts.
    LaunchedEffect(Unit) {
        if (index == 0) runCatching { focusRequester.requestFocus() }
    }

    // Promote/demote based on focused state. This is the single helper
    // that touches WarmPlayerPool attach/*: keep call sites local so
    // W4-A can reconcile if the API drifts.
    val playerViewRef = remember { Array<PlayerView?>(1) { null } }
    LaunchedEffect(focused, tile.channel.id) {
        val pv = playerViewRef[0] ?: return@LaunchedEffect
        attachTile(pool, tile.channel.id, pv, focused)
    }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .background(Color.Black)
            .border(
                width = if (focused) 3.dp else 1.dp,
                color = if (focused) FoundryColors.Orange else Color(0x33FFFFFF),
                shape = RoundedCornerShape(6.dp),
            )
            .focusRequester(focusRequester)
            .focusable()
            .onFocusChanged { if (it.isFocused) onFocusChange(index) }
            .onKeyEvent { ev ->
                if (ev.type != KeyEventType.KeyDown) return@onKeyEvent false
                when (ev.key) {
                    Key.DirectionCenter, Key.Enter, Key.NumPadEnter -> {
                        onZoom(index)
                        true
                    }
                    Key.DirectionLeft -> {
                        val col = index % gridSize
                        if (col > 0) {
                            onFocusChange(index - 1); true
                        } else false
                    }
                    Key.DirectionRight -> {
                        val col = index % gridSize
                        if (col < gridSize - 1) {
                            onFocusChange(index + 1); true
                        } else false
                    }
                    Key.DirectionUp -> {
                        val row = index / gridSize
                        if (row > 0) {
                            onFocusChange(index - gridSize); true
                        } else false
                    }
                    Key.DirectionDown -> {
                        val row = index / gridSize
                        if (row < gridSize - 1) {
                            onFocusChange(index + gridSize); true
                        } else false
                    }
                    else -> false
                }
            },
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
                    playerViewRef[0] = this
                    attachTile(pool, tile.channel.id, this, focused)
                }
            },
        )

        // Channel label pinned bottom-left.
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
    }

    // Re-request focus when the focused index changes to this tile.
    LaunchedEffect(focused) {
        if (focused) runCatching { focusRequester.requestFocus() }
    }
}

/**
 * Localized WarmPlayerPool attach helper — this is the ONLY place the
 * multiview package calls into attachFocused/attachMuted. If W3-A ships
 * a different method shape, patch here in one place.
 */
private fun attachTile(
    pool: WarmPlayerPool,
    channelId: String,
    playerView: PlayerView,
    focused: Boolean,
) {
    if (focused) {
        pool.attachFocused(channelId, playerView)
    } else {
        pool.attachMuted(channelId, playerView)
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun PresetChip(
    label: String,
    selected: Boolean,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Surface(
        modifier = Modifier
            .height(36.dp)
            .clip(RoundedCornerShape(18.dp)),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = if (selected) FoundryColors.OrangeDim else FoundryColors.Surface,
            focusedContainerColor = FoundryColors.Orange,
            disabledContainerColor = Color(0xFF2A2A2A),
        ),
        enabled = enabled,
        onClick = onClick,
    ) {
        Box(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = label,
                color = if (enabled) FoundryColors.OnSurface else FoundryColors.OnSurfaceVariant,
                fontSize = 14.sp,
            )
        }
    }
}

internal data class MultiviewTile(
    val channel: Channel,
    val sid: String,
    val hlsUrl: String,
)

/**
 * Detect FireStick Lite (or any low-RAM Fire TV) so we can cap the grid
 * at 2x2. Lite reports memoryClass ~192 MB and model contains "AFTSS".
 */
private fun isLowRamFireTv(context: Context): Boolean {
    val modelHit = Build.MODEL?.contains("AFTSS", ignoreCase = true) == true
    val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
    val lowMem = (am?.memoryClass ?: 256) < 256
    return modelHit || lowMem
}

/**
 * Inline ApiClient factory — reads pairing prefs and applies the stored token.
 * Duplicated from other screens to keep this package self-contained.
 */
private fun buildApiClient(ctx: Context): ApiClient {
    val prefs = ctx.getSharedPreferences("foundry_prefs", Context.MODE_PRIVATE)
    val baseUrl = prefs.getString("server_url", null)
        ?: error("No server_url in foundry_prefs — device not paired")
    val token = prefs.getString("device_token", null).orEmpty()
    return ApiClient(baseUrl).also { it.setToken(token) }
}
