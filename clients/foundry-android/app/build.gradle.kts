plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.foundry.iptv"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.foundry.iptv"
        minSdk = 22          // Fire TV Stick 4K (API 22+)
        targetSdk = 34
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
    val composeBom = platform("androidx.compose:compose-bom:2024.04.00")
    implementation(composeBom)

    // Jetpack Compose TV
    implementation("androidx.tv:tv-foundation:1.0.0-alpha10")
    implementation("androidx.tv:tv-material:1.0.0-rc01")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.activity:activity-compose:1.9.0")

    // ExoPlayer / Media3 for HLS playback
    val media3Version = "1.3.1"
    implementation("androidx.media3:media3-exoplayer:$media3Version")
    implementation("androidx.media3:media3-ui:$media3Version")
    implementation("androidx.media3:media3-exoplayer-hls:$media3Version")

    // Networking
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // TODO: uncomment when foundry-core uniffi bindings are generated
    // implementation(fileTree(mapOf("dir" to "../jniLibs/jar", "include" to listOf("*.jar"))))

    debugImplementation("androidx.compose.ui:ui-tooling")
}
