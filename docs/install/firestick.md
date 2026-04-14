# FireStick Installation Guide — Foundry IPTV

## Via Downloader App (Recommended for Non-Technical Users)

The free [Downloader](https://www.amazon.com/AFTVnews-com-Downloader/dp/B01N0BP507) app lets you sideload the Foundry IPTV APK in a few taps — no ADB or PC required.

### Prerequisites

Enable "Apps from Unknown Sources" for Downloader:

1. Go to **Settings → My Fire TV → Developer Options**.
2. Enable **Apps from Unknown Sources** (toggle it to "On" for Downloader specifically when prompted).

### Install Steps

1. From the FireStick home screen, open the search bar (magnifying glass) and search for **Downloader**. Install the free app by AFTVnews — it is listed in the Amazon Appstore.
2. Open **Downloader** and enter the APK URL in the URL field:
   ```
   http://iptv.foundry.test/client-apk/foundry-iptv.apk
   ```
   > **Note:** `iptv.foundry.test` is the hostname of your household's Foundry server — it only resolves inside the home network. If your household uses a different hostname, replace it here.
3. Tap **Go**. Downloader downloads the APK and immediately prompts you to install it. Tap **Install**.
4. After installation, tap **Done** (not Open) and use the back button to return to the Downloader home. You can delete the APK file when Downloader offers — it saves space and the app is already installed.
5. Launch **Foundry IPTV** from the FireStick home screen under **Your Apps & Channels** (scroll right on the home row).
6. The first-run screen asks for your **server URL** and a **pairing code**. Generate a pairing code at `/admin/devices` on the Foundry web admin panel, then enter it on the FireStick.

---

## Via ADB Sideload (Power Users)

For users comfortable with `adb` on a PC or Mac.

### Prerequisites

- ADB installed on your computer (`apt install adb` / `brew install android-platform-tools`).
- FireStick on the same network as your computer.
- Developer Options enabled (see above) with **ADB Debugging** turned on.

### Install Steps

1. Find the FireStick's IP: **Settings → My Fire TV → About → Network**.
2. Connect:
   ```bash
   adb connect <firestick-ip>:5555
   ```
   Accept the prompt on the FireStick if it appears.
3. Install the APK (from the workstation after the build agent delivers it):
   ```bash
   adb install /path/to/foundry-iptv.apk
   ```
   Or pull it from the server first:
   ```bash
   curl -O http://iptv.foundry.test/client-apk/foundry-iptv.apk
   adb install foundry-iptv.apk
   ```
4. Launch from the FireStick home screen under **Your Apps & Channels**.
5. Enter server URL and pairing code as described above.

---

## Updating the APK

When a new build is available, the APK at `http://iptv.foundry.test/client-apk/foundry-iptv.apk` is automatically replaced by the Foundry build pipeline. To update on an existing FireStick:

- **Via Downloader:** Repeat the install steps above — Android will offer to update the existing installation.
- **Via ADB:** Re-run `adb install -r foundry-iptv.apk` (the `-r` flag replaces without uninstalling).
