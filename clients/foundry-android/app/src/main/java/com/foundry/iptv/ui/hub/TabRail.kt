package com.foundry.iptv.ui.hub

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.unit.dp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.foundry.iptv.ui.theme.FoundryColors

/**
 * Horizontal rail of 8 tabs sitting at the top of the hub. Renders each
 * [HubSection] as a pill-shaped button; the selected tab shows the Foundry
 * orange accent, the focused tab gets a brighter border.
 *
 * Focus & input model:
 *   - D-pad Left / Right walks between tabs (built-in focus traversal).
 *   - D-pad Down is intercepted and invokes [onFocusContent] so the parent
 *     hub can move focus into the content pane below.
 *   - Hitting OK on a tab is handled by the parent selecting it; we also
 *     call [onSelect] whenever focus lands on a tab so the content pane
 *     updates as the user scrubs across the rail.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun TabRail(
    selected: HubSection,
    onSelect: (HubSection) -> Unit,
    onFocusContent: () -> Unit,
    modifier: Modifier = Modifier,
    firstTabRequester: FocusRequester? = null,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(FoundryColors.Surface)
            .padding(horizontal = 24.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        HubSection.values().forEachIndexed { index, section ->
            val isFirst = index == 0
            TabChip(
                section = section,
                isSelected = section == selected,
                onFocused = { onSelect(section) },
                onFocusContent = onFocusContent,
                modifier = if (isFirst && firstTabRequester != null) {
                    Modifier.focusRequester(firstTabRequester)
                } else {
                    Modifier
                },
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun TabChip(
    section: HubSection,
    isSelected: Boolean,
    onFocused: () -> Unit,
    onFocusContent: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val interaction = remember { MutableInteractionSource() }
    val isFocused by interaction.collectIsFocusedAsState()

    // When focus lands on this chip, mark it as the selected section so the
    // content pane follows the rail scrubber in real time.
    if (isFocused) {
        onFocused()
    }

    val background = when {
        isFocused -> FoundryColors.Orange
        isSelected -> FoundryColors.OrangeDim
        else -> FoundryColors.SurfaceVariant
    }
    val textColor = when {
        isFocused -> FoundryColors.OnPrimary
        isSelected -> FoundryColors.OnBackground
        else -> FoundryColors.OnSurfaceVariant
    }
    val borderColor = if (isFocused) FoundryColors.OrangeBright else FoundryColors.Border

    Row(
        modifier = modifier
            .clip(RoundedCornerShape(24.dp))
            .background(background)
            .border(2.dp, borderColor, RoundedCornerShape(24.dp))
            .padding(horizontal = 20.dp, vertical = 10.dp)
            .focusable(interactionSource = interaction)
            .onPreviewKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown && event.key == Key.DirectionDown) {
                    onFocusContent()
                    true
                } else {
                    false
                }
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = section.label,
            style = MaterialTheme.typography.titleMedium,
            color = textColor,
        )
    }
}
