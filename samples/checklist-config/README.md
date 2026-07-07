# Checklist configuration — UI sample



Local mockup for the per-ORG PO checklist editor (v1). Not wired to GitHub or the inspection app yet.



## Run



```bash

cd inspection

npm start

```



Open [http://localhost:3000/samples/checklist-config/](http://localhost:3000/samples/checklist-config/) (redirects to the split editor sample).



## Sample layout



**Split editor + interactive live preview** (`variant-a-split.html`)



- Question list on the left with drag-to-reorder; click a row to edit

- Live preview on the right — click toggles, change dropdowns, type in text fields

- Default answer per question (or no default)

- Dropdown option chips — drag to reorder, add/remove options



## Shared behavior



- Flowthrough Manhattan theme + ORG authentication (mock)

- PO checklist seeded from `config/checklists.json`

- Answer types: Yes/No, Pass/Fail, Pick one (option chips), Text

- Required toggle, Clear PO, Add question

- Save & Deploy commits per-ORG overrides to `config/orgs/{ORG}.json` via GitHub API (requires `GITHUB_TOKEN` on Vercel)

- Signature, damage diagram, and photos shown as fixed in preview

- Preview gear icon (stub) — production will wire inspection theme picker



## Next step



Build `admin.html` in the inspection app with GitHub token deploy.

