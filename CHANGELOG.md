# Changelog

All notable changes to Orbital Launcher are documented here.

## 0.4.0-beta — 2026-07-09

### Added
- **Automatic updates**: the launcher now checks GitHub for new releases on
  startup and offers to download and install them in-app — no more manually
  grabbing the installer. (Takes effect from this release onward.)
- **Settings**: game resolution and fullscreen, RAM allocation, custom Java
  arguments, minimize-while-playing, an "open game folder" shortcut, "Import
  from .minecraft" for existing worlds/settings, sign out, and a manual
  check-for-updates button.
- **Saved skins library**: keep a personal collection of skins with face
  thumbnails — apply or delete any of them with one click.

### Changed
- **New look (Design V2)**: animated starfield with a floating planet hero,
  smooth page and modal transitions, hover physics, a gradient Play button,
  and a custom title bar. Respects your system's reduced-motion setting.

### Fixed
- Skin operations no longer trip Mojang's rate limits (model variant toggles
  now render locally instead of re-fetching).
- More robust account profile and avatar handling.

## 0.3.1-beta — 2026-07-09

### Added
- **Skin editor**: click your account (top right) to open it — 3D rotating
  preview of your current skin (drag to spin), Classic/Slim model toggle,
  and skin PNG upload. Changes apply to your real Minecraft account via
  Mojang's official API.

## 0.3.0-beta — 2026-07-09

### Fixed
- **Forge launching works!** Modern Forge (1.13 through 26.x) runs the
  official Forge installer once per version automatically, and a classpath
  conflict with Forge's module system was resolved. Verified on 26.2.
  The 1.12.2 and 1.8.9 starter profiles use the legacy path — report issues.
- Browse Mods loading message now names the right source
  (CurseForge for Forge, Modrinth for Fabric)

## 0.2.0-beta — 2026-07-09

### Added
- **Starter profiles**, created automatically: Latest Release (Fabric),
  1.16.5 (Fabric), 1.12.2 (Forge + OptiFine preinstalled), 1.8.9
  (Forge + OptiFine preinstalled)
- **New Profile wizard**: two steps with a side rail — Details (name +
  description with character counters) and Version (Vanilla/Fabric/Forge
  pills with a curated version grid)
- **Advanced toggle** in the wizard: switches the curated list to the full
  catalog — every vanilla release, every Forge-supported version, every
  Fabric-supported version (from each loader's own metadata)
- Profile descriptions, shown on profile cards and the profile page

### Changed
- Curated version list: the newest update of each version line, down to
  1.7.10 (Fabric down to 1.16.5)
- Launch status now says "Checking files" during the pre-launch integrity
  check instead of the misleading "Downloading" (existing files are never
  re-downloaded)
- Removed the Quilt loader option

### Known issues
- Forge launching remains temporarily disabled (fix staged for next release)

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
