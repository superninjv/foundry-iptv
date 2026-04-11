package com.foundry.iptv.ui.search

import android.content.Context
import android.util.Log
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text
import com.foundry.iptv.core.ApiClient
import com.foundry.iptv.core.Channel
import com.foundry.iptv.core.EpgEntry
import com.foundry.iptv.core.SearchResult
import com.foundry.iptv.core.VodItem
import com.foundry.iptv.player.PlayerHost
import com.foundry.iptv.ui.image.ChannelLogo
import com.foundry.iptv.ui.theme.FoundryColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val TAG = "SearchScreen"
private const val DEBOUNCE_MS = 400L

/**
 * Which result bucket the user wants to see. Maps to the three lists inside
 * the FFI's [SearchResult] struct (channels / programs / vod). This is a pure
 * UI filter — both text and AI search return the same grouped shape, we just
 * render one bucket at a time.
 */
private enum class ResultFilter(val label: String) {
    Channels("Channels"),
    Guide("Guide"),
    Vod("VOD"),
}

/**
 * Track J Wave 2-C — Search screen (text + AI).
 *
 * Top area: a text field (Fire TV soft keyboard pops up on focus), a bucket
 * filter row (Channels / Guide / VOD), and an AI toggle that routes queries
 * through [ApiClient.aiSearch] instead of [ApiClient.search].
 *
 * Below: a lazy list of results for the currently-selected bucket. OK on a
 * channel row fetches the HLS URL via [ApiClient.startStream] and launches
 * [PlayerHost] full-screen. OK on a Guide or VOD row is currently a no-op
 * (logs only) — the web API surfaces for VOD/program playback live in later
 * tracks.
 *
 * Debounce: the query coroutine waits [DEBOUNCE_MS] ms after the last
 * keystroke before hitting the FFI, cancelling any in-flight call if the
 * user types again. 400 ms is the budget from the handoff doc.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SearchScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // Lazily build (and keep alive for the lifetime of this screen) one
    // ApiClient. It's Disposable, so we tear it down on leave.
    val client = remember { buildApiClient(context) }
    DisposableEffect(client) {
        onDispose { runCatching { client?.close() } }
    }

    var query by remember { mutableStateOf("") }
    var aiMode by remember { mutableStateOf(false) }
    var filter by remember { mutableStateOf(ResultFilter.Channels) }

    var results by remember { mutableStateOf<SearchResult?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    // Active playback. When non-null we swap the whole screen for PlayerHost.
    var playing by remember { mutableStateOf<PlayingStream?>(null) }

    // Debounced query runner. LaunchedEffect keyed on (query, aiMode) — any
    // keystroke cancels the previous coroutine automatically because Compose
    // relaunches the effect, killing the old Job's delay before it fires.
    LaunchedEffect(query, aiMode, client) {
        val q = query.trim()
        if (client == null || q.length < 2) {
            results = null
            loading = false
            error = null
            return@LaunchedEffect
        }
        loading = true
        error = null
        delay(DEBOUNCE_MS)
        val outcome = withContext(Dispatchers.IO) {
            runCatching {
                if (aiMode) client.aiSearch(q) else client.search(q)
            }
        }
        outcome
            .onSuccess { results = it }
            .onFailure {
                error = it.message ?: "Search failed"
                results = null
            }
        loading = false
    }

    // If the user triggered playback, render the player full-screen instead
    // of the search UI. Back returns to the result list (state is preserved
    // because `remember` lives on through the branch swap).
    val active = playing
    if (active != null) {
        PlayerHost(
            hlsUrl = active.hlsUrl,
            channelName = active.channelName,
            onBack = { playing = null },
        )
        return
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(FoundryColors.Background)
            .padding(16.dp),
    ) {
        Text(
            text = if (aiMode) "AI Search" else "Search",
            color = FoundryColors.OnBackground,
            fontSize = 28.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = {
                androidx.compose.material3.Text(
                    if (aiMode) "Ask the AI (e.g. \"calm nature docs\")"
                    else "Type a channel, show, or movie…",
                )
            },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { /* debounce handles it */ }),
            modifier = Modifier.fillMaxWidth(0.6f),
        )

        Spacer(Modifier.height(12.dp))

        Row(verticalAlignment = Alignment.CenterVertically) {
            ResultFilter.entries.forEach { rf ->
                FilterChip(
                    label = rf.label,
                    selected = filter == rf,
                    onClick = { filter = rf },
                )
                Spacer(Modifier.width(8.dp))
            }
            Spacer(Modifier.width(16.dp))
            FilterChip(
                label = if (aiMode) "AI: ON" else "AI: OFF",
                selected = aiMode,
                onClick = { aiMode = !aiMode },
            )
        }

        Spacer(Modifier.height(16.dp))

        Box(modifier = Modifier.fillMaxSize()) {
            when {
                loading -> Text(
                    "Searching…",
                    color = FoundryColors.OnSurfaceVariant,
                    fontSize = 16.sp,
                )
                error != null -> Text(
                    "Error: $error",
                    color = Color(0xFFFF6666),
                    fontSize = 16.sp,
                )
                results == null -> Text(
                    if (query.isBlank()) "Enter a query to begin."
                    else "Keep typing…",
                    color = FoundryColors.OnSurfaceVariant,
                    fontSize = 16.sp,
                )
                else -> ResultsList(
                    results = results!!,
                    filter = filter,
                    onPlayChannel = { ch ->
                        scope.launch {
                            val session = withContext(Dispatchers.IO) {
                                runCatching { client?.startStream(ch.id) }
                            }.getOrNull()
                            if (session != null) {
                                playing = PlayingStream(
                                    hlsUrl = session.hlsUrl,
                                    channelName = ch.name,
                                )
                            } else {
                                Log.w(TAG, "startStream failed for channel ${ch.id}")
                            }
                        }
                    },
                    onPlayProgram = { ep ->
                        Log.i(TAG, "Guide result OK: channel=${ep.channelId} title=${ep.title}")
                    },
                    onPlayVod = { v ->
                        Log.i(TAG, "VOD result OK: streamId=${v.streamId} name=${v.name}")
                    },
                )
            }
        }
    }
}

private data class PlayingStream(val hlsUrl: String, val channelName: String)

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun FilterChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val borderColor = when {
        focused -> FoundryColors.BorderFocused
        selected -> FoundryColors.Orange
        else -> FoundryColors.Border
    }
    val bg = if (selected) FoundryColors.SurfaceBright else FoundryColors.Surface
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(bg)
            .border(2.dp, borderColor, RoundedCornerShape(8.dp))
            .padding(horizontal = 14.dp, vertical = 8.dp)
            .onFocusChanged { focused = it.isFocused }
            .focusable()
            .clickableOnKey(onClick),
    ) {
        Text(
            text = label,
            color = FoundryColors.OnSurface,
            fontSize = 14.sp,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}

@Composable
private fun ResultsList(
    results: SearchResult,
    filter: ResultFilter,
    onPlayChannel: (Channel) -> Unit,
    onPlayProgram: (EpgEntry) -> Unit,
    onPlayVod: (VodItem) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        when (filter) {
            ResultFilter.Channels -> {
                if (results.channels.isEmpty()) {
                    item { EmptyRow("No channels match.") }
                } else {
                    items(results.channels, key = { it.id }) { ch ->
                        ChannelRow(ch, onClick = { onPlayChannel(ch) })
                    }
                }
            }
            ResultFilter.Guide -> {
                if (results.programs.isEmpty()) {
                    item { EmptyRow("No guide programs match.") }
                } else {
                    items(results.programs) { ep ->
                        ProgramRow(ep, onClick = { onPlayProgram(ep) })
                    }
                }
            }
            ResultFilter.Vod -> {
                if (results.vod.isEmpty()) {
                    item { EmptyRow("No VOD items match.") }
                } else {
                    items(results.vod, key = { it.streamId }) { v ->
                        VodRow(v, onClick = { onPlayVod(v) })
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun ChannelRow(channel: Channel, onClick: () -> Unit) {
    SearchResultRow(onClick = onClick) {
        ChannelLogo(channel = channel, sizeDp = 48.dp)
        Spacer(Modifier.width(12.dp))
        Column {
            Text(
                channel.name,
                color = FoundryColors.OnSurface,
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
            )
            channel.group?.let {
                Text(it, color = FoundryColors.OnSurfaceVariant, fontSize = 12.sp)
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun ProgramRow(entry: EpgEntry, onClick: () -> Unit) {
    SearchResultRow(onClick = onClick) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(FoundryColors.SurfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            Text("EPG", color = FoundryColors.OnSurfaceVariant, fontSize = 12.sp)
        }
        Spacer(Modifier.width(12.dp))
        Column {
            Text(
                entry.title,
                color = FoundryColors.OnSurface,
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
            )
            Text(
                "${entry.channelId} · ${entry.start}",
                color = FoundryColors.OnSurfaceVariant,
                fontSize = 12.sp,
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun VodRow(v: VodItem, onClick: () -> Unit) {
    SearchResultRow(onClick = onClick) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(FoundryColors.SurfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            Text("VOD", color = FoundryColors.OnSurfaceVariant, fontSize = 12.sp)
        }
        Spacer(Modifier.width(12.dp))
        Column {
            Text(
                v.name,
                color = FoundryColors.OnSurface,
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
            )
            v.rating?.let {
                Text("Rating $it", color = FoundryColors.OnSurfaceVariant, fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun SearchResultRow(
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val border = if (focused) FoundryColors.BorderFocused else Color.Transparent
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(6.dp))
            .background(if (focused) FoundryColors.SurfaceBright else FoundryColors.Surface)
            .border(2.dp, border, RoundedCornerShape(6.dp))
            .padding(8.dp)
            .onFocusChanged { focused = it.isFocused }
            .focusable()
            .clickableOnKey(onClick),
    ) {
        content()
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun EmptyRow(message: String) {
    Text(message, color = FoundryColors.OnSurfaceVariant, fontSize = 14.sp)
}

/**
 * Fires [onClick] when the focused element receives a D-pad Center / Enter.
 * Avoids pulling in tv-material3 Button just for a click surface, which lets
 * the row composables stay lightweight and 52k-list friendly.
 */
private fun Modifier.clickableOnKey(onClick: () -> Unit): Modifier =
    this.onKeyEvent { ev ->
        if (ev.type != KeyEventType.KeyDown) {
            false
        } else {
            when (ev.key) {
                Key.DirectionCenter, Key.Enter, Key.NumPadEnter -> {
                    onClick()
                    true
                }
                else -> false
            }
        }
    }

/**
 * Reads server URL + token from foundry_prefs (populated by PairingScreen)
 * and returns a ready-to-call [ApiClient]. Returns null if pairing hasn't
 * completed — the caller renders an empty state in that case.
 *
 * Inlined here (rather than a shared helper) because Wave 2-C only owns
 * the `ui/search/` package per the file-ownership map.
 */
private fun buildApiClient(context: Context): ApiClient? {
    val prefs = context.getSharedPreferences("foundry_prefs", Context.MODE_PRIVATE)
    val baseUrl = prefs.getString("server_url", null) ?: return null
    val token = prefs.getString("device_token", null) ?: return null
    return ApiClient(baseUrl).also { it.setToken(token) }
}
