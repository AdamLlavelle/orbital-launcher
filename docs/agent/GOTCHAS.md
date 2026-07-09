# GOTCHAS — hard-won facts. Append-only. Read before touching launch/auth/mods.

1. **msmc + node-fetch**: msmc's bundled node-fetch throws "Premature close" on
   `login_with_xbox` inside Electron. src/main.js replaces the `node-fetch`
   entry in `require.cache` with a native-fetch shim BEFORE requiring msmc,
   plus a 3-retry loop around `getMinecraft()`. Don't reorder those requires.

2. **Minecraft versioning changed in 2026**: current releases are `26.2`-style
   (not `1.x`) and need Java 25. NEVER parse version strings to pick Java —
   read `javaVersion.majorVersion` from Mojang's per-version manifest JSON
   (see `javaMajorFor()`). Runtimes: Temurin via Adoptium API into
   `%APPDATA%\.orbitallauncher\runtime\javaNN`.

3. **MLC drops `arguments.jvm` from custom version JSONs.** Fabric 0.19.x dies
   with "trying to load FabricLoaderImpl from target class loader" without its
   `-DFabricMcEmu` flag → we re-inject profile jvm args via MLC `customArgs`
   (fabric/quilt only). Modern Forge has the related installer-jar-on-classpath
   JPMS bug (see steps/step-01.md).

4. **Claude MSIX sandbox (CRITICAL)**: any process spawned from a Claude Code
   session inherits Claude's MSIX container — AppData is virtualized to
   `...\Packages\Claude_*\LocalCache\Roaming`. Fabric CRASHES under it, and
   reads of %APPDATA% from the session may return stale shadow copies.
   Always launch the app (and any AppData-writing script) via
   `explorer.exe "<path to .bat>"`. `grab-logs.bat` copies real game logs into
   the repo's debug-logs/ to bypass shadowing.

5. **CurseForge API**: direct www.curseforge.com/api and even hidden-
   BrowserWindow calls get Cloudflare 403. We use https://api.curse.tools/v1/cf
   (community proxy of the official API, keyless). If it dies, the fallback is
   an official key from console.curseforge.com + api.curseforge.com.
   Null `downloadUrl` → derive: `edge.forgecdn.net/files/{id/1000}/{id%1000}/{fileName}`.

6. **OptiFine**: no official API. BMCLAPI mirror:
   list `bmclapi2.bangbang93.com/optifine/{mc}`, download `/{mc}/{type}/{patch}`.
   Stable builds = filename NOT starting with `preview`.

7. **Mod identity**: installed-mods metadata is matched by file sha1 against
   Modrinth `/version_files` (cached in userData/modmeta.json; CurseForge
   installs pre-seed the cache at download time). Disable = rename to
   `.jar.disabled`; `syncProfileMods()` rebuilds the live mods folder from the
   profile's folder on every launch — GAME_ROOT/mods is launcher-managed.

8. **Data migration chain**: `.featherlauncher` → `.orbitallauncher` renamed on
   startup; old feather userData JSONs copied once. Worlds/settings imported
   from `.minecraft` via "Import Old Data.bat" (safe to re-run, never
   overwrites newer). Don't reintroduce the old names.

9. **Modern Forge needs its installer run once per version** (1.13+/26.x):
   MLC can't run Forge's installer processors, so the patched client jar is
   missing → "Could not find .forge_patched_minecraft". `ensureForgeInstalled()`
   runs `java -jar forge.jar --installClient GAME_ROOT` headlessly (needs a
   stub launcher_profiles.json), marker: `GAME_ROOT/.forge-installed-<ver>`.
   Combined with the installer-jar classpath strip (the 'arguments' event
   handler), modern Forge launches. Legacy (<=1.12) skips both; 1.8.9 path
   still untested end-to-end. VERIFIED working on 26.2 (2026-07-09).

11. **Auto-update** (electron-updater, GitHub provider, allowPrerelease=true
    since releases are betas). Only runs when `app.isPackaged` — never in the
    dev bat. CRITICAL: every `gh release create` MUST upload `dist/latest.yml`
    ALONGSIDE the .exe, or installed apps can't detect the update. Build config
    has a `publish` block so electron-builder generates latest.yml into dist/.
    Auto-update activates from the NEXT release after the one that first
    shipped the updater code (0.4.0-beta). Flow: check on launch (3s delay) →
    update-available → in-app popup → user clicks → downloadUpdate →
    update-downloaded → quitAndInstall. Manual "Check for Updates" in Settings.

10. **Releases**: electron-builder NSIS, `perMachine`+`oneClick` → Program Files,
   UAC prompt Adam must click. Version comes from package.json (currently
   0.1.0-beta). gh CLI authed as AdamLlavelle. The initial commit message was
   history-rewritten once (filter-branch) — don't do that again now that the
   repo is public and shared.
