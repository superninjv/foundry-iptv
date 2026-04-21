package com.foundry.iptv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.foundry.iptv.ui.PairingScreen
import com.foundry.iptv.ui.WebViewScreen
import com.foundry.iptv.ui.theme.FoundryTheme

/**
 * Root navigation destinations.
 *
 * Two-destination NavHost: a native Pairing screen (first-run flow that
 * exchanges a short-lived code for a long-lived device bearer token) and
 * a fullscreen embedded WebView that renders the Foundry IPTV web app at
 * the stored server URL. After pairing, the user never sees anything
 * Compose again — the WebView is the entire UI.
 */
object Destinations {
    const val PAIRING = "pairing"
    const val WEB = "web"
}

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val prefs = getSharedPreferences("foundry_prefs", MODE_PRIVATE)
        val hasToken = prefs.getString("device_token", null) != null
        val startDest = if (hasToken) Destinations.WEB else Destinations.PAIRING

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
                        navController.navigate(Destinations.WEB) {
                            popUpTo(Destinations.PAIRING) { inclusive = true }
                        }
                    },
                )
            }

            composable(Destinations.WEB) {
                val context = androidx.compose.ui.platform.LocalContext.current
                val prefs = context.applicationContext
                    .getSharedPreferences("foundry_prefs", android.content.Context.MODE_PRIVATE)
                val serverUrl = prefs.getString("server_url", null)
                val deviceToken = prefs.getString("device_token", null)

                if (serverUrl.isNullOrBlank() || deviceToken.isNullOrBlank()) {
                    // Creds got cleared between composition and navigation.
                    // Bounce back to pairing.
                    androidx.compose.runtime.LaunchedEffect(Unit) {
                        navController.navigate(Destinations.PAIRING) {
                            popUpTo(Destinations.WEB) { inclusive = true }
                        }
                    }
                } else {
                    WebViewScreen(
                        serverUrl = serverUrl,
                        deviceToken = deviceToken,
                    )
                }
            }
        }
    }
}
