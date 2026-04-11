package com.foundry.iptv.ui.decks

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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
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
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text
import com.foundry.iptv.core.Deck
import com.foundry.iptv.ui.common.ApiClientHolder
import com.foundry.iptv.ui.focus.KeyboardHandler
import com.foundry.iptv.ui.focus.firstFocus
import com.foundry.iptv.ui.focus.rememberFirstFocus
import com.foundry.iptv.ui.theme.FoundryColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Top-level entry point for the Decks section.
 *
 * Track J R4 rewrite: full feature parity with the web. Always renders a
 * focusable top header ("+ New Deck") so the hub's D-pad-Down cascade
 * never lands on a vacuum, even while the deck list is loading or empty.
 * Picking a deck flips this screen into the drill-down [DeckScreen].
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun DeckListScreen(
    modifier: Modifier = Modifier,
    onBack: () -> Unit = {},
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var decks by remember { mutableStateOf<List<Deck>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var openDeckId by remember { mutableStateOf<String?>(null) }

    // Reload trigger — bumped after create/delete to refetch the list.
    var reloadTick by remember { mutableStateOf(0) }

    // Create overlay state.
    var showCreate by remember { mutableStateOf(false) }
    var newDeckName by remember { mutableStateOf("") }
    var creating by remember { mutableStateOf(false) }

    // Delete confirmation state.
    var deckPendingDelete by remember { mutableStateOf<Deck?>(null) }

    LaunchedEffect(reloadTick) {
        loading = true
        error = null
        val result = withContext(Dispatchers.IO) {
            runCatching { ApiClientHolder.get(context).listDecks() }
        }
        result.onSuccess {
            decks = it
            loading = false
        }.onFailure {
            error = it.message ?: "Failed to load decks"
            loading = false
        }
    }

    // Drill-down to deck detail.
    openDeckId?.let { id ->
        DeckScreen(
            deckId = id,
            onBack = {
                openDeckId = null
                reloadTick += 1 // refresh in case the user edited the deck
            },
        )
        return
    }

    // Header focus requester — stays focusable regardless of deck list state
    // so the hub's D-pad Down always cascades successfully.
    val headerFocus = rememberFirstFocus()

    KeyboardHandler(onBack = onBack) {
        Box(modifier = modifier.fillMaxSize().padding(24.dp)) {
            Column(modifier = Modifier.fillMaxSize()) {
                // ---- Header row (always present) ----------------------------
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Your Decks",
                        color = FoundryColors.OnBackground,
                        fontSize = 28.sp,
                    )
                    Spacer(Modifier.width(24.dp))
                    HeaderButton(
                        label = "+ New Deck",
                        onClick = {
                            newDeckName = ""
                            showCreate = true
                        },
                        modifier = Modifier.firstFocus(headerFocus),
                    )
                }
                Spacer(Modifier.height(20.dp))

                // ---- Body ---------------------------------------------------
                when {
                    loading -> Text(
                        text = "Loading decks…",
                        color = FoundryColors.OnSurfaceVariant,
                        fontSize = 18.sp,
                    )
                    error != null -> Text(
                        text = error!!,
                        color = Color(0xFFFF6666),
                        fontSize = 16.sp,
                    )
                    decks.isEmpty() -> Text(
                        text = "No decks yet. Press \"+ New Deck\" to create one.",
                        color = FoundryColors.OnSurfaceVariant,
                        fontSize = 16.sp,
                    )
                    else -> LazyVerticalGrid(
                        columns = GridCells.Adaptive(minSize = 300.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        items(decks, key = { it.id }) { deck ->
                            DeckTile(
                                deck = deck,
                                onOpen = { openDeckId = deck.id },
                                onDelete = { deckPendingDelete = deck },
                            )
                        }
                    }
                }
            }

            // ---- Create-deck overlay ---------------------------------------
            if (showCreate) {
                CreateDeckOverlay(
                    name = newDeckName,
                    onNameChange = { newDeckName = it },
                    creating = creating,
                    onDismiss = {
                        if (!creating) showCreate = false
                    },
                    onSubmit = submit@{
                        val trimmed = newDeckName.trim()
                        if (trimmed.isEmpty() || creating) return@submit
                        creating = true
                        scope.launch {
                            val result = withContext(Dispatchers.IO) {
                                runCatching {
                                    ApiClientHolder.get(context).createDeck(trimmed)
                                }
                            }
                            creating = false
                            result.onSuccess { newId ->
                                showCreate = false
                                newDeckName = ""
                                // Refresh list so the new deck shows up when
                                // the user backs out of the drill-down.
                                reloadTick += 1
                                openDeckId = newId
                            }.onFailure { e ->
                                error = e.message ?: "Create failed"
                            }
                        }
                    },
                )
            }

            // ---- Delete confirmation ---------------------------------------
            deckPendingDelete?.let { deck ->
                ConfirmOverlay(
                    title = "Delete \"${deck.name}\"?",
                    message = "This removes the deck and its entries. Cannot be undone.",
                    confirmLabel = "Delete",
                    onConfirm = {
                        deckPendingDelete = null
                        scope.launch {
                            val result = withContext(Dispatchers.IO) {
                                runCatching {
                                    ApiClientHolder.get(context).deleteDeck(deck.id)
                                }
                            }
                            result.onSuccess { reloadTick += 1 }
                                .onFailure { error = it.message ?: "Delete failed" }
                        }
                    },
                    onCancel = { deckPendingDelete = null },
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Header button — always focusable; the first one auto-claims focus on cold
// start via firstFocus().
// ---------------------------------------------------------------------------
@Composable
internal fun HeaderButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var focused by remember { mutableStateOf(false) }
    Box(
        modifier = modifier
            .height(44.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(if (focused) FoundryColors.Orange else FoundryColors.SurfaceVariant)
            .border(
                width = 2.dp,
                color = if (focused) FoundryColors.OrangeBright else FoundryColors.Border,
                shape = RoundedCornerShape(22.dp),
            )
            .padding(horizontal = 20.dp)
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
            fontSize = 16.sp,
        )
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun DeckTile(
    deck: Deck,
    onOpen: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .height(160.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(FoundryColors.SurfaceVariant)
            .padding(16.dp),
    ) {
        Text(
            text = deck.name,
            color = FoundryColors.OnSurface,
            fontSize = 22.sp,
            maxLines = 1,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = "${deck.entries.size} ${if (deck.entries.size == 1) "entry" else "entries"}",
            color = FoundryColors.OnSurfaceVariant,
            fontSize = 14.sp,
        )
        Spacer(Modifier.weight(1f))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DeckAction(label = "Open", onClick = onOpen)
            DeckAction(label = "Delete", onClick = onDelete, destructive = true)
        }
    }
}

@Composable
private fun DeckAction(
    label: String,
    onClick: () -> Unit,
    destructive: Boolean = false,
) {
    var focused by remember { mutableStateOf(false) }
    val focusedBg = if (destructive) Color(0xFFD03030) else FoundryColors.Orange
    Box(
        modifier = Modifier
            .height(36.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(if (focused) focusedBg else FoundryColors.Surface)
            .border(
                width = 2.dp,
                color = if (focused) focusedBg else FoundryColors.Border,
                shape = RoundedCornerShape(18.dp),
            )
            .padding(horizontal = 16.dp)
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
            fontSize = 14.sp,
        )
    }
}

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

@Composable
private fun CreateDeckOverlay(
    name: String,
    onNameChange: (String) -> Unit,
    creating: Boolean,
    onDismiss: () -> Unit,
    onSubmit: () -> Unit,
) {
    val field = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { field.requestFocus() } }

    KeyboardHandler(onBack = onDismiss) {
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
                    text = "New deck",
                    color = FoundryColors.OnBackground,
                    fontSize = 22.sp,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = name,
                    onValueChange = onNameChange,
                    singleLine = true,
                    textStyle = TextStyle(color = FoundryColors.OnSurface, fontSize = 18.sp),
                    placeholder = {
                        androidx.compose.material3.Text(
                            "Deck name",
                            color = FoundryColors.OnSurfaceVariant,
                        )
                    },
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { onSubmit() }),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = FoundryColors.Orange,
                        unfocusedBorderColor = FoundryColors.Border,
                        cursorColor = FoundryColors.Orange,
                    ),
                    modifier = Modifier.fillMaxWidth().focusRequester(field),
                )
                Spacer(Modifier.height(16.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    HeaderButton(
                        label = if (creating) "Creating…" else "Create",
                        onClick = onSubmit,
                    )
                    HeaderButton(label = "Cancel", onClick = onDismiss)
                }
            }
        }
    }
}

@Composable
private fun ConfirmOverlay(
    title: String,
    message: String,
    confirmLabel: String,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
) {
    val cancelFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { cancelFocus.requestFocus() } }

    KeyboardHandler(onBack = onCancel) {
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
                Text(title, color = FoundryColors.OnBackground, fontSize = 20.sp)
                Spacer(Modifier.height(8.dp))
                Text(message, color = FoundryColors.OnSurfaceVariant, fontSize = 14.sp)
                Spacer(Modifier.height(16.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    HeaderButton(
                        label = "Cancel",
                        onClick = onCancel,
                        modifier = Modifier.focusRequester(cancelFocus),
                    )
                    HeaderButton(label = confirmLabel, onClick = onConfirm)
                }
            }
        }
    }
}
