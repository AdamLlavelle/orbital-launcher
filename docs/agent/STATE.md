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
- New Profile wizard (Lunar-inspired, Adam-approved after iteration):
  760x~500 fixed-size dialog, left step rail (Details ✓/Version), char-counter
  fields, loader pills, 3-col version card grid, blue "Advanced" toggle switch
  swapping curated list ↔ full catalog (vanilla=all releases; fabric/forge from
  their own metadata via `mc:allVersions`). No Cancel button (X only).
- Mod browsing: Fabric→Modrinth, Forge→CurseForge (api.curse.tools proxy);
  categories, search, pagination, version drawer, dep auto-install,
  one-version-per-mod, enable/disable, hash-matched metadata cards
- Java auto-select from Mojang metadata (8/21/25) — never parse version strings
- Custom top-bar UI, app icon, changelog, beta versioning, agent docs system

## Gated / broken
- Forge LAUNCH disabled in UI — JPMS crash; fix written but UNTESTED → step-01.
  Gates: src/renderer/app.js (launchSelected guard, updatePlayAvailability,
  openProfileDetail detail-play disable).

## Local-only (committed, NOT pushed — Adam gates all pushes)
- Everything after v0.1.0-beta: premades, wizard (all iterations), advanced
  toggle, "Checking files" label, agent docs. GitHub still at 0.1.0-beta.

## Next actions
1. step-01: re-enable Forge (when Adam says go).
2. Ship 0.2.0-beta when Adam says "ship it" (bump version, changelog, build,
   push, release).

## File map (read only what you need)
- src/main.js — ALL backend; `// ----------` section headers
- src/renderer/app.js — UI logic · index.html — markup · styles.css — theme
- src/preload.js — IPC bridge · tools/make-icon.js — icon · CHANGELOG.md
