package com.foundry.iptv.ui.series

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text
import com.foundry.iptv.core.SeriesItem
import com.foundry.iptv.ui.common.EmptyLibraryState
import com.foundry.iptv.ui.common.LibraryStore
import com.foundry.iptv.ui.theme.FoundryColors

/**
 * Series *library* — only shows the user has watched before. No catalog
 * browse, no category rail. Sourced from `iptv_watch_history` via
 * [LibraryStore.getSeries]. Tapping a tile drops into [SeriesDetailScreen]
 * via internal state.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SeriesScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var items by remember { mutableStateOf<List<SeriesItem>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var errorText by remember { mutableStateOf<String?>(null) }
    var openId by remember { mutableStateOf<Long?>(null) }

    LaunchedEffect(Unit) {
        runCatching { LibraryStore.getSeries(context) }
            .onSuccess {
                items = it
                loading = false
            }
            .onFailure { e ->
                errorText = e.message ?: "Failed to load series library"
                loading = false
            }
    }

    val active = openId
    if (active != null) {
        SeriesDetailScreen(
            seriesId = active,
            onBack = { openId = null },
            modifier = modifier,
        )
        return
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(FoundryColors.Background),
    ) {
        when {
            loading -> CenterText("Loading…", FoundryColors.OnSurfaceVariant)
            errorText != null -> CenterText(errorText!!, Color(0xFFFF6666))
            items.isEmpty() -> EmptyLibraryState()
            else -> LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 160.dp),
                contentPadding = PaddingValues(24.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                items(items, key = { it.seriesId }) { series ->
                    LibrarySeriesTile(series = series, onClick = { openId = series.seriesId })
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun CenterText(text: String, color: Color) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(text = text, color = color, fontSize = 20.sp)
    }
}

/**
 * 1:1 port of the web `MediaGrid.PosterCard`
 * (`src/components/MediaGrid.tsx:19-70`). See LibraryVodTile for details.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
internal fun LibrarySeriesTile(series: SeriesItem, onClick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val borderColor = if (focused) FoundryColors.Orange else FoundryColors.Border
    val borderWidth = if (focused) 2.dp else 1.dp
    val bgColor = if (focused) FoundryColors.SurfaceVariant else FoundryColors.Surface

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(bgColor)
            .border(borderWidth, borderColor, RoundedCornerShape(16.dp))
            .onFocusChanged { focused = it.isFocused }
            .focusable()
            .clickable { onClick() },
    ) {
        SeriesPoster(
            title = series.name,
            url = series.cover,
            modifier = Modifier.fillMaxWidth().aspectRatio(2f / 3f),
        )
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = series.name,
                color = FoundryColors.OnSurface,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
