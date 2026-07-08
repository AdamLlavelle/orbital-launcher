# Changelog

All notable changes to Orbital Launcher are documented here.

## 0.1.0-beta — 2026-07-08

First public beta. The launcher works end to end, but plenty is still
unfinished — expect rough edges.

### Added
- Microsoft account sign-in via the official OAuth flow (msmc), with the
  session persisted between launches
- Profiles: each profile has its own Minecraft version, mod loader
  (Vanilla / Fabric / Forge) and its own mods folder, with a profile
  dropdown + centered Play button on Home
- Profile detail page: play, browse mods, open mods folder, delete, and an
  installed-mods list with real names, icons and descriptions (matched by
  file hash), source badges, enable/disable toggles and uninstall buttons
- Mod browsing built in: Modrinth for Fabric profiles, CurseForge for Forge
  profiles — popular mods on open, category filters, search, pagination
- Per-mod version picker (right-side panel); installing a version replaces
  any other installed version of the same mod; required dependencies install
  automatically
- Automatic Java runtime setup: reads each Minecraft version's requirement
  from Mojang metadata and downloads Temurin 8 / 21 / 25 as needed
- Custom top bar UI: Orbital branding, nav tabs, account chip, window
  controls; dark space-themed look
- One-click Windows installer (electron-builder / NSIS) with desktop
  shortcut; generated app icon
- Importer for worlds, servers and settings from an existing .minecraft
  folder

### Known issues
- **Forge launching is temporarily disabled** (grayed out in the UI) while a
  classpath conflict with modern Forge's module system is being fixed
- Forge mod browsing depends on api.curse.tools, a community proxy of the
  CurseForge API
- Windows only

### History
- Started July 6, 2026 as "Feather Launcher"; renamed to Orbital Launcher
  on July 8, 2026. Built entirely by AI (Claude) with direction and testing
  by Adam.
