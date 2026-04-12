plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.foundry.iptv"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.foundry.iptv"
        minSdk = 23          // Fire TV Stick 4K (API 23+; tv-foundation requires API 23)
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        // ABI filters for the JNI library from foundry-core.
        // Must match the architectures built by `cargo build --target ...`.
        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    buildFeatures {
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    // Cross-compiled foundry-core .so files live under app/src/main/jniLibs/<abi>/
    // (the Android Gradle Plugin's default location), so no override needed here.
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)

    // Jetpack Compose TV (pinned as per spec)
    implementation("androidx.tv:tv-foundation:1.0.0-rc01")
    implementation("androidx.tv:tv-material:1.0.0")
    implementation("androidx.compose.ui:ui:1.7.5")
    implementation("androidx.compose.ui:ui-tooling-preview:1.7.5")
    implementation("androidx.activity:activity-compose:1.9.3")

    // Material3 (needed for OutlinedTextField in pairing screen)
    implementation("androidx.compose.material3:material3")

    // Navigation for Compose
    implementation("androidx.navigation:navigation-compose:2.8.4")

    // ExoPlayer / Media3 for HLS playback (pinned as per spec)
    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("androidx.media3:media3-ui:1.4.1")
    implementation("androidx.media3:media3-exoplayer-hls:1.4.1")
    implementation("androidx.media3:media3-datasource:1.4.1")

    // Networking
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Coil 3 — remote image loader used by ChannelLogo / VOD posters / series art.
    // network-okhttp pulls in the OkHttp-backed fetcher so we reuse the same HTTP
    // stack that the rest of the app already ships.
    implementation("io.coil-kt.coil3:coil-compose:3.0.4")
    implementation("io.coil-kt.coil3:coil-network-okhttp:3.0.4")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // AppCompat — provides Theme.AppCompat.Leanback required by the manifest theme.
    implementation("androidx.appcompat:appcompat:1.7.0")

    // Required by Amazon WebView (Fire TV) for device-posture detection.
    // Without this, loadUrl() throws NoClassDefFoundError for
    // androidx.window.extensions.core.util.function.Consumer and the app
    // crashes on first navigation.
    implementation("androidx.window:window:1.3.0")

    // JNA — uniffi-generated Kotlin bindings use JNA for the native FFI shim.
    // Use the "@aar" variant so AGP unpacks the Android-specific .so bundle.
    implementation("net.java.dev.jna:jna:5.14.0@aar")

    debugImplementation("androidx.compose.ui:ui-tooling:1.7.5")
}
