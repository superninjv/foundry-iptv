package com.foundry.iptv

/**
 * Stub for the uniffi-generated bindings from the foundry-core Rust crate.
 *
 * When the Rust crate is ready:
 * 1. Cross-compile foundry-core for the three Android targets:
 *      cargo build -p foundry-core --features uniffi \
 *          --target aarch64-linux-android \
 *          --target armv7-linux-androideabi \
 *          --target x86_64-linux-android
 * 2. Copy the produced .so files into jniLibs/<abi>/.
 * 3. Run uniffi-bindgen to generate this file:
 *      uniffi-bindgen generate src/foundry-core.udl --language kotlin \
 *          --out-dir app/src/main/java/com/foundry/iptv/generated/
 * 4. Delete this stub and import from the generated package.
 *
 * Expected generated surface (mirrors foundry-core::api):
 *
 * class ApiClient(baseUrl: String) {
 *     fun setToken(token: String)
 *     suspend fun listChannels(): List<Channel>
 *     suspend fun getEpg(channelId: String): List<EpgEntry>
 *     suspend fun startStream(channelId: String, quality: StreamQuality): StreamSession
 *     suspend fun stopStream(sessionId: String)
 *     suspend fun getStartup(): StartupConfig
 *     suspend fun getDecks(): List<Deck>
 * }
 *
 * class DeviceAuth {
 *     companion object {
 *         suspend fun exchangePairingCode(baseUrl: String, code: String, label: String): String
 *     }
 * }
 */

// TODO: replace with generated class
object FoundryCore {
    init {
        // System.loadLibrary("foundry_core") // uncomment once .so is present
    }
}
