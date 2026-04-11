package com.foundry.iptv.ui.image

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text
import coil3.compose.SubcomposeAsyncImage
import coil3.compose.SubcomposeAsyncImageContent
import coil3.request.ImageRequest
import coil3.request.crossfade
import com.foundry.iptv.core.Channel
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/**
 * Displays a channel logo fetched via the server's image proxy endpoint
 * (`/api/img-proxy?u=<logo>&w=<size>`). The proxy handles upstream CORS,
 * resizing, and caching so the client only ever talks to the LAN.
 *
 * Callers may pass [baseUrl] explicitly, or leave it null to pull the URL
 * from the same `foundry_prefs` SharedPreferences where pairing stored it
 * (see [com.foundry.iptv.ui.PairingScreen.persistCredentials]).
 *
 * Placeholder: flat rounded gray rectangle.
 * Error fallback: same rounded rectangle with channel initials centered.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun ChannelLogo(
    channel: Channel,
    sizeDp: Dp,
    modifier: Modifier = Modifier,
    baseUrl: String? = null,
) {
    val context = LocalContext.current
    val resolvedBase = remember(baseUrl) { baseUrl ?: readServerUrl(context) }
    val sizePx = with(androidx.compose.ui.platform.LocalDensity.current) { sizeDp.roundToPx() }

    val url: String? = remember(channel.logoUrl, resolvedBase, sizePx) {
        val raw = channel.logoUrl?.trim().orEmpty()
        if (raw.isEmpty() || resolvedBase.isNullOrBlank()) {
            null
        } else {
            val encoded = URLEncoder.encode(raw, StandardCharsets.UTF_8.name())
            "${resolvedBase.trimEnd('/')}/api/img-proxy?u=$encoded&w=$sizePx"
        }
    }

    val shape = RoundedCornerShape(8.dp)
    val placeholderColor = Color(0xFF222222)

    Box(
        modifier = modifier
            .size(sizeDp)
            .clip(shape)
            .background(placeholderColor),
        contentAlignment = Alignment.Center,
    ) {
        if (url == null) {
            InitialsFallback(channel.name)
        } else {
            val request = ImageRequest.Builder(context)
                .data(url)
                .crossfade(true)
                .build()
            SubcomposeAsyncImage(
                model = request,
                imageLoader = FoundryImageLoader.get(context),
                contentDescription = channel.name,
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize(),
                loading = { /* keep the gray placeholder visible */ },
                error = { InitialsFallback(channel.name) },
                success = { SubcomposeAsyncImageContent() },
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun InitialsFallback(name: String) {
    val initials = remember(name) { initialsOf(name) }
    Text(
        text = initials,
        color = Color(0xFFE0E0E0),
        fontSize = 18.sp,
        fontWeight = FontWeight.SemiBold,
    )
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

private fun readServerUrl(context: Context): String? {
    return context
        .getSharedPreferences("foundry_prefs", Context.MODE_PRIVATE)
        .getString("server_url", null)
}
