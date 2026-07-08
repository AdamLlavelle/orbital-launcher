# ROADMAP — Orbital Launcher
Current step: **step-01** (see steps/step-01.md)

- [x] step-00 — Core launcher: MS auth, profiles, Modrinth/CurseForge mods,
      installer, GitHub repo + v0.1.0-beta release, Lunar-style premades & wizard
- [x] step-01 — Re-enable Forge launching — DONE 2026-07-09 (verified on 26.2;
      1.8.9 legacy path still untested). Fix details preserved in GOTCHAS #9.
- [x] step-02 — Ship v0.2.0-beta (premades + wizard; Forge still gated) — 2026-07-09
- [ ] step-03 — Polish pass (Adam's plan, 2026-07-09): full/smooth UI with
      animations + fluid transitions between views; redesign the funky
      min/max/close window buttons ← CURRENT (details TBD when Adam returns)
- [ ] step-04 — Settings expansion: big settings list à la other clients
      (Adam is brainstorming the list, will provide)
- [x] step-05 — Skin editor — DONE 2026-07-09, shipped in v0.3.1-beta
      (3D preview, variant toggle, PNG upload). Done out of order per Adam.
- [ ] step-06 — THE BIG SHIFT: in-game client mod (Lunar-style). Right Shift
      opens an in-game menu with settings + overlays (CPS, keystrokes, etc.).
      NOTE: this is a Minecraft mod in Java (Fabric/Forge), a separate
      codebase shipped by the launcher — new skills, new repo structure.
      Parked: auto-update, per-profile RAM, modpack import, macOS/Linux.

Rules: only the current step's file exists in steps/. When a step finishes,
delete its file, tick it here, write the next step's file.
