package com.foundry.iptv.ui

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.focusable
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import com.foundry.iptv.core.ApiClient
import com.foundry.iptv.core.Channel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Channel list screen — shown after successful pairing.
 *
 * Loads channels from the server on mount (via [ApiClient.listChannels] on the
 * IO dispatcher) and renders them in a focus-aware [TvLazyColumn].  D-pad
 * navigation is handled automatically by the TV library.
 *
 * @param onChannelSelected Called with the HLS URL when the user selects a channel.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun ChannelListScreen(onChannelSelected: (hlsUrl: String) -> Unit) {
    val context = LocalContext.current
    var channels by remember { mutableStateOf<List<Channel>>(emptyList()) }
    var errorText by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    // First-item focus requester so D-pad lands somewhere when the list mounts.
    val firstItemFocus = remember { FocusRequester() }

    // Load channels once on mount.
    LaunchedEffect(Unit) {
        val (serverUrl, token) = readCredentials(context)
        if (serverUrl == null || token == null) {
            errorText = "No credentials stored — please re-pair."
            loading = false
            return@LaunchedEffect
        }
        val result = withContext(Dispatchers.IO) {
            runCatching {
                val client = ApiClient(serverUrl).also { it.setToken(token) }
                client.listChannels()
            }
        }
        result.onSuccess { ch ->
            channels = ch
            loading = false
        }.onFailure { e ->
            errorText = e.message ?: "Failed to load channels"
            loading = false
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0D0D0D)),
    ) {
        when {
            loading -> {
                Text(
                    text = "Loading channels…",
                    color = Color(0xFFAAAAAA),
                    fontSize = 20.sp,
                    modifier = Modifier.align(Alignment.Center),
                )
            }

            errorText != null -> {
                Text(
                    text = errorText!!,
                    color = Color(0xFFFF6666),
                    fontSize = 18.sp,
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(32.dp),
                )
            }

            else -> {
                Column {
                    // Header
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(72.dp)
                            .background(Color(0xFF111111))
                            .padding(horizontal = 24.dp),
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        Text(
                            text = "Live TV",
                            fontSize = 28.sp,
                            color = Color.White,
                        )
                    }

                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                        itemsIndexed(channels) { index, channel ->
                            ChannelRowItem(
                                channel = channel,
                                onSelect = { hlsUrl ->
                                    onChannelSelected(hlsUrl)
                                },
                                // Attach focus requester to the first item so
                                // the LaunchedEffect below can plant initial
                                // D-pad focus when channels first appear.
                                modifier = if (index == 0) {
                                    Modifier
                                        .focusRequester(firstItemFocus)
                                        .focusable()
                                } else {
                                    Modifier
                                },
                            )
                        }
                    }
                    // Request initial focus once channels are loaded. Wrapped
                    // in LaunchedEffect(channels.size) so it fires exactly
                    // when the list transitions from empty → populated.
                    LaunchedEffect(channels.size) {
                        if (channels.isNotEmpty()) {
                            try {
                                firstItemFocus.requestFocus()
                            } catch (_: IllegalStateException) {
                                // Focus target not yet attached to composition;
                                // ignore — the user can press D-pad to focus.
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun ChannelRowItem(
    channel: Channel,
    onSelect: (hlsUrl: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .height(72.dp)
            .padding(horizontal = 16.dp, vertical = 4.dp),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = Color.Transparent,
            focusedContainerColor = Color(0xFF1A6EB5),
        ),
        onClick = {
            // Start stream and navigate to player — blocking call on IO dispatcher
            // happens inside a coroutine launched by the click handler.
            val (serverUrl, token) = readCredentials(context)
            if (serverUrl != null && token != null) {
                kotlinx.coroutines.MainScope().launch {
                    val result = withContext(kotlinx.coroutines.Dispatchers.IO) {
                        runCatching {
                            val client = ApiClient(serverUrl).also { it.setToken(token) }
                            client.startStream(channel.id)
                        }
                    }
                    result.onSuccess { session ->
                        onSelect(session.hlsUrl)
                    }
                }
            }
        },
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Logo placeholder
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(Color(0xFF333333)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = channel.name.firstOrNull()?.toString() ?: "?",
                    color = Color(0xFFAAAAAA),
                    fontSize = 20.sp,
                )
            }

            Spacer(modifier = Modifier.width(16.dp))

            Column {
                Text(
                    text = channel.name,
                    fontSize = 20.sp,
                    color = Color.White,
                )
                channel.group?.let { grp ->
                    Text(
                        text = grp,
                        fontSize = 14.sp,
                        color = Color(0xFF888888),
                    )
                }
            }
        }
    }
}

private fun readCredentials(context: Context): Pair<String?, String?> {
    val prefs = context.getSharedPreferences("foundry_prefs", Context.MODE_PRIVATE)
    return Pair(
        prefs.getString("server_url", null),
        prefs.getString("device_token", null),
    )
}
