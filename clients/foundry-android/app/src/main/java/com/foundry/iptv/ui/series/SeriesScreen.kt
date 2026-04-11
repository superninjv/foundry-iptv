package com.foundry.iptv.ui.series

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text
import com.foundry.iptv.core.SeriesItem
import com.foundry.iptv.ui.common.ApiClientHolder
import com.foundry.iptv.ui.theme.FoundryColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Top-level series browsing screen. Loads the full series catalog via the
 * FFI on first composition and renders a virtualized poster grid. Tapping
 * a tile drops into [SeriesDetailScreen] via internal state — no NavHost
 * destination is added, mirroring the pattern in [VodScreen].
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
        val result = withContext(Dispatchers.IO) {
            runCatching { ApiClientHolder.get(context).listSeries(null) }
        }
        result.onSuccess {
            items = it
            loading = false
        }.onFailure { e ->
            errorText = e.message ?: "Failed to load series catalog"
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
            loading -> CenterText("Loading series…", Color(0xFFAAAAAA))
            errorText != null -> CenterText(errorText!!, Color(0xFFFF6666))
            items.isEmpty() -> CenterText("No series available.", Color(0xFFAAAAAA))
            else -> LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 160.dp),
                modifier = Modifier.fillMaxSize().padding(8.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(items, key = { it.seriesId }) { series ->
                    SeriesTile(series = series, onClick = { openId = series.seriesId })
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

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun SeriesTile(series: SeriesItem, onClick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(if (focused) FoundryColors.SurfaceBright else FoundryColors.Surface)
            .onFocusChanged { focused = it.isFocused }
            .focusable()
            .clickable { onClick() }
            .padding(8.dp),
    ) {
        SeriesPoster(
            title = series.name,
            url = series.cover,
            modifier = Modifier.fillMaxWidth().aspectRatio(2f / 3f),
        )
        Text(
            text = series.name,
            color = FoundryColors.OnSurface,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(top = 6.dp),
            maxLines = 2,
        )
    }
}
