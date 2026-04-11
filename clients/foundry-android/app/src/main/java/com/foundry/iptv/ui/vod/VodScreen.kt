package com.foundry.iptv.ui.vod

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
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
import com.foundry.iptv.core.VodItem
import com.foundry.iptv.ui.common.ApiClientHolder
import com.foundry.iptv.ui.theme.FoundryColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Top-level VOD browsing screen. Renders a category rail over a poster grid.
 *
 * This composable is the public entry point consumed by the hub — it owns
 * an internal "detail" navigation state so tapping a poster drops into
 * [VodDetailScreen] without needing a separate NavHost destination.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun VodScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var allItems by remember { mutableStateOf<List<VodItem>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var errorText by remember { mutableStateOf<String?>(null) }
    var selectedCategory by remember { mutableStateOf<String?>(null) }
    var openVodId by remember { mutableStateOf<Long?>(null) }

    // Load the full VOD catalog once. Category filtering is applied client-side
    // from the `categoryId` field — cheap because the list is a few thousand
    // rows max and the FFI returns typed data, not raw JSON.
    LaunchedEffect(Unit) {
        val result = withContext(Dispatchers.IO) {
            runCatching { ApiClientHolder.get(context).listVod(null) }
        }
        result.onSuccess {
            allItems = it
            loading = false
        }.onFailure { e ->
            errorText = e.message ?: "Failed to load VOD catalog"
            loading = false
        }
    }

    val categories: List<String?> = remember(allItems) {
        val ids = allItems.mapNotNull { it.categoryId }.toSet().sorted()
        listOf<String?>(null) + ids
    }

    val filtered = remember(allItems, selectedCategory) {
        if (selectedCategory == null) allItems
        else allItems.filter { it.categoryId == selectedCategory }
    }

    // Detail screen: internal navigation, Back returns to the grid.
    val activeVodId = openVodId
    if (activeVodId != null) {
        VodDetailScreen(
            vodId = activeVodId,
            onBack = { openVodId = null },
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
            loading -> CenterText("Loading movies…", Color(0xFFAAAAAA))
            errorText != null -> CenterText(errorText!!, Color(0xFFFF6666))
            allItems.isEmpty() -> CenterText("No movies available.", Color(0xFFAAAAAA))
            else -> Column(modifier = Modifier.fillMaxSize()) {
                CategoryRail(
                    categories = categories,
                    selected = selectedCategory,
                    onSelect = { selectedCategory = it },
                )
                VodGrid(
                    items = filtered,
                    onSelect = { openVodId = it.streamId },
                )
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
private fun CategoryRail(
    categories: List<String?>,
    selected: String?,
    onSelect: (String?) -> Unit,
) {
    LazyRow(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .padding(horizontal = 8.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(categories) { cat ->
            val label = cat ?: "All"
            val isSelected = cat == selected
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(
                        if (isSelected) FoundryColors.Orange else FoundryColors.SurfaceVariant,
                    )
                    .focusable()
                    .clickable { onSelect(cat) }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = label,
                    color = if (isSelected) FoundryColors.OnPrimary else FoundryColors.OnSurface,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
            // Tapping (OK) triggers the selection via a transparent overlay.
            // The focusable Box above owns focus; we use a side-effect lambda
            // through a clickable modifier so D-pad OK flips the filter.
        }
    }
    // Note: TV Compose treats the focused item as implicitly "clickable" via
    // OK key on standard Material buttons; we use raw Boxes here for minimal
    // dependency surface, and rely on the grid focus to drive browsing. A
    // dedicated filter chip row can be upgraded in a polish pass.
    if (categories.isNotEmpty() && selected == null && categories.first() == null) {
        // Kick initial selection so we show something useful.
        LaunchedEffect(Unit) { onSelect(null) }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun VodGrid(
    items: List<VodItem>,
    onSelect: (VodItem) -> Unit,
) {
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 160.dp),
        modifier = Modifier.fillMaxSize().padding(8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(items, key = { it.streamId }) { vod ->
            VodTile(vod = vod, onClick = { onSelect(vod) })
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
internal fun VodTile(vod: VodItem, onClick: () -> Unit) {
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
        PosterArt(
            title = vod.name,
            url = vod.streamIcon,
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(2f / 3f),
        )
        Text(
            text = vod.name,
            color = FoundryColors.OnSurface,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(top = 6.dp),
            maxLines = 2,
        )
    }
}
