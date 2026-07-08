# step-01 — Re-enable Forge launching

## Problem history (all on Minecraft 26.2 + Forge 65.0.0, Java 25)
1. First crash: JPMS `ResolutionException: Modules forge and jopt.simple export
   package joptsimple.internal`. Cause: MLC puts the Forge INSTALLER jar on the
   classpath (`versions/forge-<ver>/forge.jar`, via `options.forge`); the
   installer bundles jopt-simple; modern Forge's `net.minecraftforge.bootstrap`
   builds a module graph from the classpath → split package.
2. Removing the standalone jopt-simple jar instead was WRONG:
   `Module jopt.simple not found, required by cpw.mods.modlauncher`.

## Fix (in src/main.js, `mc:launch`, `launcher.on('arguments')` — UNTESTED)
Strips the installer jar from `-cp` right before spawn, only when mainClass
matches /minecraftforge\.bootstrap|cpw\.mods/ (modern). Legacy Forge
(LaunchWrapper, 1.8.9/1.7.10) keeps its classpath untouched.

## To do
1. Remove the UI gates in src/renderer/app.js:
   - `launchSelected()`: the `p.loader === 'forge'` toast+return guard
   - `updatePlayAvailability()`: delete or make it a no-op for forge
   - `openProfileDetail()`: the `detail-play` disabled/title lines
2. Test modern: dev bat → Play the 1.12.2... no, modern = a Forge 26.2 profile
   (create via wizard). Watch `%USERPROFILE%\feather-launcher.log` for
   `[launch] removed Forge installer jar` then `[game]` lines. Success =
   javaw survives past 90s / reaches "Setting user".
3. Test legacy: premade 1.8.9 profile (has OptiFine preinstalled). Legacy path
   never hit the JPMS bug, but is otherwise UNTESTED end to end. Watch for
   LaunchWrapper errors; OptiFine must appear in the Forge mods list in-game.
4. If modern still fails: capture `[game]` output — next suspects are other
   split packages (filter more jars) or missing module args from the generated
   forge version json (MLC drops `arguments.jvm` — same class of bug as the
   FabricMcEmu fix, see GOTCHAS #3).
5. On success: remove the "temporarily disabled" notes from CHANGELOG/README,
   update STATE.md + ROADMAP, write steps/step-02.md.
