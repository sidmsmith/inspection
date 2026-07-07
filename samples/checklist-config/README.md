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
- **Insert at any position** — `+` slots between questions (see below)
- Live preview on the right — click toggles, change dropdowns, type in text fields
- Default answer per question (or no default)
- Dropdown option chips — drag to reorder, add/remove options

## Insert-question UX (two ideas, combined in sample)

The toolbar **Add question** button is removed. New questions are added via inline `+` insert slots.

### Idea A — Hover gutters (always available)

A faint `+` appears **between every row** (and above the first). Slots brighten when you hover the list or a specific row. Click a slot to open the editor and insert at that exact index.

**Pros:** Precise placement without dragging; works on touch with tap.  
**Cons:** More visual noise when the list is long.

### Idea B — Drag affordance (your “+ below moved question”)

While dragging a question, the `+` **below the hover target** highlights. After you drop, that slot **pulses for ~2s** so you can immediately add a follow-up question in the new neighborhood.

**Pros:** Clean list at rest; reinforces “I just moved something here.”  
**Cons:** Less discoverable if users never drag.

The sample implements **both**: gutters at rest (Idea A) plus drag/drop highlighting (Idea B). Production `admin.html` can ship one pattern or the hybrid.

## Shared behavior

- Flowthrough Manhattan theme + ORG authentication (mock)
- PO checklist seeded from `config/checklists.json`
- Answer types: Yes/No, Pass/Fail, Pick one (option chips), Text
- Required toggle, Clear PO
- Save & Deploy commits per-ORG overrides to `config/orgs/{ORG}.json` via GitHub API (requires `GITHUB_TOKEN` on Vercel)
- Signature, damage diagram, and photos shown as fixed in preview
- Preview gear icon (stub) — production will wire inspection theme picker

## Next step

Port `mountQuestionListWithInsertSlots` from `shared-samples.js` into production `js/checklist-admin.js` and remove the toolbar Add question button.
