package com.foundry.iptv.ui.series

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text
import coil3.compose.SubcomposeAsyncImage
import coil3.compose.SubcomposeAsyncImageContent
import coil3.request.ImageRequest
import coil3.request.crossfade
import com.foundry.iptv.ui.image.FoundryImageLoader

/**
 * Series / episode artwork loader. Keeps a parallel implementation to
 * `ui/vod/PosterArt` so the two packages stay independent — neither
 * depends on the other, matching the file-ownership boundaries in the
 * parallelization plan.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
internal fun SeriesPoster(
    title: String,
    url: String?,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val shape = RoundedCornerShape(8.dp)
    Box(
        modifier = modifier
            .clip(shape)
            .background(Color(0xFF222222)),
        contentAlignment = Alignment.Center,
    ) {
        if (url.isNullOrBlank()) {
            Fallback(title)
        } else {
            val request = remember(url) {
                ImageRequest.Builder(context)
                    .data(url)
                    .crossfade(true)
                    .build()
            }
            SubcomposeAsyncImage(
                model = request,
                imageLoader = FoundryImageLoader.get(context),
                contentDescription = title,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
                loading = { },
                error = { Fallback(title) },
                success = { SubcomposeAsyncImageContent() },
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun Fallback(title: String) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = initialsOf(title),
            color = Color(0xFFE0E0E0),
            fontSize = 22.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

private fun initialsOf(name: String): String {
    val t = name.trim()
    if (t.isEmpty()) return "?"
    val parts = t.split(Regex("\\s+"))
    return when {
        parts.size == 1 -> parts[0].take(2).uppercase()
        else -> (parts[0].take(1) + parts[1].take(1)).uppercase()
    }
}
