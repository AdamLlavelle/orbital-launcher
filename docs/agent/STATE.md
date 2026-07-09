# STATE — Orbital Launcher
Updated: 2026-07-09 (overwrite this file, never append; keep < 70 lines)

## What this is
Electron 43 Minecraft launcher. Source: `C:\Users\adaml\Projects\orbital-launcher`.
Installed app: `C:\Program Files\Orbital Launcher` (NSIS one-click, perMachine).
GitHub: https://github.com/AdamLlavelle/orbital-launcher.
Game data: `%APPDATA%\.orbitallauncher` · launcher data: `%APPDATA%\Orbital Launcher`.
Built entirely by AI, directed by Adam (attribution in README + releases).

## Mission for next session
Adam's take: "looks great, but still like a small project, not the real deal."
Next session = elevate it from hobby-tier to a serious, polished client
(depth, robustness, features that rival Lunar/Prism/Modrinth App). Brainstorm
scope with him first; then update ROADMAP into a real plan before building.

## Working & verified
- Microsoft sign-in (msmc, persistent, empty-profile retry guard)
- Launch: Vanilla, Fabric, Forge all work. Forge = one-time headless installer
  + classpath fix (GOTCHAS #9). Java 8/21/25 auto-picked from Mojang metadata.
- Profiles: per-profile version/loader/mods; "Starter" premades (Latest+1.16.5
  Fabric, 1.12.2+1.8.9 Forge w/ OptiFine). 2-step wizard (details → loader
  pills + curated version grid; Advanced toggle = full catalog per loader).
- Mods: Fabric→Modrinth, Forge→CurseForge (curse.tools proxy). Categories,
  search, pagination, per-mod version drawer, dep auto-install, one-version-
  per-mod, enable/disable (.jar.disabled), hash-matched metadata cards.
- Skin editor (account chip): 3D skinview3d preview, Classic/Slim toggle
  (local model swap, minimal API calls — see GOTCHAS #12), PNG upload, local
  saved-skins library w/ face thumbnails (apply/delete).
- Settings: resolution, fullscreen, RAM, custom Java args, minimize-while-
  playing, open game folder, Import from .minecraft, sign out, check-for-updates.
- Auto-update via electron-updater + GitHub (GOTCHAS #11).
- Design V2: starfield + floating planet hero, page/modal transitions, hover
  physics, gradient Play button, custom top bar. Reduced-motion respected.

## Shipped vs local
- Latest GitHub release: **v0.3.1-beta** (skin editor).
- LOCAL-ONLY, committed but NOT pushed: settings expansion, Design V2 +
  polish, skin library, skin rate-limit fix, profile/avatar robustness,
  AUTO-UPDATE. Next ship = **0.4.0-beta** (first release with the updater;
  MUST upload latest.yml — GOTCHAS #11).

## Known loose ends
- Legacy Forge (1.8.9/1.12.2 + OptiFine) not tested end-to-end in-game.
- Windows-only. macOS/Linux builds never attempted.

## Standing rules (also in CLAUDE.md + memory)
- Test via `Orbital Launcher (dev).bat` through explorer.exe, never installer.
- NEVER push/release until Adam says "ship it". Local commits fine.
- Renderer console + game logs → `%USERPROFILE%\feather-launcher.log`.

## File map
- src/main.js — ALL backend (auth, java, launch, profiles, mods, skins,
  settings, auto-update); `// ----------` section headers.
- src/renderer/{app.js, index.html, styles.css} — UI · preload.js — IPC bridge.
- tools/make-icon.js — icon · CHANGELOG.md · docs/agent/* — this system.
