package com.foundry.iptv.ui

import android.annotation.SuppressLint
import android.util.Log
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import java.net.HttpURLConnection
import java.net.URL

/**
 * Fullscreen embedded WebView that renders the Foundry IPTV web app.
 *
 * Every HTTP request made by the WebView (page loads, XHR, images, media)
 * is intercepted by [authenticatingWebViewClient] and has an
 * `Authorization: Bearer <deviceToken>` header stamped on it. The server's
 * `src/middleware.ts` rewrites that into `x-device-bearer` so the rest of
 * the Next.js pipeline sees a logged-in device session without ever seeing
 * a NextAuth cookie.
 *
 * Navigation: Compose `BackHandler` → `webView.goBack()` while the web
 * history has entries, otherwise falls through to the system default
 * (exit activity). The user never sees a URL bar or any browser chrome.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebViewScreen(
    serverUrl: String,
    deviceToken: String,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val webView = remember(serverUrl, deviceToken) {
        buildFoundryWebView(context, serverUrl, deviceToken)
    }

    DisposableEffect(webView) {
        onDispose {
            runCatching {
                webView.stopLoading()
                webView.destroy()
            }
        }
    }

    BackHandler(enabled = true) {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            // Fall through to system Back — the hosting activity will
            // finish() which drops the user back to the Fire TV launcher.
            (webView.context as? android.app.Activity)?.finish()
        }
    }

    AndroidView(
        modifier = modifier.fillMaxSize(),
        factory = { webView },
    )
}

/**
 * Intercepts every request and stamps the bearer token header. The
 * shouldOverrideUrlLoading path is left alone so in-app links behave
 * exactly like the web (no external browser handoff).
 */
private fun authenticatingWebViewClient(
    deviceToken: String,
    serverOriginHost: String,
    serverOriginPort: Int,
    serverOriginProtocol: String,
) = object : WebViewClient() {

    override fun shouldInterceptRequest(
        view: WebView,
        request: WebResourceRequest,
    ): WebResourceResponse? {
        // This callback runs on WebView's worker thread. Do NOT call any
        // WebView getter here (view.url, view.settings, etc.) — those are
        // main-thread only and will throw. We pre-captured the server
        // origin in [buildFoundryWebView] and compare against the pure
        // request URL instead.
        val url = request.url.toString()
        val sameOrigin = isSameOrigin(request.url.host, request.url.port, request.url.scheme,
                serverOriginHost, serverOriginPort, serverOriginProtocol)
        Log.i(TAG, "intercept ${request.method} $url sameOrigin=$sameOrigin")
        if (!sameOrigin) {
            return null
        }

        return runCatching {
            val conn = URL(url).openConnection() as HttpURLConnection
            conn.requestMethod = request.method
            conn.instanceFollowRedirects = false
            conn.connectTimeout = 15_000
            conn.readTimeout = 30_000

            // Copy original headers + stamp Authorization.
            for ((k, v) in request.requestHeaders) {
                conn.setRequestProperty(k, v)
            }
            conn.setRequestProperty("Authorization", "Bearer $deviceToken")

            conn.connect()

            val contentType = conn.contentType ?: "application/octet-stream"
            val mime = contentType.substringBefore(';').trim()
            val encoding = contentType.substringAfter("charset=", "utf-8").trim()

            val stream = runCatching { conn.inputStream }.getOrNull()
                ?: conn.errorStream

            val responseHeaders = conn.headerFields
                .filterKeys { it != null }
                .mapValues { (_, v) -> v.joinToString(",") }

            WebResourceResponse(
                mime,
                encoding,
                conn.responseCode,
                conn.responseMessage ?: "OK",
                responseHeaders,
                stream,
            )
        }.getOrElse {
            Log.w(TAG, "auth intercept failed for $url: ${it.message}")
            null
        }
    }

    override fun onReceivedError(
        view: WebView,
        request: WebResourceRequest,
        error: android.webkit.WebResourceError,
    ) {
        Log.e(TAG, "WebView error ${error.errorCode}: ${error.description} for ${request.url}")
    }
}

private fun isSameOrigin(
    reqHost: String?,
    reqPort: Int,
    reqScheme: String?,
    originHost: String,
    originPort: Int,
    originScheme: String,
): Boolean {
    if (reqHost == null || reqScheme == null) return false
    // android.net.Uri.getPort() returns -1 for unspecified port; normalize
    // to the scheme default so it matches the pre-computed origin port.
    val normalizedReqPort = if (reqPort == -1) defaultPort(reqScheme) else reqPort
    return reqHost.equals(originHost, ignoreCase = true) &&
        normalizedReqPort == originPort &&
        reqScheme.equals(originScheme, ignoreCase = true)
}

private fun defaultPort(scheme: String): Int = when (scheme.lowercase()) {
    "http" -> 80
    "https" -> 443
    else -> -1
}

private const val TAG = "FoundryWebView"

/**
 * Actual factory used from [WebViewScreen]. Declared at file scope so the
 * AndroidView factory lambda can call it with the real Compose context.
 */
internal fun buildFoundryWebView(
    context: android.content.Context,
    serverUrl: String,
    deviceToken: String,
): WebView {
    // Pre-parse the server origin on the main thread so the background
    // shouldInterceptRequest callback can compare without touching WebView.
    val origin = URL(serverUrl.trimEnd('/') + "/")
    val originHost = origin.host
    val originPort = if (origin.port == -1) origin.defaultPort else origin.port
    val originScheme = origin.protocol

    return WebView(context).apply {
    layoutParams = ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
    )

    settings.apply {
        javaScriptEnabled = true
        domStorageEnabled = true
        databaseEnabled = true
        mediaPlaybackRequiresUserGesture = false
        loadWithOverviewMode = true
        useWideViewPort = true
        // Bypass the WebView's HTTP cache. Our shouldInterceptRequest
        // handler is the canonical source of bytes and stamps Bearer auth;
        // letting the WebView cache stale 302→/login responses from a
        // previous session would silently route the user back to the
        // login page even after the underlying auth is fixed.
        cacheMode = WebSettings.LOAD_NO_CACHE
        // The web is served over plain HTTP on the LAN.
        mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        // Let the web app detect it's on a 1080p TV.
        userAgentString = "$userAgentString FoundryIPTV/1.0 (FireTV)"
    }

    // Nuke any prior cache from older builds that might have stale
    // /login redirects or cookies.
    clearCache(true)
    clearHistory()

    // Cookies on by default — the web app's NextAuth session + any
    // client-set cookies will persist across app launches.
    android.webkit.CookieManager.getInstance().setAcceptCookie(true)
    android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

    webViewClient = authenticatingWebViewClient(
        deviceToken = deviceToken,
        serverOriginHost = originHost,
        serverOriginPort = originPort,
        serverOriginProtocol = originScheme,
    )
    setBackgroundColor(0xFF07090C.toInt())

    // Allow the hardware D-pad to reach the page — Chromium maps DPAD to
    // Tab/Shift-Tab/Enter automatically, which drives the web's CSS
    // focus-visible outlines.
    isFocusable = true
    isFocusableInTouchMode = true
    requestFocus()

    // Land on /live — the server's middleware.ts only rewrites Bearer
    // auth headers for routes in APP_PREFIXES. The root "/" is not in
    // that list, so loading it unauthenticated would redirect to /login.
    loadUrl(serverUrl.trimEnd('/') + "/live")
    }
}
