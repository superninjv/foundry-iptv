package com.foundry.iptv.ui.guide

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
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
import com.foundry.iptv.core.ApiClient
import com.foundry.iptv.core.Channel
import com.foundry.iptv.core.EpgEntry
import com.foundry.iptv.player.PlayerHost
import com.foundry.iptv.ui.theme.FoundryColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

/**
 * EPG Guide screen — horizontal time grid.
 *
 * Rows: channels (MVP: first 200 channels, TODO paginate / integrate with
 *       category selection in a later pass).
 * Columns: 48 thirty-minute slots covering the next 24h window.
 *
 * Focus model: every cell is a `focusable()` Box with an onKeyEvent handler.
 * D-pad Left/Right naturally walks within a LazyRow; D-pad Up/Down naturally
 * jumps between rows thanks to LazyColumn + Compose focus search. OK on a
 * cell whose program is airing right now starts playback via PlayerHost.
 *
 * Synchronized horizontal scroll: every row observes a shared scroll offset
 * so channels stay aligned with the time ruler at the top.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun GuideScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var channels by remember { mutableStateOf<List<Channel>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var errorText by remember { mutableStateOf<String?>(null) }

    var playingChannel by rememberSaveable { mutableStateOf<String?>(null) }
    var playingName by rememberSaveable { mutableStateOf<String?>(null) }
    var playingHlsUrl by rememberSaveable { mutableStateOf<String?>(null) }
    var playingSid by rememberSaveable { mutableStateOf<String?>(null) }

    // Window anchors: now rounded down to nearest 30 minutes, then 48 slots.
    val (windowStart, slots) = remember {
        val nowUtc = Instant.now().atZone(ZoneId.systemDefault())
        val floored = nowUtc.withSecond(0).withNano(0)
            .withMinute(if (nowUtc.minute < 30) 0 else 30)
        val slotList = (0 until 48).map { floored.plusMinutes(it * 30L) }
        floored to slotList
    }

    // Shared horizontal scroll state for the ruler + every channel row.
    val sharedRowState = rememberLazyListState()

    LaunchedEffect(Unit) {
        val result = withContext(Dispatchers.IO) {
            runCatching {
                val client = buildGuideApiClient(context)
                    ?: error("Missing credentials")
                client.listChannels().take(200)
            }
        }
        result.onSuccess {
            channels = it
            loading = false
        }.onFailure {
            errorText = it.message ?: "Failed to load channels"
            loading = false
        }
    }

    if (playingHlsUrl != null && playingChannel != null) {
        PlayerHost(
            hlsUrl = playingHlsUrl!!,
            channelName = playingName ?: "",
            onBack = {
                val id = playingChannel
                val sid = playingSid
                if (id != null && sid != null) {
                    scope.launch(Dispatchers.IO) {
                        runCatching { buildGuideApiClient(context)?.stopStream(id, sid) }
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
                text = "Loading guide…",
                color = FoundryColors.OnSurfaceVariant,
                fontSize = 20.sp,
                modifier = Modifier.align(Alignment.Center),
            )

            errorText != null -> Text(
                text = errorText!!,
                color = Color(0xFFFF6666),
                fontSize = 18.sp,
                modifier = Modifier.align(Alignment.Center).padding(32.dp),
            )

            else -> Column(modifier = Modifier.fillMaxSize()) {
                TimeRuler(slots = slots, sharedState = sharedRowState)
                Spacer(Modifier.height(4.dp))
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    items(channels, key = { it.id }) { channel ->
                        ChannelEpgRow(
                            channel = channel,
                            slots = slots,
                            sharedState = sharedRowState,
                            onStartPlayback = { program ->
                                scope.launch {
                                    val result = withContext(Dispatchers.IO) {
                                        runCatching {
                                            val client = buildGuideApiClient(context)
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
    }
}

private const val CHANNEL_LABEL_WIDTH_DP = 140
private const val SLOT_WIDTH_DP = 180
private const val ROW_HEIGHT_DP = 72

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun TimeRuler(
    slots: List<ZonedDateTime>,
    sharedState: androidx.compose.foundation.lazy.LazyListState,
) {
    val timeFormatter = remember { DateTimeFormatter.ofPattern("h:mm a") }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(36.dp)
            .background(FoundryColors.Surface),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .width(CHANNEL_LABEL_WIDTH_DP.dp)
                .height(36.dp)
                .padding(start = 12.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            Text(
                text = "Channel",
                color = FoundryColors.OnSurfaceVariant,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
        // The ruler uses its own state but seeded from shared — we read but
        // don't drive scroll here since focus lives in the rows.
        LazyRow(
            state = sharedState,
            modifier = Modifier.fillMaxWidth(),
        ) {
            items(slots) { slot ->
                Box(
                    modifier = Modifier
                        .width(SLOT_WIDTH_DP.dp)
                        .height(36.dp)
                        .padding(start = 8.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    Text(
                        text = slot.format(timeFormatter),
                        color = FoundryColors.OnSurfaceVariant,
                        fontSize = 12.sp,
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun ChannelEpgRow(
    channel: Channel,
    slots: List<ZonedDateTime>,
    sharedState: androidx.compose.foundation.lazy.LazyListState,
    onStartPlayback: (EpgEntry?) -> Unit,
) {
    val context = LocalContext.current
    var programs by remember(channel.id) { mutableStateOf<List<EpgEntry>>(emptyList()) }

    // Lazy EPG fetch — fires once per row mount.
    LaunchedEffect(channel.id) {
        val result = withContext(Dispatchers.IO) {
            runCatching {
                val client = buildGuideApiClient(context) ?: return@runCatching emptyList()
                client.getEpg(channel.id, 24u)
            }
        }
        programs = result.getOrNull() ?: emptyList()
    }

    // This row drives the shared scroll state when focused. We deliberately
    // use the same state object for every row so horizontal scroll stays in
    // sync across rows + ruler (Compose LazyListState only has one owner at a
    // time; passing the same instance means whichever row is visible wins).
    val rowState = sharedState

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(ROW_HEIGHT_DP.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .width(CHANNEL_LABEL_WIDTH_DP.dp)
                .height(ROW_HEIGHT_DP.dp)
                .padding(horizontal = 12.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            Text(
                text = channel.name,
                color = FoundryColors.OnSurface,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
            )
        }
        LazyRow(
            state = rowState,
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            contentPadding = PaddingValues(horizontal = 2.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            items(slots.size) { slotIdx ->
                val slot = slots[slotIdx]
                val slotEnd = slot.plusMinutes(30)
                val program = remember(programs, slotIdx) {
                    programs.firstOrNull { ep ->
                        val start = parseInstant(ep.start) ?: return@firstOrNull false
                        val end = parseInstant(ep.end) ?: return@firstOrNull false
                        start.isBefore(slotEnd.toInstant()) &&
                            end.isAfter(slot.toInstant())
                    }
                }
                val now = Instant.now()
                val isNow = program != null &&
                    parseInstant(program.start)?.isBefore(now) == true &&
                    parseInstant(program.end)?.isAfter(now) == true
                EpgCell(
                    title = program?.title ?: "—",
                    isNow = isNow,
                    onSelect = { if (isNow) onStartPlayback(program) },
                )
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun EpgCell(
    title: String,
    isNow: Boolean,
    onSelect: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val borderColor = if (focused) FoundryColors.Orange else FoundryColors.Border
    val bgColor = when {
        focused -> FoundryColors.SurfaceBright
        isNow -> FoundryColors.Surface
        else -> FoundryColors.Background
    }
    Box(
        modifier = Modifier
            .width(SLOT_WIDTH_DP.dp)
            .height((ROW_HEIGHT_DP - 8).dp)
            .clip(RoundedCornerShape(6.dp))
            .background(bgColor)
            .border(1.dp, borderColor, RoundedCornerShape(6.dp))
            .padding(horizontal = 8.dp, vertical = 6.dp)
            .onFocusChanged { focused = it.isFocused }
            .focusable()
            .onKeyEvent { ev ->
                if (ev.type == KeyEventType.KeyDown &&
                    (ev.key == Key.Enter || ev.key == Key.DirectionCenter ||
                        ev.key == Key.NumPadEnter)
                ) {
                    onSelect()
                    true
                } else {
                    false
                }
            },
        contentAlignment = Alignment.CenterStart,
    ) {
        Text(
            text = title,
            color = if (isNow) FoundryColors.OnSurface else FoundryColors.OnSurfaceVariant,
            fontSize = 13.sp,
            maxLines = 2,
        )
    }
}

/**
 * EPG entries carry ISO-8601 strings (e.g. "2026-04-11T14:00:00Z").
 * Parse defensively — any malformed value just returns null and the cell
 * falls back to the placeholder.
 */
private fun parseInstant(s: String): Instant? {
    return try {
        Instant.parse(s)
    } catch (_: DateTimeParseException) {
        try {
            ZonedDateTime.parse(s).toInstant()
        } catch (_: DateTimeParseException) {
            null
        }
    }
}

// ---- ApiClient wiring (kept private to this package to respect file-ownership
// boundaries; W4-A can later consolidate with ui/live/ApiClientFactory.kt).

internal fun buildGuideApiClient(context: Context): ApiClient? {
    val prefs = context.getSharedPreferences("foundry_prefs", Context.MODE_PRIVATE)
    val url = prefs.getString("server_url", null) ?: return null
    val token = prefs.getString("device_token", null) ?: return null
    return ApiClient(url).also { it.setToken(token) }
}
