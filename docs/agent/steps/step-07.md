# step-07 — Elevate to the real deal (approved by Adam 2026-07-09)

Goal: move Orbital from hobby-tier to genuinely competing with
Lunar/Feather/Prism/Modrinth App. Three phases, EACH ends in a shipped release.

Adam's operating rules for this step (set 2026-07-09, Fable 5 session):
- Adam trusts agent judgment; proceed freely WITHIN an approved phase.
- STOP AND ASK only for structural changes: new dependencies, UI redesigns,
  data-format/schema changes, anything hard to undo.
- Ship each phase as its own release (0.5.0-beta, 0.6.0-beta, ...).

## Phase A — Feel bulletproof  ← CURRENT
- [ ] A1 Error-handling audit: every IPC/network/launch failure surfaces a
      friendly message + retry where sensible; offline detection (no blank
      hangs, no raw stack traces in UI)
- [ ] A2 Loading skeletons + empty states on every view (profiles, mods,
      skins, settings) — no blank flashes or dead-looking panels
- [ ] A3 Performance: cache version manifests (disk + TTL), parallelize
      downloads where safe, faster launch path, instant UI boot
- [ ] A4 Launch-failure diagnostics: parse common crash causes into plain
      English + one-click "copy log" button
- [ ] Ship 0.5.0-beta (first release where auto-update actually fires for
      installed users — verify the update popup works end-to-end!)

## Phase B — Power features (after A ships)
- Modpack import (.mrpack + CurseForge) / export profile as pack  ← flagship
- Mod update indicators + Update All
- Profile duplication, custom icons, per-profile RAM/args/resolution
- Multi-account switching (+ offline accounts)

## Phase C — The experience (after B ships)
- Home dashboard: news/patch-notes feed, recent profiles, playtime stats
- First-run onboarding
- Keyboard nav + accessibility pass

Parked (unchanged): in-game overlay client mod = separate Java repo/session.
