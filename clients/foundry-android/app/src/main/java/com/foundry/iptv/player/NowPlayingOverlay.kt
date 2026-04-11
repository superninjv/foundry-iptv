package com.foundry.iptv.player

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text

/**
 * Translucent bottom strip that fades in/out with [AnimatedVisibility].
 *
 * Renders the channel name on the left, the current program title in the middle,
 * and a progress bar along the bottom. If [programStartMs] and [programEndMs] are
 * both provided, progress is `(now - start) / (end - start)` clamped to [0, 1].
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun NowPlayingOverlay(
    visible: Boolean,
    channelName: String,
    currentProgramTitle: String?,
    programStartMs: Long?,
    programEndMs: Long?,
    modifier: Modifier = Modifier,
) {
    // Tick every second while visible so the progress bar advances smoothly.
    var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(visible) {
        while (visible) {
            nowMs = System.currentTimeMillis()
            kotlinx.coroutines.delay(1_000)
        }
    }

    val progress: Float? = if (programStartMs != null && programEndMs != null && programEndMs > programStartMs) {
        ((nowMs - programStartMs).toFloat() / (programEndMs - programStartMs).toFloat())
            .coerceIn(0f, 1f)
    } else {
        null
    }

    Box(modifier = modifier) {
        AnimatedVisibility(
            visible = visible,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xCC000000))
                    .padding(horizontal = 32.dp, vertical = 20.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = channelName,
                        color = Color.White,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(modifier = Modifier.width(24.dp))
                    Text(
                        text = currentProgramTitle ?: "",
                        color = Color(0xFFDDDDDD),
                        fontSize = 18.sp,
                    )
                }
                Spacer(modifier = Modifier.height(12.dp))
                // Thin progress bar — rendered as a background track + filled inner box.
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(3.dp)
                        .background(Color(0x55FFFFFF)),
                ) {
                    if (progress != null) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .fillMaxWidth(progress)
                                .background(Color(0xFFFF8A00)),
                        )
                    }
                }
            }
        }
    }
}
