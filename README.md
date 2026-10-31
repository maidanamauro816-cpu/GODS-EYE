# GOD'S EYE

Android application for worldwide geospatial exploration, based on the public CesiumJS + Vite architecture used by the upstream God’s Eye View project, packaged as an installable Android APK with Capacitor.

## Current implementation
- Interactive 3D Earth using CesiumJS.
- OpenStreetMap global imagery (internet required).
- HAARP research facility marker in Gakona, Alaska (ground installation, not a satellite).
- ISS orbital position using public CelesTrak TLE data and satellite.js.
- Android APK build via GitHub Actions.

## Build
Push to `main` or run **Actions → Build Android APK → Run workflow**. The debug APK is uploaded as the `gods-eye-debug-apk` artifact.

## Data limitations
Flight, maritime AIS, weather and other satellite feeds require separate providers, keys, rate-limit handling and provider terms. They are not represented as live until connected and verified. This app is informational, not for navigation or emergency use.

## Credits
Inspired by the open-source geospatial architecture of [God’s Eye View](https://github.com/bilawalsidhu/gods-eye-view). CesiumJS, OpenStreetMap, CelesTrak, satellite.js and Capacitor retain their respective licenses and terms. This project is independent and is not affiliated with the upstream author.
