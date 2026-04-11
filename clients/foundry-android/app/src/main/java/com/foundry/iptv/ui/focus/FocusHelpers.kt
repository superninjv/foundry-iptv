package com.foundry.iptv.ui.focus

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type

/**
 * Creates and remembers a [FocusRequester] that any composable can attach via
 * [firstFocus]. Combined, they request focus exactly once on first composition.
 *
 * Usage:
 * ```
 * val first = rememberFirstFocus()
 * Column {
 *     Item(Modifier.firstFocus(first))
 * }
 * ```
 */
@Composable
fun rememberFirstFocus(): FocusRequester = remember { FocusRequester() }

/**
 * Attaches the supplied [FocusRequester] to this modifier chain and requests
 * focus the first time it enters the composition. Safe to no-op if the target
 * is already detached (wrapped in try/catch).
 */
@Composable
fun Modifier.firstFocus(requester: FocusRequester): Modifier {
    LaunchedEffect(requester) {
        runCatching { requester.requestFocus() }
    }
    return this.focusRequester(requester)
}

/**
 * Wraps [content] and intercepts the Fire TV / Android TV remote's Back, Menu,
 * and Play/Pause buttons. Any handler left null delegates to the system default
 * (which, for Back, unwinds the navigation stack).
 *
 * This is the canonical key handler for every top-level screen — wave agents
 * should use it instead of attaching `onKeyEvent` modifiers ad-hoc.
 */
@Composable
fun KeyboardHandler(
    onBack: (() -> Unit)? = null,
    onMenu: (() -> Unit)? = null,
    onPlay: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    if (onBack != null) {
        BackHandler(onBack = onBack)
    }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .onPreviewKeyEvent { event -> handleKey(event, onMenu, onPlay) },
    ) {
        content()
    }
}

private fun handleKey(
    event: KeyEvent,
    onMenu: (() -> Unit)?,
    onPlay: (() -> Unit)?,
): Boolean {
    if (event.type != KeyEventType.KeyDown) return false
    return when (event.key) {
        Key.Menu -> {
            onMenu?.invoke()
            onMenu != null
        }
        Key.MediaPlay, Key.MediaPlayPause, Key.MediaPause -> {
            onPlay?.invoke()
            onPlay != null
        }
        else -> false
    }
}
