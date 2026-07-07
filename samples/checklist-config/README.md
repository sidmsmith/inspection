# Checklist configuration — UI samples

Local mockups for the per-ORG PO checklist editor (v1). Not wired to GitHub or the inspection app yet.

## Run

```bash
cd inspection
npm start
```

Open [http://localhost:3000/samples/checklist-config/](http://localhost:3000/samples/checklist-config/)

## Variants

| Sample | File | Best for |
|--------|------|----------|
| **A — Split** | `variant-a-split.html` | Side-by-side list + live preview; quick edits |
| **B — Cards** | `variant-b-cards.html` | Expand-in-place cards; option chips visible per question |
| **C — Nav** | `variant-c-nav.html` | Many questions; flowthrough-style left nav |

## Shared behavior (all samples)

- Flowthrough Manhattan theme + ORG authentication (mock)
- PO checklist seeded from `config/checklists.json`
- Answer types: Yes/No, Pass/Fail, Pick one (option chips), Text
- Required toggle, Clear PO, Add question
- Save & Deploy is a stub (shows status message only)
- Signature, damage diagram, and photos shown as fixed in preview

## Next step

Pick a variant (or mix). Then build `admin.html` in the inspection app with GitHub token deploy.
