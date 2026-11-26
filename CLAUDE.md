# Cortiva — notes for Claude

The owner writes in Spanish; answer in Spanish. The app's own UI text is in English.

## Every improvement ships as a new release

Whenever the owner asks to improve, fix, add or change anything in the app, finish the work by
publishing a **new** GitHub release — never re-publish or overwrite an existing one.

1. Bump `version` in `package.json` to the next beta: `0.1.0-beta` → `0.2.0-beta` → `0.3.0-beta` …
   (a release is named from it: `0.2.0-beta` → "Cortiva beta 0.2"). Run `npm i --package-lock-only`
   so `package-lock.json` matches.
2. Add a section at the top of `CHANGELOG.md`, headed `## <version> — <date>`, saying **in English**,
   in plain words for the person using the app, what changed (new things, fixes, known limits).
   All release texts (notes, names, descriptions) are in English; only the chat with the owner is in
   Spanish.
   The release notes are taken from that section; the workflow refuses to release without it.
3. Check the work (typecheck, build, and run it), commit and push to `main`.
4. Start the **Release (Windows)** workflow (`.github/workflows/release.yml`) with a
   workflow_dispatch on `main`. Cloud sessions can't push tags, which is why it's dispatched; the
   workflow creates the `v<version>` tag itself. It stops if that version was already released.
   After the release it publishes the same build to the website (GitHub Pages, job `web`).
5. Wait for it, confirm the release has both `.exe` files and that the `web` job passed, and give
   the owner the release link and a short summary of what changed.

Changes that don't touch the app (docs, CI only) don't need a release.

## Project

- React + Vite web app in `src/`; `npm run build` typechecks and builds `dist/`.
- Windows desktop app: Electron (`electron/main.cjs`) packaged by electron-builder (`build` in
  `package.json`) into an NSIS installer and a portable `.exe`.
- The web version is published by each release, not by pushes; `pages.yml` only re-publishes by
  hand. https://eric-2812.github.io/cortiva/ is the presentation page (`index.html`,
  `src/landing/`: built on the design-taste-frontend kit copied into `public/kit/` (layout, hover,
  hero entrance, the pinned-chapters moment), plus Motion, anime.js and NumberFlow animations; no
  photographs — the owner asked for none; check it with the skill's `gate.mjs` on `dist/index.html`); the app is at `/cortiva/app/` (`app/index.html`), which phones join through. A `?join=`
  link to the root is forwarded to the app. The desktop app loads `cortiva://app/app/index.html`.
  The repository was renamed from Multicam to cortiva.
- Licence: GPL-3.0-or-later (`LICENSE`). Keep the README's "Privacy" section true. The owner asked to
  leave code signing (and any SignPath / code-review policy) out of the project for now; the .exe
  files aren't signed. If the app ever contacts a
  new outside service, add it to "Privacy" (the app makes no requests on start-up; fonts are bundled).
