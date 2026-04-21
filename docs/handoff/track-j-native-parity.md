# Handoff — Track J: full native parity for the FireStick Kotlin client

Paste this entire doc into a fresh Claude Code session at `~/projects/foundry-iptv` as the first message. Everything you need is here.

## TL;DR

The prior session built a working FireStick APK (Rust `foundry-core` + uniffi + Kotlin/Compose TV + ExoPlayer) that can list channels and play one. That's it. The web app has 15+ features (guide, VOD, series, decks w/ warm-stream hotswap, multiview, lists, favorites, search, settings, now-playing OSD, channel logos, category filter, ...) and the Kotlin client has **none of them**. Jack picked "Option A — full native parity" over WebView hybrid. Your job is to close that gap.

Parallelize aggressively across 4 waves of background agents in isolated worktrees. Minimum 10 agents total. Merge back into `wave-1-integration` as each wave completes.

## Immediate first actions

```bash
cd ~/projects/foundry-iptv
git branch --show-current            # should be wave-1-integration
git log --oneline master..HEAD | head -20
cat docs/handoff/track-j-native-parity.md   # this file, for your own reference
```

**Read first, in order**:

1. `/home/jack/.claude/plans/synchronous-wishing-spark.md` — the big plan from the prior session. Track J is an extension of this plan. Append Track J to it at the bottom once you've scoped it yourself.
2. `/home/jack/.claude/projects/-home-jack-projects-foundry-iptv/memory/MEMORY.md` — memory index.
3. `/home/jack/.claude/projects/-home-jack-projects-foundry-iptv/memory/project_product_shape.md` — locks in server-box + Rust clients model, "households bring their own M3U", single-instance-per-household.
4. `/home/jack/.claude/projects/-home-jack-projects-foundry-iptv/memory/project_device_setup_vision.md` — admin-driven FireStick install flow; Track I wizard is the MVP of this.
5. `/home/jack/.claude/projects/-home-jack-projects-foundry-iptv/memory/feedback_server_render_everything.md` and `feedback_parallelize_implementation.md` — guardrails.
6. `clients/foundry-core/src/ffi.rs` — the FFI façade. This is where you'll add 15+ new methods.
7. `clients/foundry-core/src/foundry_core.udl` — the uniffi interface definition. Every new method + type gets declared here first.
8. `clients/foundry-android/app/src/main/java/com/foundry/iptv/MainActivity.kt` — the top-level NavHost with only three destinations today.
9. `clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/ChannelList.kt` — the entire "channel grid" at present.
10. `src/components/decks/WarmDeckProvider.tsx` — the web-side warm-stream pool. You'll port this to Kotlin with an `ExoPlayer` pool in Wave 3.
11. `src/lib/threadfin/client.ts`, `scripts/ingest-epg.ts`, `src/app/api/channels/route.ts`, `src/app/api/epg/[channelId]/route.ts`, `src/app/api/decks/route.ts` — every API the Kotlin shell will consume.

## Current state — what you can and cannot assume

### Infrastructure (all working)

- `wave-1-integration` branch, 17 commits ahead of master, **not pushed**.
- foundry-01 (`10.0.0.3`, Ubuntu) runs `iptv-dev.service` (systemd) which serves the Next.js app on port 3003. Mutagen sync (workstation → `/srv/dev/foundry-iptv`) is live — edits on the workstation propagate in under 1s. Caddy at `iptv.foundry.test` reverse-proxies to it.
- foundry-01 has adb installed at `/usr/bin/adb` (v34.0.4-debian), 52,033 channels in the DB, migrations 001–010 all applied, 2 admin users (`jack@foundry.local`, `justin@foundry.local`).
- Caddy serves the APK at `http://iptv.foundry.test/client-apk/foundry-iptv.apk` from `/srv/foundry-apk/` on foundry-01. The helper `/srv/foundry-apk/publish.sh` can generate a SHA-256 sidecar after a new APK is rsynced up.
- ts2hls sidecar is running (rebuilt with `POST /session/:sid/quality` quality-swap endpoint from Track C). `docker ps` on foundry-01 confirms.
- Two Fire TVs are on the LAN with ADB authorized to the workstation and the app installed:
  - `10.0.0.170` — FireStick 4K Max (karat, `armeabi-v7a` primary ABI despite 64-bit SoC)
  - `10.0.0.144` — Fire TV Stick Lite (almond, `armeabi-v7a`)
- Both devices have pre-provisioned credentials in `com.foundry.iptv/shared_prefs/foundry_prefs.xml` — they boot straight to the channel list without pairing. Token: `7e26b9ab8e3e960324d9b8d6aa53f3fe1909dadf98e5b1924df110ea0dceca8d` (corresponds to `iptv_device_tokens` row for "Living Room FireStick").
- Jack confirmed at the end of the session: **clicking a channel starts a stream and ExoPlayer plays it.** The full pipeline works end-to-end.

### Workstation toolchain (all installed)

- Rust 1.75+, `cargo-ndk` v4.1.2, android targets (`aarch64-linux-android`, `armv7-linux-androideabi`, `x86_64-linux-android`, `i686-linux-android`).
- JDK 21 Adoptium at `~/.local/jdk-21` (do NOT use system `java` — that's JDK 26 and breaks AGP).
- Android SDK at `~/Android/Sdk` with `platform-tools` (adb 37.0.0), `ndk/26.3.11579264`, `build-tools/34.0.0`, `platforms/android-34`.
- Gradle wrapper 8.11 already committed under `clients/foundry-android/gradlew`.

**Every build command must set these env vars**:

```bash
export JAVA_HOME=$HOME/.local/jdk-21
export ANDROID_HOME=$HOME/Android/Sdk
export ANDROID_SDK_ROOT=$HOME/Android/Sdk
export ANDROID_NDK_HOME=$HOME/Android/Sdk/ndk/26.3.11579264
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH
```

### What's in the Kotlin client today

- `MainActivity.kt`: NavHost with `PAIRING` / `CHANNEL_LIST` / `NOW_PLAYING(hlsUrl)` destinations.
- `ui/Pairing.kt`: first-run pairing. Fixed focus trap with `imeAction=Done + KeyboardActions(onDone=doPair)`.
- `ui/ChannelList.kt`: flat `LazyColumn` of 52k channels. `FocusRequester` on first item. No logos, no categories, no EPG, no filtering.
- `player/ExoPlayerScreen.kt`: single `ExoPlayer` + `HlsMediaSource`, no OSD, no channel up/down, no deck navigation.
- `com.foundry.iptv.core` package: uniffi-generated bindings (1678 lines, JNA-based), points at `libfoundry_core.so` (configured via `uniffi.toml` `cdylib_name = "foundry_core"`).
- `jniLibs/arm64-v8a/`, `jniLibs/armeabi-v7a/`, `jniLibs/x86_64/libfoundry_core.so` — all 3 ABIs prebuilt, committed.

### What's in foundry-core FFI today

Only these are exposed to Kotlin:

- `ApiClient(base_url)` constructor
- `set_token(token)`
- `list_channels()` → `Vec<Channel>` (no category filter, no pagination)
- `start_stream(channel_id)` → `StreamSession`
- `stop_stream(channel_id, sid)`
- `exchange_pairing_code(base_url, code, label)` → `String` (namespace function)

That's it. `foundry-core/src/api.rs` (the real async client) has more methods internally but they're not FFI-wrapped.

### Known issues to preserve

- **Nav bar tooltip hydration**: fixed with `useEffect`-based client-only mount in `src/components/ui/Tooltip.tsx`. Do not revert.
- **Next.js 16 middleware deprecation warning**: the dev server prints "middleware file convention is deprecated, use proxy instead". Harmless; ignore.
- **NordPass `data-np-mark` attr**: benign, browser-extension injected. Ignore.
- **Fire TV Stick Lite is only `armeabi-v7a`**: don't rely on `arm64-v8a`-only features in foundry-core.
- **hls.js on Silk web prefers MSE over native HLS**: unrelated to native client, don't re-add `canPlayType` fallback to `VideoPlayer.tsx`.

## Track I is merged and useful

The Device Setup Wizard (`/admin/devices/setup/firestick`) is live on `wave-1-integration`. It drives `adb connect → install → provision → launch` from the admin browser. Use it to test your APK builds on new devices without the run-as dance — no more manual logcat investigation.

Limitation: MVP only. No ARP scan (admin types the IP), no screenshots, no multi-device branching. Full-scope upgrades are future work.

## Track J — the job

**Goal**: every feature that exists in the web app exists in the Kotlin TV client, with focus-native Compose TV UI, ExoPlayer playback, and warm-stream deck hotswap.

**Success criteria**:

1. A new FireStick paired via Track I can navigate to Live, Guide, VOD, Series, Decks, Multiview, Lists, Search, Settings with D-pad — no web UI anywhere.
2. Decks page has full warm-stream hotswap using a Kotlin `WarmPlayerPool` of ExoPlayers that mirrors the web's `WarmDeckProvider` behavior. D-pad Left/Right hot-swaps between entries with visible latency < 200 ms on FireStick 4K Max.
3. Multiview renders 2×2 and 3×3 grids of ExoPlayer surfaces, all playing, only focused tile has audio.
4. Channel logos load via Coil from `/api/img-proxy?u=...&w=80`.
5. Back button always works and never dead-ends. Cold start lands on last-visited screen.
6. `cargo check -p foundry-core --features uniffi` + `./gradlew assembleDebug` pass clean throughout.
7. Jack tests on both FireSticks and confirms every tab works.

**Estimate**: 2–3 focused sessions of parallel agent work. Probably 4–6 hours of agent runtime total if you parallelize well.

## The parallelization plan

Use **worktree isolation** for every agent. File-ownership boundaries are listed per agent so they never touch the same files. Merge each wave back to `wave-1-integration` before launching the next (blocking waves) or run independent tracks concurrently.

### Wave 1 — foundation (4 agents in parallel, ~1h)

Everything in Wave 1 can run concurrently. Wave 2 depends on the FFI expansion from Wave 1A being merged.

**W1-A — foundry-core FFI expansion** (biggest, blocks Wave 2)
- Owns: `clients/foundry-core/src/{ffi.rs,foundry_core.udl,lib.rs,models.rs,api.rs}`, regenerates Kotlin bindings at `clients/foundry-android/app/src/main/java/com/foundry/iptv/core/foundry_core.kt`, cross-compiles all 3 ABIs via `cargo ndk`.
- Adds to UDL: `Category`, `EpgEntry`, `VodItem`, `SeriesItem`, `Deck`, `DeckEntry`, `List`, `SearchResult`, `StartupConfig`, `UserSettings`.
- Adds to UDL: `ApiClient` methods — `list_categories`, `list_channels_by_category`, `get_epg(channel_id, hours)`, `list_vod(category)`, `get_vod_detail`, `list_series(category)`, `get_series_detail`, `list_decks`, `get_deck(id)`, `start_deck_stream(deck_id, entry_index, quality)`, `change_quality(sid, quality)`, `list_lists`, `list_list_channels`, `add_to_list(list_id, channel_id)`, `list_favorites`, `toggle_favorite(channel_id)`, `search(query)`, `ai_search(query)`, `get_startup`, `get_settings`.
- Wraps each in the same blocking-tokio pattern as existing methods. Error mapping already handled in `ffi::ApiError`.
- Deliverable: `cargo check -p foundry-core --features uniffi` clean, `./gradlew assembleDebug` still builds (no Kotlin call sites use the new methods yet, but the class surface expands).

**W1-B — Compose TV hub shell**
- Owns: `clients/foundry-android/app/src/main/java/com/foundry/iptv/{MainActivity.kt,ui/hub/*,ui/theme/*,ui/focus/*}`.
- Replaces the current 3-destination NavHost with a top-level `FoundryHub` composable: a horizontal rail of 8 section tabs (Live / Guide / VOD / Series / Decks / Multiview / Search / Settings) at the top, content below. D-pad Up/Down jumps between rail and content.
- Each tab initially renders a placeholder `ComingSoonScreen(sectionName)` — Wave 2 agents replace them.
- Adds shared focus helpers: `rememberFirstFocus()`, `KeyboardHandler` wrapper that intercepts Back / Menu / Play keys.
- Adds a theme file with Foundry orange accent, tv-material3 colors, Compose TV typography.
- Deliverable: `assembleDebug` passes, installed APK shows the hub rail with placeholders, D-pad traverses tabs.

**W1-C — Image loading infrastructure**
- Owns: `clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/image/*`, `app/build.gradle.kts` (add Coil 3 dep).
- Adds Coil 3 (`io.coil-kt.coil3:coil-compose`) with a `FoundryImageLoader` singleton configured for: disk cache in `cacheDir/img`, memory cache 25% of app RAM, HTTP client pointed at the LAN, no TLS verification (LAN HTTP only).
- Creates `ChannelLogo(channel: Channel, size: Int)` composable that loads `{baseUrl}/api/img-proxy?u={channel.logoUrl}&w={size}` with a placeholder + error fallback.
- Deliverable: `ChannelLogo` works in a test composable with a real channel URL from the server.

**W1-D — PlayerHost refactor + OSD**
- Owns: `clients/foundry-android/app/src/main/java/com/foundry/iptv/player/*`.
- Refactors `ExoPlayerScreen.kt` into a reusable `PlayerHost(hlsUrl, channelInfo, onBack, onChannelUp, onChannelDown)` that embeds ExoPlayer in any screen.
- Adds `NowPlayingOverlay` that fades in on focus-restore / any keypress, shows channel name + current program title + program progress bar, auto-hides after 3s. Uses `log::info!` from Rust via an `on_program_tick` FFI callback when the current program changes — OR just polls the EPG every 30s.
- Adds D-pad Up/Down channel-up/channel-down hooks via the `onChannelUp`/`onChannelDown` lambdas.
- Deliverable: `PlayerHost` embeddable, OSD renders correctly on a test channel.

### Wave 2 — content screens (4 agents in parallel, depends on W1-A + W1-B + W1-C merged, ~1.5h)

Each agent owns one feature area and its FFI consumer code. None overlap.

**W2-A — Live grid + EPG overlay**
- Owns: `clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/live/*`, `ui/guide/*`.
- `LiveScreen`: grid of `ChannelCard` tiles (logo + name + current program) grouped by category. Category chip row at top. Uses `FoundryImageLoader` from W1-C and `list_categories` / `list_channels_by_category` from W1-A.
- `GuideScreen`: horizontal time grid, channels as rows, 30-min slots as columns, next 24h window. Focus traversal works with D-pad: Left/Right = time, Up/Down = channel. OK on a cell starts playback via `PlayerHost` (W1-D).
- Cap memory: virtualize channel rows (only render ~20 at a time).
- Deliverable: both screens installed in the hub, D-pad browsable, playback from either works.

**W2-B — VOD + Series**
- Owns: `clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/vod/*`, `ui/series/*`.
- `VodScreen`: category rail + poster grid. `VodDetailScreen`: hero image + metadata + Play button → `PlayerHost`.
- `SeriesScreen`: grid of show posters. `SeriesDetailScreen`: seasons row + episodes list. Tapping an episode starts playback.
- Uses `list_vod`, `get_vod_detail`, `list_series`, `get_series_detail` from W1-A.
- Deliverable: both sections browsable, playback works for VOD and series episodes.

**W2-C — Search (text + AI)**
- Owns: `clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/search/*`.
- `SearchScreen`: text input field at top, two toggles for "Channels" / "Guide" / "VOD". Optional "AI Search" toggle that routes to `ai_search` instead of `search`.
- Result list shows matching channels/programs/VOD items with thumbnails. OK launches playback.
- Uses `search(query)` and `ai_search(query)` from W1-A.
- Deliverable: typing a query shows results within 500 ms for text search.

**W2-D — Lists + Favorites + Settings**
- Owns: `clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/lists/*`, `ui/favorites/*`, `ui/settings/*`.
- `ListsScreen`: grid of user-defined lists with channel counts. Tap opens `ListDetailScreen` which is basically a filtered LiveScreen.
- `FavoritesScreen`: shortcut list of favorited channels. A star toggle on every ChannelCard adds/removes.
- `SettingsScreen`: shows device info (label, token ID, platform), "unpair" button (revokes the device token), "about" section with version.
- Uses `list_lists`, `list_list_channels`, `list_favorites`, `toggle_favorite`, `get_settings` from W1-A.
- Deliverable: CRUD works for lists + favorites; settings displays device info.

### Wave 3 — the hero feature (3 agents in parallel, ~2h)

**W3-A — WarmPlayerPool + Decks**
- Owns: `clients/foundry-android/app/src/main/java/com/foundry/iptv/player/WarmPlayerPool.kt`, `ui/decks/*`.
- This is the **most technically challenging** agent. Port `src/components/decks/WarmDeckProvider.tsx` conceptually to Kotlin/ExoPlayer.
- `WarmPlayerPool`: a singleton holding `Map<channelId, ExoPlayer>` with LRU cap of 6 on FireStick 4K Max, 4 on Lite. Each entry starts with `prepare()` + `playWhenReady = false`. Only the focused channel has `volume = 1.0` and `playWhenReady = true`. Promote/demote swaps which player owns the `PlayerView` Surface.
- On quality change, calls FFI `change_quality(sid, quality)` (new in W1-A) and re-preps the ExoPlayer with the new HLS URL. ~300ms hitch expected.
- `DeckScreen`: horizontal row of deck-entry tiles, D-pad Left/Right cycles between them, focused tile mounts into a full-screen `PlayerView` that's backed by the warm pool.
- `DeckListScreen`: grid of user's decks, tap to open.
- Uses `list_decks`, `get_deck`, `start_deck_stream` from W1-A.
- Deliverable: 4-entry deck on FireStick 4K Max swaps in <200 ms of visible latency, measured via Logcat `NowPlayingOverlay` timestamp.

**W3-B — Multiview**
- Owns: `clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/multiview/*`.
- Depends on the `WarmPlayerPool` from W3-A — shares the same pool, just renders multiple `PlayerView` surfaces simultaneously.
- 2×2 and 3×3 layout presets. Focused cell is the only one with audio (pool's `setVolume(player, 0f or 1f)` per tile).
- D-pad Up/Down/Left/Right moves focus within the grid; OK "zooms" into that cell as a full-screen single.
- Deliverable: 4-tile multiview runs on FireStick 4K Max without frame drops; 9-tile may need quality downgrade to 360p.

**W3-C — Now Playing deck / watch history**
- Owns: `clients/foundry-android/app/src/main/java/com/foundry/iptv/ui/history/*`, `ui/nowplaying/*`.
- `HistoryScreen`: recently watched channels + VOD. Populated from server API `GET /api/history`.
- `NowPlayingDeck`: a "return to last" shortcut that resumes the most recent channel with a single OK press from the hub.
- Uses `list_watch_history` (add to W1-A if missing).
- Deliverable: history persists across app restarts.

### Wave 4 — integration + polish (1 agent, ~1h)

**W4-A — Glue everything together**
- Wires each Wave 2 + Wave 3 screen into the `FoundryHub` rail from W1-B.
- Audits focus traversal: cold-start always lands on Live, Back always works, deep-linking from notifications (future) has a place to land.
- Fixes any merge conflicts from the parallel waves.
- Makes sure `./gradlew assembleDebug` + `cargo check --features uniffi` both pass after merge.
- Rebuilds the APK, copies to `clients/dist/foundry-iptv.apk`, runs `rsync ... jack@10.0.0.3:/srv/foundry-apk/` + `publish.sh` so it's live at `http://iptv.foundry.test/client-apk/foundry-iptv.apk`.
- Installs on both FireSticks via ADB, relaunches, takes screenshots, reports results.
- Deliverable: both FireSticks running the new APK with every section accessible, screencaps committed to `docs/screenshots/firetv/`.

## File-ownership map (critical for parallelization)

Don't let any two concurrent agents touch the same file. Here's the full map:

```
clients/foundry-core/
  src/ffi.rs                          — W1-A only
  src/foundry_core.udl                — W1-A only
  src/models.rs                       — W1-A only
  src/api.rs                          — W1-A only
  src/lib.rs                          — W1-A only

clients/foundry-android/app/src/main/java/com/foundry/iptv/
  MainActivity.kt                     — W1-B, then W4-A
  core/foundry_core.kt                — W1-A regenerates; nobody else edits
  ui/hub/                             — W1-B
  ui/theme/                           — W1-B
  ui/focus/                           — W1-B
  ui/image/                           — W1-C
  ui/live/                            — W2-A
  ui/guide/                           — W2-A
  ui/vod/                             — W2-B
  ui/series/                          — W2-B
  ui/search/                          — W2-C
  ui/lists/                           — W2-D
  ui/favorites/                       — W2-D
  ui/settings/                        — W2-D
  ui/decks/                           — W3-A
  ui/multiview/                       — W3-B
  ui/history/                         — W3-C
  ui/nowplaying/                      — W3-C
  player/PlayerHost.kt                — W1-D
  player/NowPlayingOverlay.kt         — W1-D
  player/WarmPlayerPool.kt            — W3-A
  player/ExoPlayerScreen.kt           — delete in W1-D once PlayerHost replaces it

clients/foundry-android/app/src/main/res/
  values/themes.xml                   — W1-B (theme polish)
  values/strings.xml                  — any wave can append, use replace_all sparingly
```

## Agent brief template

When you spawn each wave-agent, hand it these invariants:

```
You are implementing <W?-?>: <feature name>.

Plan reference: /home/jack/.claude/plans/synchronous-wishing-spark.md
Memory: /home/jack/.claude/projects/-home-jack-projects-foundry-iptv/memory/MEMORY.md

You are in a git worktree branched from wave-1-integration. Commit when done.

Files you own: <explicit list from the ownership map>
Files you must NOT touch: <listed other wave areas>

Environment (every build command):
  export JAVA_HOME=$HOME/.local/jdk-21
  export ANDROID_HOME=$HOME/Android/Sdk
  export ANDROID_NDK_HOME=$HOME/Android/Sdk/ndk/26.3.11579264
  export PATH=$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH

Acceptance: ./gradlew assembleDebug passes. <feature-specific criteria>.

Report under 500 words: files changed, build status, any stubs left for future agents, measured perf numbers if applicable.
```

## When you're done

1. Merge all wave branches back to `wave-1-integration`.
2. Run the final APK rebuild + rsync + FireStick reinstall.
3. Ask Jack to test each section on the Fire TV Stick Lite at 10.0.0.144 (hardest hardware — if it works there it works everywhere).
4. Update `/home/jack/.claude/plans/synchronous-wishing-spark.md` with a `## Track J — COMPLETE` section.
5. Save a closing handoff memory at `project_native_client_complete.md` if everything lands.

## Risks and gotchas

- **Focus traversal between composables is hard on Compose TV.** `FocusRequester` + `LaunchedEffect` worked for ChannelList; the hub rail in W1-B will need a more structured `focusGroup` + `focusRestorer` approach.
- **ExoPlayer Surface handoff is tricky**. When the WarmPlayerPool reassigns which ExoPlayer owns a PlayerView, you must call `exoPlayer.setVideoSurfaceView(null)` on the old one BEFORE attaching the new one, or you get a flash of black. This is the main source of the 200ms hotswap latency.
- **Coil image caching**: on Fire TV Stick Lite the 25% memory cap is <100 MB. Be conservative or logos OOM on a 52k list — don't cache full list at once, use Coil's disk cache + lazy load.
- **tv-foundation 1.0.0-rc01 stripped TvLazyColumn**. Use standard `LazyColumn` + manual focus management.
- **uniffi 0.28 async methods**: uniffi has experimental async support but we're using blocking-wrappers-on-tokio everywhere. Stick with that pattern — don't try to expose async Rust methods directly unless you upgrade uniffi and figure out the Kotlin coroutine bridge.
- **ARM build target**: FireStick Lite reports `armeabi-v7a` as primary ABI. Always cross-compile all 3 (`arm64-v8a`, `armeabi-v7a`, `x86_64`) or you'll break one device.
- **Testing loop**: every code change → rebuild native (~30s) → regenerate uniffi (~5s) → gradle (~15s) → adb install (~10s) → force-stop + launch (~3s). Budget ~70s per iteration. Batch changes.

## Key commands cheat sheet

```bash
# Rebuild Rust for all 3 Android ABIs
cd ~/projects/foundry-iptv/clients
cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 \
  -o foundry-android/app/src/main/jniLibs \
  build -p foundry-core --features uniffi --release

# Regenerate Kotlin bindings
cargo run -p foundry-core --features uniffi --bin uniffi-bindgen -- \
  generate foundry-core/src/foundry_core.udl \
  --language kotlin \
  --out-dir foundry-android/app/src/main/java/

# Build APK
cd foundry-android
./gradlew assembleDebug --no-daemon

# Stage + deploy + install on both FireSticks
cp app/build/outputs/apk/debug/app-debug.apk ~/projects/foundry-iptv/clients/dist/foundry-iptv.apk
rsync -av ~/projects/foundry-iptv/clients/dist/foundry-iptv.apk jack@10.0.0.3:/srv/foundry-apk/
ssh jack@10.0.0.3 /srv/foundry-apk/publish.sh
for ip in 10.0.0.170 10.0.0.144; do
  adb connect $ip:5555
  adb -s $ip:5555 install -r ~/projects/foundry-iptv/clients/dist/foundry-iptv.apk
  adb -s $ip:5555 shell 'am force-stop com.foundry.iptv && am start -n com.foundry.iptv/.MainActivity'
done

# Watch the Rust log stream during testing
adb -s 10.0.0.144:5555 logcat -s foundry_core:V
```

## Good luck

The hardest agents are W1-A (largest FFI expansion) and W3-A (warm-stream pool with ExoPlayer surface handoff). Get those right and everything else is wiring. Parallelize fearlessly — the file-ownership map is designed so every wave's agents can run concurrently without touching each other's code.

— Previous session, 2026-04-11
