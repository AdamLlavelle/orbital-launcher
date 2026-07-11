# STATE — Orbital Launcher
Updated: 2026-07-09 evening (overwrite this file, never append; keep < 70 lines)

## What this is
Electron 43 Minecraft launcher. Source: `C:\Users\adaml\Projects\orbital-launcher`.
Installed app: `C:\Program Files\Orbital Launcher` (NSIS one-click, perMachine).
GitHub: https://github.com/AdamLlavelle/orbital-launcher.
Game data: `%APPDATA%\.orbitallauncher` · launcher data: `%APPDATA%\Orbital Launcher`.
Built entirely by AI, directed by Adam (attribution in README + releases).

## Mission: step-07 "the real deal" (plan approved, see steps/step-07.md)
Phase A shipped as 0.5.0-beta (07-10). Most of Phase B shipped as 0.6.0-beta
(07-11): profile import/export (modpacks HELD BACK per Adam), update-all,
profile images, launch worker + fast verify, log window. Phase B remainder:
profile duplication, per-profile RAM/args/resolution, multi-account. Then
Phase C (dashboard, onboarding). Adam's rules: proceed freely in-phase; ask
only for structural changes (new deps, redesigns, schema changes). After
EVERY code change: relaunch dev app (see CLAUDE.md Commands). Adam tests
himself — avoid computer-use except when clearly the better tool.

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
- Latest GitHub release: **v0.6.0-beta** (shipped 2026-07-11): launch in
  utilityProcess (no UI freeze), fast-verify launches, Feather-style log
  window, profile import/export (.orbprofile), auto mod-update check +
  Update All, profile images (create/change/remove, in exports).
- HEAD == origin/main, nothing local-only pending.
- AUTO-UPDATER VERIFIED END-TO-END 2026-07-11: Adam's installed 0.5.0-beta
  showed the popup, downloaded and installed 0.6.0-beta. The whole pipeline
  (publish block → latest.yml + hyphenated exe → popup → quitAndInstall)
  works. Future ships: releasing correctly IS the updater path; only run the
  installer manually if a user is too far behind or the updater breaks.

## Known loose ends
- Legacy Forge (1.8.9/1.12.2 + OptiFine) not tested end-to-end in-game.
- Windows-only. macOS/Linux builds never attempted.

## Standing rules (also in CLAUDE.md + memory)
- Test via `Orbital Launcher (dev).bat` through explorer.exe, never installer.
- NEVER push/release until Adam says "ship it". Local commits fine.
- AFTER every ship, launch the new installer via explorer.exe so Adam gets the
  real exe (last step of the ship flow — GOTCHAS #10).
- Renderer console + game logs → `%USERPROFILE%\feather-launcher.log`.

## File map
- src/main.js — ALL backend (auth, java, launch, profiles, mods, skins,
  settings, auto-update); `// ----------` section headers.
- src/renderer/{app.js, index.html, styles.css} — UI · preload.js — IPC bridge.
- tools/make-icon.js — icon · CHANGELOG.md · docs/agent/* — this system.
