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
        minSdk = 22          // Fire TV Stick 4K (API 22+)
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

    // Location of the cross-compiled foundry-core .so files.
    // Uncomment and adjust once the Rust crate is built for Android targets.
    // sourceSets["main"].jniLibs.srcDirs("../jniLibs")
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)

    // Jetpack Compose TV (pinned as per spec)
    implementation("androidx.tv:tv-foundation:1.0.0")
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
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // TODO: uncomment when foundry-core uniffi bindings are generated
    // implementation(fileTree(mapOf("dir" to "../jniLibs/jar", "include" to listOf("*.jar"))))

    debugImplementation("androidx.compose.ui:ui-tooling:1.7.5")
}
