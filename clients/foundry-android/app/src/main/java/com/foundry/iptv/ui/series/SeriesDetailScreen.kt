package com.foundry.iptv.ui.series

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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
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
 * Lightweight typed view of the Xtream `get_series_info` response. We parse
 * just the fields the TV UI actually renders, using `org.json` so there is
 * no new build-time dependency for wave 2-B.
 */
internal data class EpisodeDetail(
    val id: String,
    val title: String,
    val episodeNum: Int,
    val plot: String?,
    val duration: String?,
    val image: String?,
    val containerExtension: String?,
)

internal data class SeasonDetail(
    val number: Int,
    val episodes: List<EpisodeDetail>,
)

internal data class SeriesDetail(
    val title: String,
    val cover: String?,
    val plot: String?,
    val genre: String?,
    val rating: String?,
    val releaseDate: String?,
    val director: String?,
    val cast: String?,
    val seasons: List<SeasonDetail>,
) {
    companion object {
        fun fromJson(json: String): SeriesDetail {
            val root = JSONObject(json)
            val info = root.optJSONObject("info") ?: JSONObject()
            val episodesObj = root.optJSONObject("episodes")

            val seasons = mutableListOf<SeasonDetail>()
            if (episodesObj != null) {
                val keys = episodesObj.keys()
                while (keys.hasNext()) {
                    val seasonKey = keys.next()
                    val seasonNumber = seasonKey.toIntOrNull() ?: continue
                    val arr = episodesObj.optJSONArray(seasonKey) ?: continue
                    val eps = mutableListOf<EpisodeDetail>()
                    for (i in 0 until arr.length()) {
                        val ep = arr.optJSONObject(i) ?: continue
                        val epInfo = ep.optJSONObject("info") ?: JSONObject()
                        eps += EpisodeDetail(
                            id = ep.optString("id"),
                            title = ep.optString("title"),
                            episodeNum = ep.optInt("episode_num", i + 1),
                            plot = epInfo.optString("plot").takeIf { it.isNotBlank() },
                            duration = epInfo.optString("duration").takeIf { it.isNotBlank() },
                            image = epInfo.optString("movie_image").takeIf { it.isNotBlank() },
                            containerExtension = ep.optString("container_extension")
                                .takeIf { it.isNotBlank() },
                        )
                    }
                    seasons += SeasonDetail(number = seasonNumber, episodes = eps)
                }
                seasons.sortBy { it.number }
            }

            return SeriesDetail(
                title = info.optString("name"),
                cover = info.optString("cover").takeIf { it.isNotBlank() },
                plot = info.optString("plot").takeIf { it.isNotBlank() },
                genre = info.optString("genre").takeIf { it.isNotBlank() },
                rating = info.optString("rating").takeIf { it.isNotBlank() },
                releaseDate = info.optString("releaseDate").takeIf { it.isNotBlank() },
                director = info.optString("director").takeIf { it.isNotBlank() },
                cast = info.optString("cast").takeIf { it.isNotBlank() },
                seasons = seasons,
            )
        }
    }
}

/**
 * Detail view for a single series. Shows the hero cover, plot, a seasons
 * row and the episode list for the selected season. Tapping an episode
 * currently logs — episode playback requires a `start_episode_stream`
 * FFI method that does not yet exist in wave-1-integration's FFI surface.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SeriesDetailScreen(
    seriesId: Long,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    BackHandler(onBack = onBack)

    val context = LocalContext.current
    var detail by remember(seriesId) { mutableStateOf<SeriesDetail?>(null) }
    var loading by remember(seriesId) { mutableStateOf(true) }
    var errorText by remember(seriesId) { mutableStateOf<String?>(null) }
    var selectedSeason by remember(seriesId) { mutableStateOf<Int?>(null) }

    LaunchedEffect(seriesId) {
        val creds = readCredentials(context)
        if (creds == null) {
            errorText = "No credentials — please re-pair."
            loading = false
            return@LaunchedEffect
        }
        val result = withContext(Dispatchers.IO) {
            runCatching {
                val client = ApiClient(creds.serverUrl).also { it.setToken(creds.token) }
                val raw = client.getSeriesDetail(seriesId.toString())
                SeriesDetail.fromJson(raw)
            }
        }
        result.onSuccess {
            detail = it
            selectedSeason = it.seasons.firstOrNull()?.number
            loading = false
        }.onFailure { e ->
            errorText = e.message ?: "Failed to load series details"
            loading = false
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(FoundryColors.Background),
    ) {
        when {
            loading -> CenterMessage("Loading series…", Color(0xFFAAAAAA))
            errorText != null -> CenterMessage(errorText!!, Color(0xFFFF6666))
            detail != null -> SeriesDetailBody(
                detail = detail!!,
                selectedSeason = selectedSeason,
                onSelectSeason = { selectedSeason = it },
            )
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
private fun SeriesDetailBody(
    detail: SeriesDetail,
    selectedSeason: Int?,
    onSelectSeason: (Int) -> Unit,
) {
    val scroll = rememberScrollState()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .verticalScroll(scroll),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
            SeriesPoster(
                title = detail.title,
                url = detail.cover,
                modifier = Modifier.size(width = 240.dp, height = 360.dp),
            )
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    text = detail.title,
                    color = FoundryColors.OnBackground,
                    fontSize = 32.sp,
                    fontWeight = FontWeight.Bold,
                )
                val bits = buildList {
                    detail.releaseDate?.let { add(it.take(4)) }
                    detail.genre?.let { add(it) }
                    detail.rating?.let { add("★ $it") }
                }
                if (bits.isNotEmpty()) {
                    Text(
                        text = bits.joinToString("  ·  "),
                        color = FoundryColors.OrangeBright,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
                detail.plot?.let {
                    Text(
                        text = it,
                        color = FoundryColors.OnSurfaceVariant,
                        fontSize = 15.sp,
                    )
                }
                detail.director?.let {
                    Text(
                        text = "Directed by $it",
                        color = FoundryColors.OnSurfaceVariant,
                        fontSize = 13.sp,
                    )
                }
                detail.cast?.let {
                    Text(
                        text = "Cast: $it",
                        color = FoundryColors.OnSurfaceVariant,
                        fontSize = 13.sp,
                        maxLines = 2,
                    )
                }
            }
        }

        if (detail.seasons.isEmpty()) {
            Text(
                text = "No seasons listed.",
                color = FoundryColors.OnSurfaceVariant,
                fontSize = 14.sp,
            )
            return@Column
        }

        // Seasons chip row.
        Text(
            text = "Seasons",
            color = FoundryColors.OnBackground,
            fontSize = 18.sp,
            fontWeight = FontWeight.SemiBold,
        )
        LazyRow(
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(detail.seasons, key = { it.number }) { season ->
                SeasonChip(
                    number = season.number,
                    episodeCount = season.episodes.size,
                    selected = selectedSeason == season.number,
                    onClick = { onSelectSeason(season.number) },
                )
            }
        }

        // Episode list for the selected season.
        val active = detail.seasons.firstOrNull { it.number == selectedSeason }
        Text(
            text = "Episodes",
            color = FoundryColors.OnBackground,
            fontSize = 18.sp,
            fontWeight = FontWeight.SemiBold,
        )
        if (active == null || active.episodes.isEmpty()) {
            Text(
                text = "No episodes in this season.",
                color = FoundryColors.OnSurfaceVariant,
                fontSize = 14.sp,
            )
        } else {
            // Using a plain Column (inside a verticalScroll) rather than nested
            // LazyColumn: nesting a lazy list inside a scroll container crashes
            // at runtime. Episode counts per season are small (<30 typical).
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                active.episodes.forEach { ep ->
                    EpisodeRow(ep)
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun SeasonChip(
    number: Int,
    episodeCount: Int,
    selected: Boolean,
    onClick: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val bg = when {
        selected -> FoundryColors.Orange
        focused -> FoundryColors.SurfaceBright
        else -> FoundryColors.SurfaceVariant
    }
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(bg)
            .onFocusChanged { focused = it.isFocused }
            .focusable()
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "S$number  ($episodeCount)",
            color = if (selected) FoundryColors.OnPrimary else FoundryColors.OnSurface,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun EpisodeRow(ep: EpisodeDetail) {
    var focused by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(if (focused) FoundryColors.SurfaceBright else FoundryColors.Surface)
            .onFocusChanged { focused = it.isFocused }
            .focusable()
            .clickable {
                android.util.Log.i(
                    "SeriesDetail",
                    "Play requested for episodeId=${ep.id} ext=${ep.containerExtension}",
                )
            }
            .padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SeriesPoster(
            title = ep.title,
            url = ep.image,
            modifier = Modifier.size(width = 120.dp, height = 68.dp),
        )
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = "${ep.episodeNum}. ${ep.title}",
                color = FoundryColors.OnSurface,
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
            )
            ep.duration?.let {
                Text(
                    text = it,
                    color = FoundryColors.OrangeBright,
                    fontSize = 12.sp,
                )
            }
            ep.plot?.let {
                Text(
                    text = it,
                    color = FoundryColors.OnSurfaceVariant,
                    fontSize = 12.sp,
                    maxLines = 2,
                )
            }
        }
    }
}
