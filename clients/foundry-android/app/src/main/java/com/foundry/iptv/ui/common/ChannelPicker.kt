package com.foundry.iptv.ui.common

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text
import com.foundry.iptv.core.Channel
import com.foundry.iptv.ui.focus.KeyboardHandler
import com.foundry.iptv.ui.focus.firstFocus
import com.foundry.iptv.ui.focus.rememberFirstFocus
import com.foundry.iptv.ui.image.ChannelLogo
import com.foundry.iptv.ui.theme.FoundryColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Full-screen modal overlay that lets the user pick a channel for a deck
 * entry or a multiview tile. Shared between Decks and Multiview via the
 * common package per Track J R4.
 *
 * Source order (cheapest first):
 *  1. [LibraryStore.getLive] — watched-only. Usually <100 channels, instant.
 *  2. Falls back to `ApiClient.listChannels()` once if the library is empty
 *     (brand-new user hasn't watched anything yet).
 *
 * The search box uses a 400 ms debounce so key repeat doesn't churn the
 * filter — the results list re-renders on every non-whitespace change.
 *
 * Focus model:
 *  - On open: focus lands on the search TextField. D-pad Down from the
 *    search field enters the results list.
 *  - D-pad Up from the first result returns focus to the search field.
 *  - Back dismisses the picker via [onDismiss].
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun ChannelPicker(
    onPick: (Channel) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    var query by remember { mutableStateOf("") }
    var debounced by remember { mutableStateOf("") }
    var all by remember { mutableStateOf<List<Channel>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    // Load library first, fall back to full catalog if empty.
    LaunchedEffect(Unit) {
        val result = runCatching {
            val lib = LibraryStore.getLive(context)
            if (lib.isNotEmpty()) {
                lib
            } else {
                withContext(Dispatchers.IO) {
                    ApiClientHolder.get(context).listChannels()
                }
            }
        }
        result.onSuccess {
            all = it
            loading = false
        }.onFailure {
            error = it.message ?: "Failed to load channels"
            loading = false
        }
    }

    // Debounce: wait 400 ms after the last keystroke before recomputing.
    LaunchedEffect(query) {
        delay(400)
        debounced = query
    }

    val filtered = remember(debounced, all) {
        if (debounced.isBlank()) {
            all.take(200)
        } else {
            val q = debounced.trim().lowercase()
            all.asSequence()
                .filter { it.name.lowercase().contains(q) }
                .take(200)
                .toList()
        }
    }

    val searchFocus = rememberFirstFocus()
    val firstRow = remember { FocusRequester() }

    // Modal explicitly opened by the user — claim focus on the search field
    // so they can start typing immediately. firstFocus() no longer auto-claims
    // (to avoid stealing focus out of the hub rail during tab scrubbing), so
    // the claim has to be explicit here.
    LaunchedEffect(Unit) {
        runCatching { searchFocus.requestFocus() }
    }

    KeyboardHandler(onBack = onDismiss) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(Color(0xEE000000)),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth(0.7f)
                    .clip(RoundedCornerShape(16.dp))
                    .background(FoundryColors.Surface)
                    .border(2.dp, FoundryColors.Border, RoundedCornerShape(16.dp))
                    .padding(24.dp),
            ) {
                Text(
                    text = "Pick a channel",
                    color = FoundryColors.OnBackground,
                    fontSize = 22.sp,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    singleLine = true,
                    textStyle = TextStyle(color = FoundryColors.OnSurface, fontSize = 18.sp),
                    placeholder = {
                        androidx.compose.material3.Text(
                            "Search channels…",
                            color = FoundryColors.OnSurfaceVariant,
                        )
                    },
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { debounced = query }),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = FoundryColors.Orange,
                        unfocusedBorderColor = FoundryColors.Border,
                        cursorColor = FoundryColors.Orange,
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .firstFocus(searchFocus)
                        .onKeyEvent { ev ->
                            if (ev.type == KeyEventType.KeyDown &&
                                ev.key == Key.DirectionDown
                            ) {
                                runCatching { firstRow.requestFocus() }
                                true
                            } else false
                        },
                )
                Spacer(Modifier.height(12.dp))
                when {
                    loading -> Text(
                        "Loading channels…",
                        color = FoundryColors.OnSurfaceVariant,
                        fontSize = 16.sp,
                    )
                    error != null -> Text(
                        error!!,
                        color = Color(0xFFFF6666),
                        fontSize = 16.sp,
                    )
                    filtered.isEmpty() -> Text(
                        "No matches",
                        color = FoundryColors.OnSurfaceVariant,
                        fontSize = 16.sp,
                    )
                    else -> LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(420.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        items(filtered, key = { it.id }) { ch ->
                            val isFirst = ch.id == filtered.first().id
                            ChannelPickerRow(
                                channel = ch,
                                onPick = { onPick(ch) },
                                modifier = if (isFirst) {
                                    Modifier.focusRequester(firstRow)
                                } else {
                                    Modifier
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ChannelPickerRow(
    channel: Channel,
    onPick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var focused by remember { mutableStateOf(false) }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(
                if (focused) FoundryColors.OrangeDim else FoundryColors.SurfaceVariant,
            )
            .border(
                width = if (focused) 2.dp else 0.dp,
                color = if (focused) FoundryColors.Orange else Color.Transparent,
                shape = RoundedCornerShape(8.dp),
            )
            .padding(horizontal = 12.dp, vertical = 8.dp)
            .focusable()
            .onFocusChanged { focused = it.isFocused }
            .onKeyEvent { ev ->
                if (ev.type == KeyEventType.KeyDown &&
                    (ev.key == Key.DirectionCenter || ev.key == Key.Enter ||
                            ev.key == Key.NumPadEnter)
                ) {
                    onPick()
                    true
                } else false
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ChannelLogo(channel = channel, sizeDp = 40.dp)
        Spacer(Modifier.width(12.dp))
        Text(
            text = channel.name,
            color = FoundryColors.OnSurface,
            fontSize = 16.sp,
        )
    }
}
