# Driftlands Steam Demo and iPad Publishing

## Standalone Steam Demo

The Steam demo build packages the existing Vite client and Socket.IO server into an Electron desktop app. Players should be able to launch the app without npm, a browser, localhost setup, or a wallet.

### Build Commands

```bash
npm run steam:demo:build
npm run steam:demo:package:mac
npm run steam:demo:package:win
```

The macOS package is written to:

```text
release/steam-demo/mac-arm64/Driftlands Demo.app
```

The first package is unsigned. Before Steam review, add signing/notarization for public macOS distribution and verify the Windows package on a clean Windows machine.

### Runtime Shape

- Electron starts a bundled local server on `127.0.0.1:3695` by default.
- The Vite client loads from packaged static files.
- The server save file is written under Electron `app.getPath('userData')` as `world-save.json`.
- Local standalone mode uses free landing selection so fresh players can click a valid tile on the start minimap.
- The desktop title screen includes a World panel with:
  - **Solo**: private local server bound to `127.0.0.1`.
  - **Host LAN**: local server bound to `0.0.0.0`, advertised over UDP discovery on port `3696`, with join URLs shown for friends.
  - **Join LAN**: auto-discovers LAN worlds and also supports a manual `http://192.168.x.x:3695` address.
- **Shared**: connects to the hosted Driftlands server URL, defaulting to `https://driftlands.ddns.net`.
- Set `DRIFTLANDS_SHARED_WORLD_URL=https://your-hosted-server.example` before first launch to override the Shared world. `DRIFTLANDS_DESKTOP_SERVER_URL` is still accepted for custom desktop launches, but the runtime local/LAN server URL is not reused as the Shared default.
- Steam demo mode sets:
  - `DRIFTLANDS_BUILD_TARGET=steam-demo`
  - `DRIFTLANDS_DEMO_MODE=1`
  - `SERVER_DEBUG_MODE=0`
  - `SERVER_REQUIRE_LOOPERLANDS_AUTH=0`
  - `SERVER_SETTLEMENT_START_MODE=free`
  - `SERVER_SPAWN_SAFETY=1`
- The title screen defaults to no-wallet play and moves Looperlands wallet access behind extras.
- If the local desktop player already has a colony, the title screen offers **Choose New Landing** to create a fresh local player identity without wiping the saved world.

### Steam Store Checklist

- Create the main Steam app and a separate demo App ID.
- Add real gameplay screenshots only.
- Prepare capsule art, library art, hero art, and icons at the current Steam-required sizes.
- Add a 60-75 second trailer with readable gameplay in the first 5 seconds.
- Use tags such as Colony Sim, Strategy, Base Building, Simulation, Resource Management, Cozy, City Builder, and Singleplayer.
- Complete Steam's content survey, including AI disclosure if any shipped player-facing content used generative AI.
- Add Steam Cloud after the save path is stable.

### Publishing Assets

AI-generated provisional source art and derived Steam/App icons are stored under `assets/publishing/`.

```bash
npm run publishing:assets
```

Generated Steam assets:

- `assets/publishing/steam/header_capsule_920x430.png`
- `assets/publishing/steam/small_capsule_462x174.png`
- `assets/publishing/steam/main_capsule_1232x706.png`
- `assets/publishing/steam/vertical_capsule_748x896.png`
- `assets/publishing/steam/library_capsule_600x900.png`
- `assets/publishing/steam/library_hero_3840x1240.png`
- `assets/publishing/steam/library_header_capsule_920x430.png`
- `assets/publishing/steam/page_background_1438x810.png`
- `assets/publishing/steam/event_cover_800x450.png`
- `assets/publishing/steam/event_header_1920x622.png`

Generated app/icon assets:

- `assets/publishing/icons/driftlands.icns`
- `assets/publishing/icons/driftlands.ico`
- `assets/publishing/icons/steam-app-icon-184x184.jpg`
- `assets/publishing/icons/ipad-app-icon-1024.png`

These assets are good enough for local packaging and early store-page mockups. If they ship publicly, disclose their AI-generated provenance in Steam's content survey and the App Store review notes where applicable.

## Native iPad Feasibility

Capacitor is configured as the first iPad path. This is an online-client target first: the app reuses the Vite client and connects to a hosted Driftlands server.

### iPad Commands

```bash
npm run ipad:build
npm run ipad:sync
npm run ipad:open
```

`npx cap add ios` has created the native project under `ios/`. After `ipad:open`, use Xcode to select an iPad simulator or physical device.

### iPad Notes

- The iPad build uses `VITE_DRIFTLANDS_BUILD_TARGET=ipad` and defaults `VITE_DRIFTLANDS_SERVER_URL` to `https://driftlands.ddns.net`.
- Native builds add safe-area padding and touch-friendly button minimums through the `driftlands-native-app` body class.
- The iPad title screen shows a hosted Shared world URL field; changing it stores the override locally and reloads the web view before connecting.
- Wallet UI is hidden in the iPad build for now.
- Offline iPad play is a later architecture step because the current authoritative simulation still runs in the Node/Socket.IO server.
