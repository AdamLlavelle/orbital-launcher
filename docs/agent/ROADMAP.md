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
- [ ] step-07 — **ELEVATE TO THE REAL DEAL** ← CURRENT (no step file yet —
      write one after brainstorming with Adam). Goal: move from hobby-tier to
      a serious client. Candidate directions to discuss (NOT yet committed):
      · robustness/error-handling audit, loading & empty states everywhere
      · news/changelog feed on home, richer home dashboard
      · account: multi-account switching, offline mode, cape display
      · mods: modpack import/export, update-all, profile duplication, drag-drop
      · per-profile settings (RAM/args/resolution), profile icons/backgrounds
      · performance: faster launches, parallel downloads, cached version meta
      · polish: onboarding, keyboard nav, accessibility, first-run experience
      First ship the pending 0.4.0-beta (auto-update) before big new work.

## Later / parked
- [ ] In-game client mod (Lunar-style): Right Shift → in-game overlay menu
      (CPS, keystrokes, FPS, etc.). This is a Minecraft mod in Java, a SEPARATE
      codebase the launcher installs. New repo/skills. Adam may open a
      dedicated session with full context for this.
- [ ] macOS / Linux builds · modpack import · per-profile RAM

Rules: only the current step's file exists in steps/. Finish a step → delete
its file, tick here, write the next step's file.
