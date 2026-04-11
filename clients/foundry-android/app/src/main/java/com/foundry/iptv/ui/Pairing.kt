package com.foundry.iptv.ui

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Text
import com.foundry.iptv.DeviceAuth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Pairing / first-run screen.
 *
 * Prompts the user for the server URL and the 6-character pairing code
 * shown in Settings → Devices on the web UI.  Calls [DeviceAuth.exchangePairingCode]
 * on the IO dispatcher (blocking JNI call) and persists the token to
 * SharedPreferences on success.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun PairingScreen(onPaired: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var serverUrl by remember { mutableStateOf("http://") }
    var pairingCode by remember { mutableStateOf("") }
    var statusText by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 120.dp, vertical = 80.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = "Foundry IPTV", fontSize = 56.sp, color = Color.White)
        Spacer(modifier = Modifier.height(8.dp))
        Text(text = "First-time Setup", fontSize = 24.sp, color = Color(0xFFAAAAAA))
        Spacer(modifier = Modifier.height(48.dp))

        Text(text = "Server URL", fontSize = 18.sp, color = Color(0xFFCCCCCC))
        Spacer(modifier = Modifier.height(8.dp))
        androidx.compose.material3.OutlinedTextField(
            value = serverUrl,
            onValueChange = { serverUrl = it },
            placeholder = { androidx.compose.material3.Text("http://192.168.1.x") },
            modifier = Modifier.fillMaxWidth(0.6f),
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            enabled = !busy,
        )

        Spacer(modifier = Modifier.height(24.dp))

        Text(text = "Pairing Code", fontSize = 18.sp, color = Color(0xFFCCCCCC))
        Spacer(modifier = Modifier.height(8.dp))
        androidx.compose.material3.OutlinedTextField(
            value = pairingCode,
            onValueChange = { pairingCode = it.uppercase() },
            placeholder = { androidx.compose.material3.Text("XXXXXX") },
            modifier = Modifier.fillMaxWidth(0.6f),
            singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
            enabled = !busy,
        )

        Spacer(modifier = Modifier.height(32.dp))

        Button(
            onClick = {
                busy = true
                statusText = ""
                scope.launch {
                    val result = withContext(Dispatchers.IO) {
                        runCatching {
                            DeviceAuth.exchangePairingCode(
                                serverUrl.trim(),
                                pairingCode.trim(),
                                "Foundry Android",
                            )
                        }
                    }
                    result.onSuccess { token ->
                        persistCredentials(context, serverUrl.trim(), token)
                        onPaired()
                    }.onFailure { e ->
                        statusText = e.message ?: "Pairing failed"
                        busy = false
                    }
                }
            },
            enabled = !busy && serverUrl.isNotBlank() && pairingCode.length >= 4,
        ) {
            Text(text = if (busy) "Pairing…" else "Pair Device")
        }

        if (statusText.isNotEmpty()) {
            Spacer(modifier = Modifier.height(16.dp))
            Text(text = statusText, fontSize = 14.sp, color = Color(0xFFFF6666))
        }
    }
}

private fun persistCredentials(context: Context, serverUrl: String, token: String) {
    context.getSharedPreferences("foundry_prefs", Context.MODE_PRIVATE)
        .edit()
        .putString("server_url", serverUrl)
        .putString("device_token", token)
        .apply()
}
