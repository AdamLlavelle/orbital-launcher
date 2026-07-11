# step-07 — Elevate to the real deal (approved by Adam 2026-07-09)

Goal: move Orbital from hobby-tier to genuinely competing with
Lunar/Feather/Prism/Modrinth App. Three phases, EACH ends in a shipped release.

Adam's operating rules for this step (set 2026-07-09, Fable 5 session):
- Adam trusts agent judgment; proceed freely WITHIN an approved phase.
- STOP AND ASK only for structural changes: new dependencies, UI redesigns,
  data-format/schema changes, anything hard to undo.
- Ship each phase as its own release (0.5.0-beta, 0.6.0-beta, ...).

## Phase A — Feel bulletproof  ← CURRENT (code done 2026-07-09, unshipped)
- [x] A1 Error-handling audit: friendly net errors (no raw URLs), offline
      detection, atomic .part downloads (partial-file bug fixed), boot-error
      screen w/ retry, inline error notes w/ Retry in all lists
- [x] A2 Loading skeletons (shimmer, reduced-motion aware) + empty/error
      states: mod browser, installed mods, version drawer, skin library
- [x] A3 Perf: manifest disk cache 30min + stale-if-offline, allVersions 24h
      cache + parallel loader lookups, java-major cached forever, parallel
      dep installs, parallel boot (profiles ∥ MS refresh)
- [x] A4 Crash diagnostics: game-output ring buffer, 9 crash signatures →
      plain English, crash card w/ Copy Log (crashed vs couldn't-start)
- [x] Ship 0.5.0-beta — SHIPPED 2026-07-10 (.exe hyphenated + latest.yml).
      Also included: version badge in top bar, restyled window controls.
      NOT YET CONFIRMED: whether a 0.4.0-beta install actually showed the
      update popup (first real auto-update). Ask Adam / check next session.

## Phase A → B transition
Phase A done and shipped. Phase B starts with profile import/export (see
Phase B list — modpacks held back per Adam).

## Phase B — Power features (after A ships)
- Profile import/export in the profile menu (.orbprofile = zip of meta.json
  + mods/) ← flagship, ADAM'S CALL 2026-07-10: replaces modpack import/export
  (modpacks HELD BACK for now — don't build without asking him)
- Mod update indicators + Update All
- Profile duplication, custom icons, per-profile RAM/args/resolution
- Multi-account switching (+ offline accounts)

## Phase C — The experience (after B ships)
- Home dashboard: news/patch-notes feed, recent profiles, playtime stats
- First-run onboarding
- Keyboard nav + accessibility pass

Parked (unchanged): in-game overlay client mod = separate Java repo/session.
