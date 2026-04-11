package com.foundry.iptv.ui.vod

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import com.foundry.iptv.core.ApiClient
import com.foundry.iptv.ui.theme.FoundryColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Lightweight parsed representation of an Xtream `get_vod_info` response,
 * pulled from the raw JSON string returned by `ApiClient.getVodDetail`.
 *
 * We deliberately avoid `kotlinx.serialization` to keep build deps minimal —
 * `org.json.JSONObject` ships with the Android platform and the response
 * shape is small enough that a manual extraction is clearer than generated
 * glue.
 */
internal data class VodDetail(
    val streamId: Long,
    val title: String,
    val plot: String?,
    val cover: String?,
    val genre: String?,
    val rating: String?,
    val releaseDate: String?,
    val duration: String?,
    val director: String?,
    val cast: String?,
    val containerExtension: String?,
) {
    companion object {
        fun fromJson(json: String): VodDetail {
            val root = JSONObject(json)
            val info = root.optJSONObject("info") ?: JSONObject()
            val movie = root.optJSONObject("movie_data") ?: JSONObject()

            return VodDetail(
                streamId = movie.optLong("stream_id", 0L),
                title = info.optString("name").ifBlank { movie.optString("name") },
                plot = info.optString("plot").takeIf { it.isNotBlank() },
                cover = info.optString("movie_image").takeIf { it.isNotBlank() },
                genre = info.optString("genre").takeIf { it.isNotBlank() },
                rating = info.optString("rating").takeIf { it.isNotBlank() },
                releaseDate = info.optString("releasedate").takeIf { it.isNotBlank() },
                duration = info.optString("duration").takeIf { it.isNotBlank() },
                director = info.optString("director").takeIf { it.isNotBlank() },
                cast = info.optString("cast").takeIf { it.isNotBlank() },
                containerExtension = movie.optString("container_extension")
                    .takeIf { it.isNotBlank() },
            )
        }
    }
}

/**
 * Detail view for a single VOD entry. Shows the hero poster, plot, metadata
 * and a Play button.
 *
 * **Playback is currently stubbed.** `PlayerHost` in this codebase hard-wires
 * `HlsMediaSource`, and Xtream VOD is almost always delivered as a progressive
 * MP4/MKV — the two don't line up without a broader `MediaSourceFactory`
 * change in W1-D or a follow-up wave. The Play button logs the intended URL
 * for now; upgrading it is tracked alongside the W1-D / Wave-4 polish pass.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun VodDetailScreen(
    vodId: Long,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    BackHandler(onBack = onBack)

    val context = LocalContext.current
    var detail by remember(vodId) { mutableStateOf<VodDetail?>(null) }
    var loading by remember(vodId) { mutableStateOf(true) }
    var errorText by remember(vodId) { mutableStateOf<String?>(null) }

    LaunchedEffect(vodId) {
        val creds = readCredentials(context)
        if (creds == null) {
            errorText = "No credentials — please re-pair."
            loading = false
            return@LaunchedEffect
        }
        val result = withContext(Dispatchers.IO) {
            runCatching {
                val client = ApiClient(creds.serverUrl).also { it.setToken(creds.token) }
                val raw = client.getVodDetail(vodId.toString())
                VodDetail.fromJson(raw)
            }
        }
        result.onSuccess {
            detail = it
            loading = false
        }.onFailure { e ->
            errorText = e.message ?: "Failed to load movie details"
            loading = false
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(FoundryColors.Background),
    ) {
        when {
            loading -> CenterMessage("Loading movie…", Color(0xFFAAAAAA))
            errorText != null -> CenterMessage(errorText!!, Color(0xFFFF6666))
            detail != null -> VodDetailBody(detail!!)
            else -> CenterMessage("Not found.", Color(0xFFAAAAAA))
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun CenterMessage(text: String, color: Color) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(text = text, color = color, fontSize = 20.sp)
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun VodDetailBody(detail: VodDetail) {
    val scroll = rememberScrollState()
    Row(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .verticalScroll(scroll),
        horizontalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        // Hero poster column.
        PosterArt(
            title = detail.title,
            url = detail.cover,
            modifier = Modifier.size(width = 260.dp, height = 390.dp),
        )

        // Metadata column.
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = detail.title,
                color = FoundryColors.OnBackground,
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold,
            )
            MetaRow(detail)
            detail.plot?.let {
                Text(
                    text = it,
                    color = FoundryColors.OnSurfaceVariant,
                    fontSize = 16.sp,
                )
            }
            detail.director?.let {
                Text(
                    text = "Directed by $it",
                    color = FoundryColors.OnSurfaceVariant,
                    fontSize = 14.sp,
                )
            }
            detail.cast?.let {
                Text(
                    text = "Cast: $it",
                    color = FoundryColors.OnSurfaceVariant,
                    fontSize = 14.sp,
                    maxLines = 2,
                )
            }
            PlayButton(
                enabled = false,
                label = "Play (VOD playback not yet wired)",
                onClick = {
                    android.util.Log.i(
                        "VodDetail",
                        "Play requested for streamId=${detail.streamId} ext=${detail.containerExtension}",
                    )
                },
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun MetaRow(detail: VodDetail) {
    val bits = buildList {
        detail.releaseDate?.let { add(it.take(4)) }
        detail.genre?.let { add(it) }
        detail.duration?.let { add(it) }
        detail.rating?.let { add("★ $it") }
    }
    if (bits.isEmpty()) return
    Text(
        text = bits.joinToString("  ·  "),
        color = FoundryColors.OrangeBright,
        fontSize = 14.sp,
        fontWeight = FontWeight.Medium,
    )
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
internal fun PlayButton(
    enabled: Boolean,
    label: String,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(
                when {
                    !enabled -> FoundryColors.SurfaceVariant
                    focused -> FoundryColors.OrangeBright
                    else -> FoundryColors.Orange
                },
            )
            .onFocusChanged { focused = it.isFocused }
            .focusable(enabled)
            .clickable(enabled = enabled) { onClick() }
            .padding(horizontal = 24.dp, vertical = 12.dp),
    ) {
        Text(
            text = label,
            color = if (enabled) FoundryColors.OnPrimary else FoundryColors.OnSurfaceVariant,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}
