# Inspection — Project Instructions

This project follows the global `AGENTS.md` and `SECURITY_BASELINE.md`.
The notes below cover only what's specific to this repository. See
`CHANGELOG.md` for release history.

## Version identifiers — three independently-versioned components

Per `CHANGELOG.md`, this project intentionally tracks three separate
version numbers — bump whichever component actually changed:

- **Inspection app** — `index.html`'s `<title>` (currently `v0.1.1`)
  and `package.json`'s `version` (`0.1.0`)
- **Checklist admin** — `admin.html`'s `<title>` ("Checklist Config
  vX.Y.Z", currently `v0.3.4`)
- **API / package** — `api/index.py`'s `app_version` field (`0.1.0`,
  should track `package.json`)

## Local development

- `node server.js` — Express, serves the root/`public/`/`config/`/
  `css/`/`js/`/`samples/` directories and proxies `/api/*` to the
  Flask backend (port 3000 by default, via `PORT` env var)
- `python api/index.py` — Flask backend, port 5000 (`app.run(port=5000,
  debug=True)`)

## Checklist config Save & Deploy

The admin UI's Save & Deploy writes `config/orgs/{ORG}.json` straight
to GitHub via `GITHUB_TOKEN`/`GITHUB_REPO`, triggering a Vercel
redeploy — same live-write pattern as `billingmgmt`. Requires a
classic GitHub PAT with `repo` scope (see `.env.example`).
