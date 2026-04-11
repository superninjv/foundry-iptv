package com.foundry.iptv.ui.hub

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.foundry.iptv.ui.focus.firstFocus
import com.foundry.iptv.ui.focus.rememberFirstFocus
import com.foundry.iptv.ui.theme.FoundryColors

/**
 * Top-level shell for the Foundry IPTV TV client. A single Column with a
 * horizontal tab rail at the top and a content pane below.
 *
 * Focus model: **entirely driven by Compose's default 2D focus traversal.**
 * Every focusable in the rail and in the content pane participates in the
 * same focus graph. D-pad Down from a rail tab walks geometrically into the
 * nearest focusable below (a card, a button, a grid item). D-pad Up from
 * content walks back into the rail and usually lands on whichever tab was
 * geometrically closest — which, for content that was opened from tab N,
 * is tab N.
 *
 * This file used to fight the framework with a `focusRequester` +
 * `focusRestorer()` + `focusGroup()` stack on the content Box, plus a retry
 * LaunchedEffect that kept calling `contentRequester.requestFocus()` every
 * 60ms. None of it worked — the Box wasn't `.focusable()`, so requestFocus
 * was a silent no-op. The net effect was Down doing nothing AND Up always
 * returning to the Live tab (because the Up handler hardcoded
 * `railFirstTab.requestFocus()`). Deleting that whole mess fixes both bugs.
 *
 * Wave agents replacing a placeholder should provide their screen via
 * [sectionContent], not by touching this file directly.
 */
@Composable
fun FoundryHub(
    sectionContent: @Composable (HubSection, Modifier) -> Unit = { section, modifier ->
        ComingSoonScreen(sectionName = section.label, modifier = modifier)
    },
) {
    var selected by rememberSaveable { mutableStateOf(HubSection.Live) }

    val railFirstTab = rememberFirstFocus()

    // Cold start: claim focus on the rail's first tab. firstFocus() itself
    // no longer auto-claims (that stole focus from the rail mid-scrub), so
    // the cold-start claim has to be explicit.
    LaunchedEffect(Unit) {
        runCatching { railFirstTab.requestFocus() }
    }

    // Back falls through to system default (exit). If the user wants
    // "content → rail → exit" back-stack behavior, the content screens
    // should handle it themselves via their own BackHandler.
    BackHandler(enabled = false) { }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(FoundryColors.Background),
    ) {
        TabRail(
            selected = selected,
            onSelect = { selected = it },
            firstTabRequester = railFirstTab,
            modifier = Modifier
                .fillMaxWidth()
                .firstFocus(railFirstTab),
        )

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(24.dp),
        ) {
            sectionContent(selected, Modifier.fillMaxSize())
        }
    }
}
