package com.foundry.iptv.ui.vod

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
import com.foundry.iptv.core.VodItem
import com.foundry.iptv.ui.common.EmptyLibraryState
import com.foundry.iptv.ui.common.LibraryStore
import com.foundry.iptv.ui.theme.FoundryColors

/**
 * VOD *library* — only movies the user has watched before.
 *
 * Per Jack's mandate, there is no catalog browse and no category rail; the
 * list is entirely sourced from `iptv_watch_history` via
 * [LibraryStore.getVod]. Tapping a tile drops into [VodDetailScreen] via
 * internal state, identical to before.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun VodScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var items by remember { mutableStateOf<List<VodItem>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var errorText by remember { mutableStateOf<String?>(null) }
    var openVodId by remember { mutableStateOf<Long?>(null) }

    LaunchedEffect(Unit) {
        runCatching { LibraryStore.getVod(context) }
            .onSuccess {
                items = it
                loading = false
            }
            .onFailure { e ->
                errorText = e.message ?: "Failed to load VOD library"
                loading = false
            }
    }

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
            loading -> CenterText("Loading…", FoundryColors.OnSurfaceVariant)
            errorText != null -> CenterText(errorText!!, Color(0xFFFF6666))
            items.isEmpty() -> EmptyLibraryState()
            // Matches web `MediaGrid`: `grid gap-3
            // gridTemplateColumns: repeat(auto-fill, minmax(160px, 1fr))`
            // `src/components/MediaGrid.tsx:88-93`.
            else -> LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 160.dp),
                contentPadding = PaddingValues(24.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                items(items, key = { it.streamId }) { vod ->
                    LibraryVodTile(vod = vod, onClick = { openVodId = vod.streamId })
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
 * 1:1 port of the web `MediaGrid` `PosterCard`:
 *   `<Link className="group flex flex-col overflow-hidden rounded-xl border"
 *        style={{ backgroundColor: 'var(--bg-raised)',
 *                 borderColor: 'var(--border)' }}>
 *      <div aspectRatio 2/3 backgroundColor var(--bg)>...</div>
 *      <div className="flex flex-col gap-1 p-3">
 *        <p className="line-clamp-2 text-sm font-semibold leading-tight">...</p>
 *      </div>
 *    </Link>` — `src/components/MediaGrid.tsx:19-70`.
 *
 * Focus: 2dp accent border + subtle background lift. No scale, no shadow —
 * matches the web's global `*:focus-visible` outline (`globals.css:28`).
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
internal fun LibraryVodTile(vod: VodItem, onClick: () -> Unit) {
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
        PosterArt(
            title = vod.name,
            url = vod.streamIcon,
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(2f / 3f),
        )
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            // line-clamp-2 + text-sm font-semibold leading-tight
            Text(
                text = vod.name,
                color = FoundryColors.OnSurface,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
