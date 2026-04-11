package com.foundry.iptv.ui.vod

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
 * Poster artwork for a VOD movie or a series cover. Loads directly via
 * [FoundryImageLoader] (Coil 3) — deliberately does NOT live under
 * `ui/image/` because the `ChannelLogo` helper is channel-typed and going
 * through the server image-proxy is optional for VOD covers (Xtream serves
 * them as flat http URLs).
 *
 * Placeholder: flat rounded gray rectangle.
 * Error fallback: same rectangle with the title's initials.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
internal fun PosterArt(
    title: String,
    url: String?,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val shape = RoundedCornerShape(8.dp)
    val placeholder = Color(0xFF222222)

    Box(
        modifier = modifier
            .clip(shape)
            .background(placeholder),
        contentAlignment = Alignment.Center,
    ) {
        if (url.isNullOrBlank()) {
            InitialsFallback(title)
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
                loading = { /* keep gray placeholder */ },
                error = { InitialsFallback(title) },
                success = { SubcomposeAsyncImageContent() },
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun InitialsFallback(title: String) {
    val initials = remember(title) { initialsOf(title) }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = initials,
            color = Color(0xFFE0E0E0),
            fontSize = 22.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

private fun initialsOf(name: String): String {
    val trimmed = name.trim()
    if (trimmed.isEmpty()) return "?"
    val parts = trimmed.split(Regex("\\s+"))
    return when {
        parts.size == 1 -> parts[0].take(2).uppercase()
        else -> (parts[0].take(1) + parts[1].take(1)).uppercase()
    }
}
