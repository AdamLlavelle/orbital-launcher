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

10. **Releases**: electron-builder NSIS, `perMachine`+`oneClick` → Program Files,
   UAC prompt Adam must click. Version comes from package.json. gh CLI authed
   as AdamLlavelle. Latest GitHub release: v0.4.0-beta (shipped 2026-07-09).
   Don't history-rewrite (filter-branch) — repo is public/shared.
   Ship flow: bump package.json, update CHANGELOG, `npm run dist`, commit,
   push, `gh release create vX --prerelease` uploading BOTH the .exe AND
   latest.yml, then run the new installer.

11. **Auto-update** (electron-updater, GitHub provider, allowPrerelease=true
    since releases are betas). Only runs when `app.isPackaged` — never in the
    dev bat (handlers still registered in dev, return `{dev:true}` so the UI
    doesn't hang). CRITICAL: every `gh release create` MUST upload
    `dist/latest.yml` ALONGSIDE the .exe, or installed apps can't detect the
    update. Build config has a `publish` block so electron-builder generates
    latest.yml. Activates from the NEXT release after the one that first ships
    the updater code (0.4.0-beta). Flow: check on launch (3s) → update-available
    → in-app popup → downloadUpdate → update-downloaded → quitAndInstall.
    FILENAME MATCH (learned shipping 0.4.0-beta): electron-builder writes the
    .exe url in latest.yml with HYPHENS (`Orbital-Launcher-Setup-X.exe`) but the
    built file has SPACES, and GitHub mangles spaces in asset names. When
    uploading via gh CLI, `cp` the exe to the exact hyphenated name first and
    upload THAT, or electron-updater can't find the file. (v0.4.0-beta uploaded
    the hyphenated exe + latest.yml — both names line up.)

12. **Skin API is rate-limited hard by Mojang (429).** Cache the profile in
    main (`skinCache`); variant toggle re-renders the 3D model LOCALLY from the
    cached skin bytes (no network) and makes only ONE setVariant call. Don't
    call a full network refresh after every skin op. `mcErr()` gives friendly
    429/401 messages. Restore validates name+id present or retries (empty
    profile = "default skin, no name" chip bug).
