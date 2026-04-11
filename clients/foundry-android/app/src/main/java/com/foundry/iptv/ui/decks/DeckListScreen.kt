package com.foundry.iptv.ui.decks

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import com.foundry.iptv.core.Deck
import com.foundry.iptv.ui.focus.KeyboardHandler
import com.foundry.iptv.ui.focus.firstFocus
import com.foundry.iptv.ui.focus.rememberFirstFocus
import com.foundry.iptv.ui.theme.FoundryColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Top-level entry point for the Decks section.
 *
 * Shows a grid of the user's decks. Picking a deck flips this screen into the
 * drill-down [DeckScreen]. The hub wires this composable directly into the
 * rail; [onBack] is unused at this level (hub handles rail navigation) but is
 * accepted for symmetry with other section screens.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun DeckListScreen(
    modifier: Modifier = Modifier,
    onBack: () -> Unit = {},
) {
    val context = LocalContext.current
    var decks by remember { mutableStateOf<List<Deck>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var openDeckId by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        val result = withContext(Dispatchers.IO) {
            // `/api/decks` is not in middleware's APP_PREFIXES, so the Rust
            // client's Bearer request is rejected with 401. Route around
            // the server bug with a local OkHttp call — see DeckApiShim.
            runCatching { DeckApiShim.listDecks(context) }
        }
        result.onSuccess {
            decks = it
            loading = false
        }.onFailure {
            error = it.message ?: "Failed to load decks"
            loading = false
        }
    }

    openDeckId?.let { id ->
        DeckScreen(deckId = id, onBack = { openDeckId = null })
        return
    }

    Box(modifier = modifier.fillMaxSize().padding(24.dp)) {
        when {
            loading -> Text(
                text = "Loading decks…",
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

            decks.isEmpty() -> Text(
                text = "No decks yet. Create one from the web admin.",
                color = FoundryColors.OnSurfaceVariant,
                fontSize = 18.sp,
                modifier = Modifier.align(Alignment.Center),
            )

            else -> {
                val firstTile = rememberFirstFocus()
                KeyboardHandler(onBack = onBack) {
                    Column(modifier = Modifier.fillMaxSize()) {
                        Text(
                            text = "Your Decks",
                            color = FoundryColors.OnBackground,
                            fontSize = 28.sp,
                            modifier = Modifier.padding(bottom = 16.dp),
                        )
                        LazyVerticalGrid(
                            columns = GridCells.Adaptive(minSize = 280.dp),
                            verticalArrangement = Arrangement.spacedBy(16.dp),
                            horizontalArrangement = Arrangement.spacedBy(16.dp),
                            modifier = Modifier.fillMaxSize(),
                        ) {
                            items(decks, key = { it.id }) { deck ->
                                val isFirst = deck == decks.first()
                                DeckTile(
                                    deck = deck,
                                    onClick = { openDeckId = deck.id },
                                    modifier = if (isFirst) {
                                        Modifier.firstFocus(firstTile)
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
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun DeckTile(
    deck: Deck,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .height(140.dp)
            .clip(RoundedCornerShape(12.dp)),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = FoundryColors.SurfaceVariant,
            focusedContainerColor = FoundryColors.OrangeDim,
        ),
        onClick = onClick,
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = deck.name,
                color = FoundryColors.OnSurface,
                fontSize = 24.sp,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "${deck.entries.size} entries",
                color = FoundryColors.OnSurfaceVariant,
                fontSize = 15.sp,
            )
        }
    }
}

// ApiClient wiring moved to ui/common/ApiClientHolder.kt (W5-B).
