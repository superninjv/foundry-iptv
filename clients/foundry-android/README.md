# foundry-android

Kotlin/Jetpack Compose TV shell for Foundry IPTV. Targets FireStick (aarch64 + armv7) and
Android TV boxes (x86_64). Uses ExoPlayer (Media3) for HLS playback and links against the
`foundry-core` Rust crate via uniffi-generated JNI bindings.

## Prerequisites

- Android Studio Iguana (2023.2) or later
- Android NDK r26+
- JDK 17
- Kotlin 1.9.x
- Rust toolchain + Android targets (see `jniLibs/README.md`)

## First-run setup

1. Open `foundry-android/` in Android Studio.
2. Sync Gradle (it will download dependencies automatically).
3. Build and place the `foundry-core` JNI libraries as described in `jniLibs/README.md`.
4. Uncomment the `jniLibs.srcDirs` line in `app/build.gradle.kts`.
5. Uncomment `System.loadLibrary("foundry_core")` in `FoundryCore.kt`.
6. Run `./gradlew assembleDebug` or press Run in Android Studio.

## Fire TV sideload

```bash
adb connect <firetv-ip>
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Keystore

For release builds, place `foundry-release.jks` in `app/` and add to `local.properties`:
```
storeFile=foundry-release.jks
storePassword=...
keyAlias=foundry
keyPassword=...
```
`local.properties` is git-ignored.
