# Upstream integration baseline

This repository incorporates the MIT-licensed application source from [bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view).

- Imported upstream revision: `a725178e0f9f2748fcf5c6d09f66f74b1626d599` (2026-10-30).
- The upstream source is retained in this repository so production builds are reproducible; Android builds do not silently download and overwrite a moving upstream branch.
- Local adaptation: Capacitor Android packaging, EL OJO DE DIOS app name/icon, Spanish document metadata, and native API routing to the Vercel provider backend.
- Keep upstream `LICENSE`, `DATA_SOURCES.md`, `SECURITY.md`, and `THIRD_PARTY_NOTICES.md` with the application. Provider data and camera operators have separate terms and attribution requirements.

To update upstream deliberately, review the upstream commit and data-source/license changes first, then import that exact revision and run the upstream doctor, unit tests, boundary checks, web build, and Android build.
