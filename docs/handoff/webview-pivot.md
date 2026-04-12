# Handoff — WebView pivot lands, native Compose UI is dead code

Paste this into a fresh Claude Code session at `~/projects/foundry-iptv` as the first message. Everything the next session needs is here.

## TL;DR

After burning a day fighting Compose TV focus bugs and pixel-porting web components, we pivoted the FireStick Kotlin client to embed the existing Foundry web app inside an Android `WebView`. The native Pairing flow stays; after pairing, the WebView is the entire UI. **Pixel-perfect because it *is* the web.** Shipped and verified on both FireSticks (10.0.0.170 Max, 10.0.0.144 Lite).

Now there's ~5000 lines of Compose UI code sitting dead in the tree and a couple of followups.

## Current state

- **Branch**: `wave-1-integration`, 69 commits ahead of `master`, **not pushed**.
- **Last commit**: `672e137 WebView pivot: embedded Chromium fullscreen serves the web app`.
- **Working on the user's hardware**: both FireSticks installed + running, both launch straight to the web Live page inside the embedded WebView.
- **APK**: `~/projects/foundry-iptv/clients/dist/foundry-iptv.apk`, also live at `http://iptv.foundry.test/client-apk/foundry-iptv.apk`.
- **Sizes**: ~36 MB debug APK. Rust `libfoundry_core.so` still in `jniLibs/` for all 3 ABIs (pairing still uses `foundry_core::exchange_pairing_code`), but the other 25 FFI methods are effectively unused.

## Architecture now

```
MainActivity
  ├─ Destinations.PAIRING → PairingScreen (native Compose)
  │     └─ on success, writes server_url + device_token to foundry_prefs
  │        then navigates to Destinations.WEB
  │
  └─ Destinations.WEB → WebViewScreen
        └─ reads prefs, builds android.webkit.WebView, loads
           `{server_url}/live` via loadUrl()
```

`WebViewScreen.kt` is the only new file. It:
- Embeds `WebView` via `AndroidView`
- `shouldInterceptRequest`: on every same-origin request (host+port+scheme, port-normalized), fetches via `HttpURLConnection` with `Authorization: Bearer <device_token>` stamped on. The server's `src/middleware.ts` rewrites that header to `x-device-bearer` and `requireAuth()` accepts it.
- Back button: `webView.canGoBack() ? webView.goBack() : activity.finish()`
- `LOAD_NO_CACHE` + `clearCache(true)` + `clearHistory()` on creation (a stale /login redirect from before the auth fix kept resurrecting otherwise).
- `setBackgroundColor(0xFF07090C.toInt())` so the gap during WebView warm-up matches the web's `--bg`.

## Server-side changes in the same commit

- `src/lib/auth/session.ts`: extracted `getCurrentUserOrBearer()` that checks NextAuth cookie first, then `x-device-bearer` header. **Both `requireAuth()` and `getApiUser()` now use it.** Before, only `getApiUser()` did — so API routes authenticated but Server Component pages didn't, and the WebView kept getting redirected to `/login`.

## Gradle dep added

`app/build.gradle.kts` line 86ish:

```kotlin
implementation("androidx.window:window:1.3.0")
```

Required by Amazon WebView on Fire TV. Without it, `loadUrl()` throws `NoClassDefFoundError: Failed resolution of: Landroidx/window/extensions/core/util/function/Consumer;` on first navigation and the app crashes.

## The long history of how we got here (one paragraph per wave, skim this)

- **Waves 1–4** (Track J, earlier sessions): built the native Compose TV hub with Live/Guide/VOD/Series/Decks/Multiview/Search/Settings. FFI via uniffi into a Rust `foundry-core` crate. Decks had warm-stream ExoPlayer pool, Multiview had 4 layout presets, all screens had library-scoped (watched-only) views.
- **R2 perf pass**: found `reqwest::Client` was being rebuilt on every single FFI call (no keepalive, no TLS session reuse), tokio runtime was single-threaded, Guide fired 200 sequential per-row EPG requests. Fixed all three. Added in-memory 30s cache in Rust mirroring the web's `Cache-Control: max-age=30, swr=300`. Added `get_epg_batch` that parallelizes per-channel fetches inside Rust with `tokio::Semaphore(16)`.
- **R3 library rewrite**: Jack said "the only way we find things is through search" — gutted category browsing from Live/Guide/VOD/Series, added new `/api/library/{live,vod,series}` server routes that return history-scoped enriched lists, replaced the UI with library grids + empty states.
- **R4 decks/multiview CRUD**: added create/delete deck, add/remove deck entry, ChannelPicker overlay, 4-layout Multiview, persistence.
- **R5 focus bugs**: custom `FoundryHub.kt` focus plumbing was broken in three layered ways. Fix was to *delete the custom focus plumbing entirely* and let Compose's default 2D focus search work. `FoundryHub` became a plain Column(TabRail, ContentBox(weight=1f)) — no `focusRestorer`, no `focusGroup`, no retry LaunchedEffect, no manual `requestFocus` on Up. Verified on hardware with `uiautomator dump`.
- **R6 visual port**: spawned an agent to pixel-match the web's `ChannelGrid.tsx`/`MediaGrid.tsx`/etc. inside the existing Compose screens. Updated `FoundryColors` hex to match `globals.css` CSS vars exactly (`--accent` was `#FF9548` not `#FF7E1F`, `--bg` was `#07090C` not `#0A0A0A`, etc). Jack looked at it and said "it looks nothing like the web". Conceded that pixel-matching Tailwind in Compose was a losing battle.
- **WebView pivot (this commit, `672e137`)**: replaced the entire Compose UI stack with an embedded WebView. See `WebViewScreen.kt` and the commit message.

## ~5000 lines of dead Compose code

These files are no longer imported from `MainActivity` and can be deleted in a cleanup pass:

```
clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/hub/**
clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/live/**
clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/guide/**
clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/vod/**
clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/series/**
clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/decks/**
clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/multiview/**
clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/search/**
clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/settings/**
clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/history/**
clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/favorites/**
clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/lists/**
clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/nowplaying/**
clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/image/**
clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/focus/**    (except if PairingScreen uses it — grep first)
clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/theme/**    (PairingScreen imports FoundryTheme — keep it, or inline colors into Pairing)
clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/common/LibraryStore.kt
clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/common/WatchTracker.kt
clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/common/ChannelPicker.kt
clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/common/EmptyLibraryState.kt
clients/foundry-android/app/src/main/java/com/foundry/iptv/player/**     (ExoPlayer host, WarmPlayerPool — unused now, WebView handles playback via hls.js)
```

**Keep**:
- `ui/Pairing.kt` (PairingScreen)
- `ui/WebViewScreen.kt`
- `ui/common/ApiClientHolder.kt` (PairingScreen uses it to call `exchange_pairing_code`)
- `ui/theme/**` (PairingScreen uses `FoundryTheme`)
- `ui/focus/FocusHelpers.kt` (PairingScreen uses `rememberFirstFocus`/`firstFocus`/`KeyboardHandler`)
- `core/foundry_core.kt` + `jniLibs/*/libfoundry_core.so` (pairing FFI)

### Cleanup script (run and verify compiles)

```bash
cd ~/projects/foundry-iptv/clients/foundry-android/app/src/main/java/com/foundry/iptv

rm -rf ui/hub ui/live ui/guide ui/vod ui/series ui/decks ui/multiview \
       ui/search ui/settings ui/history ui/favorites ui/lists \
       ui/nowplaying ui/image player

rm ui/common/LibraryStore.kt ui/common/WatchTracker.kt \
   ui/common/ChannelPicker.kt ui/common/EmptyLibraryState.kt

cd ~/projects/foundry-iptv/clients/foundry-android
export JAVA_HOME=$HOME/.local/jdk-21
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH
./gradlew assembleDebug --no-daemon
```

If it fails, read the import errors and either restore the file or find the stale import in `MainActivity.kt` / `PairingScreen.kt`. Shouldn't fail — `MainActivity.kt` already only imports `PairingScreen` and `WebViewScreen`, and `PairingScreen.kt` was never touched by the feature-screen waves.

After this cleanup, the Android `build.gradle.kts` dependencies for `androidx.tv:tv-foundation`, `androidx.tv:tv-material`, `androidx.navigation:navigation-compose`, `androidx.media3:*`, `io.coil-kt.coil3:*`, `org.jetbrains.kotlinx:kotlinx-serialization-json` can probably all be dropped too — verify with `./gradlew app:dependencies` and grep which are still needed by Pairing + WebViewScreen.

## FFI trimming (optional, deferred)

The Rust `foundry-core` crate exposes ~26 FFI methods. Only `exchange_pairing_code` and `ApiClient::new` + `set_token` are actually used now (by PairingScreen). The other 24 methods (list_channels, list_vod, get_epg_batch, list_library_*, record_watch_history, etc.) have no Kotlin callers.

**Don't delete them yet** — they're small, they compile fine, and if we ever need to add a native overlay (e.g., a Picture-in-Picture player controlled natively while the rest of the UI is the WebView), we'll want them back. Keep as-is.

## Known issues / followups

1. **`.kotlin/errors/errors-1775957392028.log` got committed accidentally** in `672e137`. Harmless, gitignore `.kotlin/errors/` and drop it in the next cleanup commit.
2. **WebView on Lite is slower than Max** because the Lite's Chromium renders at armeabi-v7a with less RAM. Not broken, just not buttery. If Jack complains, look at `settings.cacheMode = LOAD_DEFAULT` (currently `LOAD_NO_CACHE` for debugging staleness — can be relaxed once prod-stable).
3. **`androidx.window:1.3.0`** was added to fix the Amazon WebView `NoClassDefFoundError`. If a newer Amazon WebView release drops the dependency, we can remove it. Unlikely, don't bother.
4. **Pairing flow still uses the Rust FFI** via `foundry_core::exchange_pairing_code`. If we want to simplify further, that can become a native OkHttp call + SharedPreferences write, and we can drop the Rust core + uniffi + all 3 `.so` files (save ~18 MB in the APK). Medium priority — the simplification is nice but the FFI isn't actively hurting.
5. **The `docs/product-direction.md` file is untracked**. Jack owns it, leave it alone.
6. **WebView soft keyboard**: when you tap an input field, Fire TV's on-screen keyboard overlays the page. That's native Fire TV behavior, not something we control. Accepts remote input fine.
7. **Back key at root**: currently `activity.finish()` which drops to the Fire TV home screen. If Jack wants "Back at root = confirm exit", wire a prompt into `BackHandler`.
8. **Performance on cold start**: first WebView load takes ~5s on Lite (Chromium process warm-up + first Next.js page compile). Subsequent tab switches are ~1s. Prewarming `WebView.enableSlowWholeDocumentDraw()` or using `WebViewCompat.startSafeBrowsing` early in `MainActivity.onCreate` may help. Lower priority than the cleanup.

## How to resume

If the user's next instruction is "clean up the dead code", run the cleanup script above.

If the user's next instruction is "add feature X to the WebView app", feature X belongs in the **web** at `src/app/(app)/**` — the native app is now just a thin shell. Changes to the web auto-propagate to the FireSticks on next launch via Mutagen sync (workstation → foundry-01) + Next.js dev hot reload.

If the user's next instruction is "the WebView crashed on X", check:
1. `adb -s <ip>:5555 logcat -b crash -d | grep -v crashpad` for the real exception
2. `adb -s <ip>:5555 logcat -d | grep FoundryWebView` for intercept trace
3. `FoundryWebView: intercept GET <url> sameOrigin=false` means the same-origin check missed — check port normalization
4. `NoClassDefFoundError` for some androidx.* class means we need another androidx dep in `build.gradle.kts`

If the user says "it looks the same / nothing changed", first verify:
1. `sha256sum clients/dist/foundry-iptv.apk` — compare against the freshly-built one in `clients/foundry-android/app/build/outputs/apk/debug/app-debug.apk`. The `dist/` APK is what gets rsync'd to foundry-01 and installed, and it's been stale more than once.
2. `adb -s <ip>:5555 shell dumpsys package com.foundry.iptv | grep lastUpdateTime` — confirm the install timestamp is recent.
3. `adb -s <ip>:5555 shell dumpsys window | grep mCurrentFocus` — confirm foundry-iptv is actually in the foreground (the Max has a habit of showing the Amazon launcher instead).

## Key commands cheat sheet

```bash
# Build
cd ~/projects/foundry-iptv/clients/foundry-android
export JAVA_HOME=$HOME/.local/jdk-21
export ANDROID_HOME=$HOME/Android/Sdk
export ANDROID_NDK_HOME=$HOME/Android/Sdk/ndk/26.3.11579264
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH
./gradlew assembleDebug --no-daemon

# Deploy to foundry-01 + both FireSticks
cp app/build/outputs/apk/debug/app-debug.apk ~/projects/foundry-iptv/clients/dist/foundry-iptv.apk
rsync -av ~/projects/foundry-iptv/clients/dist/foundry-iptv.apk jack@10.0.0.3:/srv/foundry-apk/
ssh jack@10.0.0.3 /srv/foundry-apk/publish.sh
for ip in 10.0.0.170 10.0.0.144; do
  adb connect $ip:5555
  adb -s $ip:5555 install -r ~/projects/foundry-iptv/clients/dist/foundry-iptv.apk
  adb -s $ip:5555 shell 'am force-stop com.foundry.iptv && am start -n com.foundry.iptv/.MainActivity'
done

# Pull a screenshot (wake screen first on Lite — the screensaver will eat the capture otherwise)
adb -s 10.0.0.144:5555 shell 'input keyevent 23 ; screencap -p /sdcard/s.png'
adb -s 10.0.0.144:5555 pull /sdcard/s.png /tmp/fs.png
# Open /tmp/fs.png with your viewer or the Read tool

# Read prefs (includes pairing token)
adb -s 10.0.0.144:5555 shell 'run-as com.foundry.iptv cat /data/data/com.foundry.iptv/shared_prefs/foundry_prefs.xml'

# Force-clear app data (nukes pairing token — you'll need to re-pair)
adb -s 10.0.0.144:5555 shell pm clear com.foundry.iptv

# Test bearer auth to the server directly (from the workstation)
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer 7e26b9ab8e3e960324d9b8d6aa53f3fe1909dadf98e5b1924df110ea0dceca8d" \
  http://iptv.foundry.test/live

# If the Lite's token gets lost, restore the pre-provisioned one:
adb -s 10.0.0.144:5555 shell "run-as com.foundry.iptv sh -c 'mkdir -p shared_prefs && cat > shared_prefs/foundry_prefs.xml'" <<'EOF'
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="server_url">http://iptv.foundry.test</string>
    <string name="device_token">7e26b9ab8e3e960324d9b8d6aa53f3fe1909dadf98e5b1924df110ea0dceca8d</string>
</map>
EOF
```

## Memory to save after this session lands

Store at `/home/jack/.claude/projects/-home-jack-projects-foundry-iptv/memory/project_webview_pivot.md`:

```markdown
---
name: WebView pivot — native app is now an embedded WebView shell
description: After the library + visual-port attempts, Foundry IPTV FireStick client pivoted to a Compose Pairing screen + fullscreen android.webkit.WebView pointed at http://iptv.foundry.test/live. Bearer auth via shouldInterceptRequest header injection. Every visual bug the user complained about was fixed by this pivot because the WebView IS the web.
type: project
---

The Android client no longer has native feature screens. It has two destinations:
1. Pairing (native Compose) — uses foundry_core::exchange_pairing_code FFI, stores device_token + server_url in foundry_prefs.
2. WebViewScreen — android.webkit.WebView fullscreen, loads {server_url}/live, injects Authorization: Bearer via shouldInterceptRequest.

All feature development happens on the web at src/app/(app)/** — the native app is a thin shell that auto-picks up changes via Mutagen sync.

**Why:** Jack burned 8+ hours on Compose TV focus bugs and pixel-porting web components. Every visual attempt was "close but not exact". WebView is pixel-perfect by definition (it IS the web).

**Why not before:** Jack initially rejected WebView because he thought it meant "browser with a URL". It's actually an embedded Chromium inside the APK process — still an Android app with its own icon, package, activity, back button, etc. Convinced him on retry.

**How to apply:** Don't add native screens. Features live on the web. If the native app needs to do something natively (e.g., system overlays, PiP, cast), add a new JavaScript bridge via WebView.addJavascriptInterface.

**Gotchas that bit us building this:**
- Amazon WebView on Fire TV needs `androidx.window:1.3.0` in build.gradle.kts or loadUrl() throws NoClassDefFoundError.
- shouldInterceptRequest runs on a worker thread — don't call view.url or any WebView getter from it. Pre-capture origin on main thread.
- android.net.Uri.getPort() returns -1 for unspecified ports — normalize to scheme default before comparing.
- src/lib/auth/session.ts requireAuth() had to be updated to accept x-device-bearer (previously only getApiUser() did).
- clients/dist/foundry-iptv.apk can be stale relative to the freshly-built one — always sha256sum both after a build.
```

## One last thing

If the next session starts with "clean up the dead code", do the `rm -rf` + `assembleDebug` cycle from the cleanup script. If it starts with anything else, refer to this doc and resume from there.

— Session 2026-04-11, commit `672e137`
