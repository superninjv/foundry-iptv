# JNI Libraries

Place cross-compiled `foundry-core` shared libraries here before building the APK.

## Required files

```
jniLibs/
  arm64-v8a/
    libfoundry_core.so      # cargo build --target aarch64-linux-android
  armeabi-v7a/
    libfoundry_core.so      # cargo build --target armv7-linux-androideabi
  x86_64/
    libfoundry_core.so      # cargo build --target x86_64-linux-android
```

## How to build

1. Install the Android NDK (r26 or later) and set `ANDROID_NDK_HOME`.
2. Add the Rust targets:
   ```bash
   rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
   ```
3. Configure `~/.cargo/config.toml` linkers (adjust NDK path):
   ```toml
   [target.aarch64-linux-android]
   linker = "$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android21-clang"

   [target.armv7-linux-androideabi]
   linker = "$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/armv7a-linux-androideabi21-clang"

   [target.x86_64-linux-android]
   linker = "$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/x86_64-linux-android21-clang"
   ```
4. Build (from `clients/`):
   ```bash
   cargo build -p foundry-core --features uniffi \
       --target aarch64-linux-android \
       --target armv7-linux-androideabi \
       --target x86_64-linux-android \
       --release
   ```
5. Copy the `.so` files:
   ```bash
   cp target/aarch64-linux-android/release/libfoundry_core.so jniLibs/arm64-v8a/
   cp target/armv7-linux-androideabi/release/libfoundry_core.so jniLibs/armeabi-v7a/
   cp target/x86_64-linux-android/release/libfoundry_core.so jniLibs/x86_64/
   ```
6. Generate Kotlin bindings and run `./gradlew assembleDebug`.
