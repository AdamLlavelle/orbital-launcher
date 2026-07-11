# Orbital Launcher — agent instructions

Electron Minecraft launcher (Microsoft auth, per-version profiles, Modrinth +
CurseForge mod browsing). Owner: Adam. Built and maintained by Claude.

## Session start — do this before making changes
1. Read `docs/agent/STATE.md` (current status + pointers).
2. Read the current step file named in `docs/agent/ROADMAP.md`.
3. Read `docs/agent/GOTCHAS.md` before touching launch, auth, or mod-install code.
Do NOT scan the repo beyond files those docs point to unless the task requires it.

## Commands
- Test the app:   `explorer.exe "<repo>\Orbital Launcher (dev).bat"` (NEVER npm start
  directly — explorer.exe escapes the Claude sandbox; see GOTCHAS #4)
- AFTER EVERY code change, relaunch the dev app so Adam can test immediately:
  `taskkill //IM electron.exe //F` (kills only the dev instance), then the
  explorer.exe line above. Adam tests himself — don't drive the UI via
  computer control unless it's clearly the better tool.
- Build installer: `npx electron-builder --win`  (only when shipping)
- App log:         `%USERPROFILE%\feather-launcher.log`

## Standing rules (from Adam)
- Test with the dev bat, never via installer, unless told otherwise.
- NEVER push to GitHub or publish releases until Adam explicitly says to ship.
  Local commits are fine and encouraged at milestones.
- AFTER shipping a release (push + gh release), ALWAYS launch the freshly built
  installer via `explorer.exe "dist\Orbital Launcher Setup <ver>.exe"` so Adam
  ends up with the real installed exe. Don't skip this — it's the last step of
  every ship.
- Adam trusts agent judgment on scope/direction (step-07 era); proceed freely
  within an approved phase. STOP AND ASK only for STRUCTURAL changes: new
  dependencies, UI redesigns, data-format/schema changes, anything hard to
  undo. (Calibrated with Adam 2026-07-09.)

## Update contract
At every milestone (step done, decision made, gotcha discovered): update
`docs/agent/STATE.md` (overwrite, keep < 60 lines), tick `ROADMAP.md`,
append to `GOTCHAS.md` — in the same turn as the work.
