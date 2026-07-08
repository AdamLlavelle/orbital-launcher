# Orbital Launcher

A lightweight Minecraft launcher with Microsoft account sign-in, per-version
profiles, and built-in mod downloads from Modrinth and CurseForge.

## Features

- **Microsoft sign-in** — official Microsoft OAuth flow (via msmc); your real
  Minecraft profile, skin and username. Stays signed in between sessions.
- **Profiles** — each profile has its own Minecraft version, loader
  (Vanilla / Fabric / Forge) and its own set of mods. Hit Play on any profile.
- **Mod browsing** — Fabric profiles browse Modrinth, Forge profiles browse
  CurseForge. Popular mods load instantly, with category filters, search,
  pagination, per-version installs, and one-click enable/disable.
- **Zero setup** — game files, loader profiles and the right Java runtime
  (8 / 21 / 25, from Adoptium/Mojang metadata) download automatically.

## Installing (users)

Run `dist/Orbital Launcher Setup 1.0.0.exe`. One click installs it to
Program Files with a desktop shortcut. That's it.

## Developing

```
npm install
npm start          # run from source
npm run icon       # regenerate build/icon.ico
npm run dist       # build the Windows installer into dist/
```

## Where things live

- Game files & mods: `%APPDATA%\.orbitallauncher` (worlds in `saves`,
  per-profile mods in `profiles\<id>\mods`)
- Launcher settings & login session: `%APPDATA%\orbital-launcher`

## Notes

- Mods need a mod loader — pick Fabric or Forge when creating a profile.
- First launch of a version downloads assets and takes a few minutes;
  later launches are fast.
- Forge mod browsing uses api.curse.tools, a community proxy of the official
  CurseForge API. If it's ever down, Forge browsing pauses; Fabric/Modrinth
  is unaffected.
