package com.foundry.iptv

/**
 * Stub interface for the uniffi-generated Kotlin bindings from foundry-core.
 *
 * ─── HOW TO REPLACE THIS FILE ────────────────────────────────────────────
 * 1. Cross-compile foundry-core for the three Android ABI targets:
 *
 *      cargo build -p foundry-core --features uniffi \
 *          --target aarch64-linux-android   \
 *          --target armv7-linux-androideabi \
 *          --target x86_64-linux-android
 *
 * 2. Copy the produced .so files into jniLibs/<abi>/:
 *      jniLibs/arm64-v8a/libfoundry_core.so
 *      jniLibs/armeabi-v7a/libfoundry_core.so
 *      jniLibs/x86_64/libfoundry_core.so
 *
 * 3. Generate Kotlin bindings from the UDL:
 *
 *      uniffi-bindgen generate \
 *          ../foundry-core/src/foundry-core.udl \
 *          --language kotlin \
 *          --out-dir app/src/main/java/com/foundry/iptv/generated/
 *
 * 4. Delete this file and import from the generated package.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * This stub mirrors the shape that uniffi will produce so the rest of the
 * Kotlin shell compiles against it today.
 */

// TODO: Replace with `uniffi-bindgen generate` output once libfoundry_core.so is built.

data class Channel(
    val id: String,
    val name: String,
    val group: String?,
    val logoUrl: String?,
    val tvgId: String?,
)

data class EpgEntry(
    val channelId: String,
    val start: String,     // RFC 3339
    val end: String,       // RFC 3339
    val title: String,
    val description: String?,
)

data class StreamSession(
    val sid: String,
    val hlsUrl: String,
    val channelId: String,
)

data class StartupConfig(
    val defaultDeckId: String?,
    val defaultViewMode: String,
    val allowUserOverride: Boolean,
)

data class Deck(
    val id: String,
    val name: String,
    val entries: List<Channel>,
)

/**
 * Stub ApiClient — matches the uniffi-generated class surface.
 *
 * All methods throw [UnsupportedOperationException] until the real JNI
 * library is loaded.  Replace this class with the generated one.
 */
class ApiClient(val baseUrl: String) {
    init {
        // TODO: uncomment once libfoundry_core.so is present
        // System.loadLibrary("foundry_core")
    }

    fun setToken(@Suppress("UNUSED_PARAMETER") token: String) {
        throw UnsupportedOperationException("foundry_core JNI library not loaded")
    }

    fun listChannels(category: String? = null): List<Channel> {
        throw UnsupportedOperationException("foundry_core JNI library not loaded")
    }

    fun getEpg(channelId: String): List<EpgEntry> {
        throw UnsupportedOperationException("foundry_core JNI library not loaded")
    }

    fun startStream(channelId: String, quality: String? = null): StreamSession {
        throw UnsupportedOperationException("foundry_core JNI library not loaded")
    }

    fun stopStream(channelId: String, sid: String) {
        throw UnsupportedOperationException("foundry_core JNI library not loaded")
    }

    fun getStartup(): StartupConfig {
        throw UnsupportedOperationException("foundry_core JNI library not loaded")
    }

    fun getDecks(): List<Deck> {
        throw UnsupportedOperationException("foundry_core JNI library not loaded")
    }
}

object DeviceAuth {
    /**
     * Exchange a pairing code for a long-lived device token.
     * Blocking — must be called from an IO-dispatcher coroutine.
     */
    fun exchangePairingCode(baseUrl: String, code: String, label: String): String {
        throw UnsupportedOperationException("foundry_core JNI library not loaded")
    }
}
