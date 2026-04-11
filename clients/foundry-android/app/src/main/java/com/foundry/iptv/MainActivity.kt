package com.foundry.iptv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import com.foundry.iptv.ui.ChannelListScreen
import com.foundry.iptv.ui.PairingScreen
import com.foundry.iptv.player.ExoPlayerScreen

/**
 * Root navigation destinations.
 */
object Destinations {
    const val PAIRING = "pairing"
    const val CHANNEL_LIST = "channel_list"
    const val NOW_PLAYING = "now_playing/{hlsUrl}"

    fun nowPlaying(hlsUrl: String): String =
        "now_playing/${java.net.URLEncoder.encode(hlsUrl, "UTF-8")}"
}

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Determine start destination from persisted prefs.
        val prefs = getSharedPreferences("foundry_prefs", MODE_PRIVATE)
        val hasToken = prefs.getString("device_token", null) != null
        val startDest = if (hasToken) Destinations.CHANNEL_LIST else Destinations.PAIRING

        setContent {
            FoundryApp(startDestination = startDest)
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun FoundryApp(startDestination: String) {
    MaterialTheme {
        val navController = rememberNavController()

        NavHost(navController = navController, startDestination = startDestination) {

            composable(Destinations.PAIRING) {
                PairingScreen(
                    onPaired = { navController.navigate(Destinations.CHANNEL_LIST) {
                        popUpTo(Destinations.PAIRING) { inclusive = true }
                    }}
                )
            }

            composable(Destinations.CHANNEL_LIST) {
                ChannelListScreen(
                    onChannelSelected = { hlsUrl ->
                        navController.navigate(Destinations.nowPlaying(hlsUrl))
                    }
                )
            }

            composable(
                route = Destinations.NOW_PLAYING,
                arguments = listOf(
                    navArgument("hlsUrl") { type = NavType.StringType }
                )
            ) { backStackEntry ->
                val encoded = backStackEntry.arguments?.getString("hlsUrl") ?: ""
                val hlsUrl = java.net.URLDecoder.decode(encoded, "UTF-8")
                ExoPlayerScreen(
                    hlsUrl = hlsUrl,
                    onStop = { navController.popBackStack() }
                )
            }
        }
    }
}
