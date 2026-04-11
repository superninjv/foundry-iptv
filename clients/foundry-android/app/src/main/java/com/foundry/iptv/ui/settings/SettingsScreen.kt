package com.foundry.iptv.ui.settings

import android.content.Context
import android.os.Build
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import com.foundry.iptv.core.UserSettings
import com.foundry.iptv.ui.common.ApiClientHolder
import com.foundry.iptv.ui.focus.KeyboardHandler
import com.foundry.iptv.ui.focus.firstFocus
import com.foundry.iptv.ui.focus.rememberFirstFocus
import com.foundry.iptv.ui.theme.FoundryColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Device settings + About section.
 *
 * Shows the [UserSettings] bundle the server returns for the current device
 * token (label, email, version), a preview of the stored token (first 8 chars
 * only — we never print the full secret), and local Android platform info.
 *
 * "Unpair this device" clears the stored `device_token` + `server_url` from
 * `foundry_prefs` and calls `ApiClient.setToken("")`, then invokes
 * [onUnpair] so the host ([com.foundry.iptv.MainActivity]) can reset its
 * nav state back to the pairing flow. W4-A is responsible for wiring the
 * lambda — keeping the knowledge of MainActivity's nav out of this package.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SettingsScreen(
    modifier: Modifier = Modifier,
    onUnpair: () -> Unit = {},
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var serverSettings by remember { mutableStateOf<UserSettings?>(null) }
    var serverError by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    var showConfirm by remember { mutableStateOf(false) }

    val serverUrl = remember {
        context
            .getSharedPreferences("foundry_prefs", Context.MODE_PRIVATE)
            .getString("server_url", null)
            .orEmpty()
    }
    val appVersion = remember { readAppVersion(context) }

    LaunchedEffect(Unit) {
        val result = withContext(Dispatchers.IO) {
            runCatching { ApiClientHolder.get(context).getSettings() }
        }
        result.onSuccess {
            serverSettings = it
            loading = false
        }.onFailure {
            serverError = it.message ?: "Failed to load settings"
            loading = false
        }
    }

    val unpairButtonFocus = rememberFirstFocus()

    KeyboardHandler {
        Column(
            modifier = modifier
                .fillMaxSize()
                .padding(8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                text = "Settings",
                color = FoundryColors.OnBackground,
                fontSize = 28.sp,
                fontWeight = FontWeight.SemiBold,
            )

            // Device card
            SectionCard(title = "Device") {
                val label = serverSettings?.deviceLabel ?: "(unlabeled)"
                val email = serverSettings?.email.orEmpty()
                // Token ID + platform now come authoritatively from the server
                // (see W5-A — UserSettings.tokenId is the first 8 hex chars of
                // SHA-256(token); UserSettings.platform is the FFI-reported
                // client kind, e.g. "android-fire-tv").
                val tokenId = serverSettings?.tokenId.orEmpty()
                val platform = serverSettings?.platform.orEmpty()
                InfoRow("Label", label)
                if (email.isNotEmpty()) InfoRow("Account", email)
                InfoRow("Token", if (tokenId.isEmpty()) "—" else "$tokenId…")
                if (serverUrl.isNotEmpty()) InfoRow("Server", serverUrl)
                if (platform.isNotEmpty()) InfoRow("Platform", platform)
                InfoRow("Device", "Android ${Build.VERSION.RELEASE} · ${Build.MODEL}")
                when {
                    loading -> InfoRow("Status", "Refreshing…")
                    serverError != null -> InfoRow("Status", serverError!!)
                }
            }

            // Unpair button
            UnpairButton(
                modifier = Modifier.firstFocus(unpairButtonFocus),
                onClick = { showConfirm = true },
            )

            Spacer(Modifier.height(4.dp))

            // About
            SectionCard(title = "About") {
                val serverVersion = serverSettings?.version ?: "unknown"
                InfoRow("App", appVersion)
                InfoRow("Server", serverVersion)
                InfoRow("Home", "iptv.foundry.test")
            }
        }

        if (showConfirm) {
            UnpairConfirmDialog(
                onDismiss = { showConfirm = false },
                onConfirm = {
                    showConfirm = false
                    scope.launch {
                        clearPairingPrefs(context)
                        ApiClientHolder.invalidate()
                        onUnpair()
                    }
                },
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun SectionCard(
    title: String,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(FoundryColors.SurfaceVariant)
            .padding(16.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                text = title,
                color = FoundryColors.Orange,
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
            )
            content()
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            color = FoundryColors.OnSurfaceVariant,
            fontSize = 14.sp,
            modifier = Modifier
                .width(110.dp)
                .padding(end = 12.dp),
        )
        Text(
            text = value,
            color = FoundryColors.OnSurface,
            fontSize = 16.sp,
        )
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun UnpairButton(modifier: Modifier = Modifier, onClick: () -> Unit) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .height(64.dp)
            .clip(RoundedCornerShape(12.dp)),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = FoundryColors.Surface,
            focusedContainerColor = Color(0xFF7A1F1F),
        ),
        onClick = onClick,
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "Unpair this device",
                color = Color(0xFFFF9A9A),
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun UnpairConfirmDialog(
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    Dialog(onDismissRequest = onDismiss) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(FoundryColors.Surface)
                .padding(24.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text(
                    text = "Unpair device?",
                    color = FoundryColors.OnBackground,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = "This will clear the device token and return to the pairing screen.",
                    color = FoundryColors.OnSurfaceVariant,
                    fontSize = 16.sp,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    DialogButton(
                        label = "Cancel",
                        containerColor = FoundryColors.SurfaceVariant,
                        focusedColor = FoundryColors.SurfaceBright,
                        textColor = FoundryColors.OnSurface,
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f),
                    )
                    DialogButton(
                        label = "Unpair",
                        containerColor = Color(0xFF7A1F1F),
                        focusedColor = Color(0xFFB33030),
                        textColor = Color.White,
                        onClick = onConfirm,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun DialogButton(
    label: String,
    containerColor: Color,
    focusedColor: Color,
    textColor: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier
            .height(56.dp)
            .clip(RoundedCornerShape(8.dp)),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = containerColor,
            focusedContainerColor = focusedColor,
        ),
        onClick = onClick,
    ) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(label, color = textColor, fontSize = 16.sp)
        }
    }
}

private fun readAppVersion(context: Context): String {
    return runCatching {
        val pm = context.packageManager
        val pkg = pm.getPackageInfo(context.packageName, 0)
        pkg.versionName ?: "dev"
    }.getOrDefault("dev")
}

private fun clearPairingPrefs(context: Context) {
    context
        .getSharedPreferences("foundry_prefs", Context.MODE_PRIVATE)
        .edit()
        .remove("device_token")
        .remove("server_url")
        .apply()
}

// ApiClient wiring moved to ui/common/ApiClientHolder.kt (W5-B).
