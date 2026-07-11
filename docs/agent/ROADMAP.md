# ROADMAP — Orbital Launcher
Current step: **step-07** (elevate to "the real deal" — scope with Adam first)

## Done
- [x] step-00 — Core launcher: MS auth, profiles, Modrinth/CurseForge mods,
      installer, GitHub repo, Lunar-style premades & wizard
- [x] step-01 — Forge launching (installer run + classpath fix; GOTCHAS #9)
- [x] step-02 — Ship v0.2.0-beta
- [x] step-03 — Design/polish pass: Design V2 (starfield, planet, transitions,
      hover physics, gradient Play, custom top bar)
- [x] step-04 — Settings expansion (resolution, fullscreen, RAM, Java args,
      minimize-while-playing, import from .minecraft, check for updates)
- [x] step-05 — Skin editor (3D preview, variant toggle, upload, saved library)
- [x] step-06 — Auto-update (electron-updater + GitHub; GOTCHAS #11)

## Now
- [ ] step-07 — **ELEVATE TO THE REAL DEAL** ← CURRENT. Scope approved by
      Adam 2026-07-09; full plan in steps/step-07.md. Three phases, each
      ships a release:
      · Phase A (current): bulletproof — error audit, skeletons/empty states,
        perf (cached manifests, parallel downloads), launch diagnostics → 0.5.0
      · Phase B: modpack import/export, update-all, profile dup/icons/
        per-profile settings, multi-account → 0.6.0
      · Phase C: home dashboard/news/playtime, onboarding, keyboard nav → 0.7.0
      (0.4.0-beta shipped 2026-07-09 — auto-update live from next release.)

## Now (order per Adam, 2026-07-11 — launcher itself is PAUSED at 0.6.0-beta)
- [ ] In-game client mod (Lunar-style): Right Shift → in-game overlay menu
      (CPS, keystrokes, FPS, etc.) with settings. This is a Minecraft mod in
      Java, a SEPARATE codebase the launcher installs. New repo. Adam opens a
      dedicated session for it. NO pushes to this repo until it's done.
- [ ] Then Phase C (see steps/step-07.md): home dashboard, onboarding.

## Later / parked
- [ ] Phase B remainder: profile duplication, per-profile RAM/args/resolution,
      multi-account switching
- [ ] macOS / Linux builds · modpack import (held back per Adam)

Rules: only the current step's file exists in steps/. Finish a step → delete
its file, tick here, write the next step's file.
