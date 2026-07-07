# Checklist configuration — UI samples

Local mockups for the per-ORG checklist editor. Not wired to GitHub or production `admin.html` until approved.

## Run

```bash
cd inspection
npm start
```

Open [http://localhost:3000/samples/checklist-config/](http://localhost:3000/samples/checklist-config/) for the sample index.

## Samples

| File | Description |
|------|-------------|
| `variant-a-split.html` | Original PO editor + live preview |
| `variant-sections-panel.html` | **Sample A** — form section settings panel |
| `variant-sections-list.html` | **Sample B** — section rows in question list |

## Form sections (new — samples only)

Production today always shows signature, photos, and damage pad. These samples explore **per object type** configuration.

### Proposed JSON shape (extends existing `damagePad` in `checklists.default.json`)

```json
{
  "checklists": {
    "po": {
      "signature": { "enabled": true, "required": true },
      "photos": { "enabled": true, "required": false },
      "damagePad": {
        "enabled": true,
        "required": false,
        "mode": "stock",
        "defaultImage": "container",
        "images": ["container", "trailer"]
      },
      "fields": [ "...questions..." ]
    },
    "ilpn": {
      "signature": { "enabled": true, "required": true },
      "photos": { "enabled": true, "required": false },
      "damagePad": {
        "enabled": true,
        "required": false,
        "mode": "photo"
      },
      "fields": [ "...questions..." ]
    }
  }
}
```

- **`signature`** — inspector signature pad below questions
- **`photos`** — header camera + thumbnail strip (grouped with signature area in the app today)
- **`damagePad.mode`**
  - `stock` — pre-loaded container/trailer diagram to mark up (PO, trailer, ASN)
  - `photo` — capture a new image then mark up (iLPN / oLPN pattern)

### Sample A — Settings panel

Dedicated **Form sections** card above the question list. All three sections visible at once with enable/required toggles and damage mode dropdown.

**Pros:** Fast to scan; good for bulk setup.  
**Cons:** Separated from the question list.

### Sample B — List rows

Signature, photos, and damage pad appear as **locked rows** at the bottom of the question list (like system/API fields). Click the slider icon to open a focused editor for that section.

**Pros:** Consistent with existing system-field pattern; stays in one list.  
**Cons:** One section at a time when editing.

### Live preview

Both section samples use the production device frame. When enabled, sections render **below checklist questions** in preview order:

1. Questions  
2. Photos hint (if enabled)  
3. Signature pad (if enabled)  
4. Damage / markup pad (if enabled) — stock diagram or empty photo state

Switch **Object type** between PO and iLPN to compare defaults.

## Shared behavior (original sample)

- Flowthrough Manhattan theme
- PO checklist seeded from `mock-po-config.js`
- Answer types, default answers, drag-reorder, inline + to add questions
- Save & Deploy is mock-only in `variant-a-split.html`

## Next step

Review samples A/B, then port chosen UX + schema into production `admin.html` and `checklist-config.js`.
