# STATE — Orbital Launcher
Updated: 2026-07-09 (overwrite this file, never append; keep < 60 lines)

## What this is
Electron 43 app. Source: `C:\Users\adaml\Projects\orbital-launcher`.
Installed app: `C:\Program Files\Orbital Launcher` (NSIS one-click, perMachine).
GitHub: https://github.com/AdamLlavelle/orbital-launcher — released: v0.1.0-beta.
Game data: `%APPDATA%\.orbitallauncher` · launcher data: `%APPDATA%\Orbital Launcher`.

## Working (verified)
- Microsoft sign-in (msmc, persistent), launch vanilla + Fabric (tested 26.2, 1.8.9)
- Profiles: per-profile version/loader/mods; premade "Starter" profiles seeded
  (Latest-fabric, 1.16.5-fabric, 1.12.2-forge+OptiFine, 1.8.9-forge+OptiFine)
- 2-step New Profile wizard: name/desc → loader pills (Vanilla/Fabric/Forge)
  + curated versions (newest of each line; floor 1.7.10; Fabric floor 1.16.5)
- Mod browsing: Fabric→Modrinth, Forge→CurseForge (api.curse.tools proxy);
  categories, search, pagination, per-mod version drawer, dep auto-install,
  one-version-per-mod replacement, enable/disable (.jar.disabled), hash-matched
  metadata cards
- Java auto-select from Mojang metadata (8/21/25, Adoptium) — never parse versions
- Custom top-bar UI (nav tabs, account chip), app icon, changelog, beta versioning

## Gated / broken
- Forge LAUNCH is disabled in UI (grayed) — JPMS crash; fix written but UNTESTED.
  → This is step-01. Gates live in src/renderer/app.js (launchSelected guard,
  updatePlayAvailability, openProfileDetail detail-play disable).

## Local-only (committed but NOT pushed — Adam gates all pushes)
- Premade profiles, curated wizard, loader pills, "Checking files" label fix,
  agent docs. GitHub still shows the 0.1.0-beta state.

## Next actions
1. Adam feedback on wizard/premades → polish.
2. step-01: re-enable Forge (when Adam says go).
3. Ship 0.2.0-beta when Adam says "ship it".

## File map (read only what you need)
- src/main.js — ALL backend: auth, java, launch, profiles/premades, Modrinth,
  CurseForge, OptiFine, per-profile mods. Sections have `// ----------` headers.
- src/renderer/app.js — all UI logic · index.html — markup · styles.css — theme
- src/preload.js — IPC bridge (window.feather.*)
- tools/make-icon.js — icon generator · CHANGELOG.md — user-facing history
