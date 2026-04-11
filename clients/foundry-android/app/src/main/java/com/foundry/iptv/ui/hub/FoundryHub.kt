package com.foundry.iptv.ui.hub

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.unit.dp
import com.foundry.iptv.ui.focus.firstFocus
import com.foundry.iptv.ui.focus.rememberFirstFocus
import com.foundry.iptv.ui.theme.FoundryColors

/**
 * Top-level shell for the Foundry IPTV TV client. Replaces the old 3-screen
 * NavHost with a single surface containing a horizontal tab rail and a
 * content pane.
 *
 * Focus model:
 *   - On cold start the rail grabs focus with [HubSection.Live] selected.
 *   - D-pad Left / Right walks between tabs.
 *   - D-pad Down on the rail moves focus into the content pane.
 *   - D-pad Up from the content pane returns focus to the rail.
 *   - Back from content returns to the rail. Back from the rail falls
 *     through to the system (exit the app).
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
    // True when focus lives in the content pane; false when it lives on the rail.
    var contentFocused by remember { mutableStateOf(false) }

    val railFirstTab = rememberFirstFocus()
    val contentRequester = remember { FocusRequester() }

    // Cold start: the rail's first tab auto-requests focus via firstFocus().
    // (No extra call needed here — firstFocus() is wired in TabRail below.)

    // Intercept Back: if we're in the content pane, pop back to the rail
    // instead of exiting. If we're already on the rail, BackHandler disables
    // itself so the system default (exit) runs.
    BackHandler(enabled = contentFocused) {
        contentFocused = false
        runCatching { railFirstTab.requestFocus() }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(FoundryColors.Background),
    ) {
        TabRail(
            selected = selected,
            onSelect = { selected = it },
            onFocusContent = {
                contentFocused = true
                runCatching { contentRequester.requestFocus() }
            },
            firstTabRequester = railFirstTab,
            modifier = Modifier
                .fillMaxWidth()
                // Wire the first-focus LaunchedEffect onto the rail so the
                // app always lands here at cold start.
                .firstFocus(railFirstTab),
        )

        // Content pane. We wrap the wave agent's composable in a focusable
        // Box so we can (a) give D-pad Up a handle to bounce back to the
        // rail and (b) expose a FocusRequester for the rail's Down key.
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(24.dp)
                .focusRequester(contentRequester)
                .focusable()
                .onPreviewKeyEvent { event ->
                    if (event.type == KeyEventType.KeyDown && event.key == Key.DirectionUp) {
                        contentFocused = false
                        runCatching { railFirstTab.requestFocus() }
                        true
                    } else {
                        false
                    }
                },
        ) {
            sectionContent(selected, Modifier.fillMaxSize())
        }
    }
}
