package com.foundry.iptv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.foundry.iptv.ui.PairingScreen
import com.foundry.iptv.ui.hub.FoundryHub
import com.foundry.iptv.ui.theme.FoundryTheme

/**
 * Root navigation destinations.
 *
 * The hub is the new default post-pairing surface. The old flat
 * CHANNEL_LIST / NOW_PLAYING destinations have been removed — channel
 * browsing and playback now live inside the hub's Live tab and its own
 * PlayerHost, which later waves wire up.
 */
object Destinations {
    const val PAIRING = "pairing"
    const val HUB = "hub"
}

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Gate the first-run pairing flow on a persisted device token.
        val prefs = getSharedPreferences("foundry_prefs", MODE_PRIVATE)
        val hasToken = prefs.getString("device_token", null) != null
        val startDest = if (hasToken) Destinations.HUB else Destinations.PAIRING

        setContent {
            FoundryApp(startDestination = startDest)
        }
    }
}

@Composable
fun FoundryApp(startDestination: String) {
    FoundryTheme {
        val navController = rememberNavController()

        NavHost(navController = navController, startDestination = startDestination) {

            composable(Destinations.PAIRING) {
                PairingScreen(
                    onPaired = {
                        navController.navigate(Destinations.HUB) {
                            popUpTo(Destinations.PAIRING) { inclusive = true }
                        }
                    },
                )
            }

            composable(Destinations.HUB) {
                FoundryHub()
            }
        }
    }
}
