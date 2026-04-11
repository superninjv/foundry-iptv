package com.foundry.iptv.ui.common

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text
import com.foundry.iptv.ui.theme.FoundryColors

/**
 * Centered, text-only empty state shown by Library screens (Live / Guide /
 * VOD / Series) when the user has not yet watched anything of that kind.
 *
 * Deliberately minimal: no icons, no emoji, no illustrations. Jack is
 * sensitive to things looking amateurish — two lines of text in the middle
 * of the screen is the whole design.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun EmptyLibraryState(
    title: String = "Nothing here yet",
    body: String = "Press Right on the tab bar to Search for something to watch.",
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier
                .widthIn(max = 560.dp)
                .padding(horizontal = 32.dp),
        ) {
            Text(
                text = title,
                color = FoundryColors.OnSurface,
                fontSize = 28.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
            )
            Text(
                text = body,
                color = FoundryColors.OnSurfaceVariant,
                fontSize = 16.sp,
                textAlign = TextAlign.Center,
            )
        }
    }
}
