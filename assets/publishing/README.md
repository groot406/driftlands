# Driftlands Publishing Assets

Generated source art lives in `assets/publishing/source/`.

- `driftlands-steam-key-art-source.png`: wide no-text key art for Steam capsules, hero art, event art, and page background crops.
- `driftlands-app-icon-source.png`: square no-text icon source for app icons, shortcut icons, and vertical crops.

Regenerate derived assets with:

```bash
npm run publishing:assets
```

Derived outputs:

- `assets/publishing/steam/`: Steam capsule, library, page background, and event image sizes.
- `assets/publishing/icons/driftlands.icns`: macOS Electron package icon.
- `assets/publishing/icons/driftlands.ico`: Windows Electron package icon.
- `assets/publishing/icons/steam-app-icon-184x184.jpg`: Steam community/client app icon.
- `assets/publishing/icons/ipad-app-icon-1024.png`: iPad/App Store source icon.

These are AI-generated provisional publishing assets. If any of them ship on Steam or the App Store, include that provenance in the relevant content disclosure and replace them with final hand-composed art if brand/logo readability becomes a store-page concern.
