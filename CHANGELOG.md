# Inspection — Changelog

## Unreleased

| Component | Version |
|-----------|---------|
| Inspection app | **v0.1.3** |
| Checklist admin | **v0.3.7** |
| API / package | **v0.1.2** |

### Inspection app

- **iLPN Condition Code on every criteria** — the system Condition Code question
  (previously only on the Default iLPN criteria) is now available on all
  criteria-based iLPN checklists. It is auto-added **hidden**; toggle the eye
  icon in the checklist admin to show it on a given criteria.
- **Pass / Fail → Condition Code lock (iLPN)** — a Pass/Fail question can be
  configured to lock a condition code when answered "Fail". On submit the iLPN
  is locked with the inspector-selected condition code **and** every configured
  fail code, de-duplicated (one `lock_ilpn` call per distinct code). Each lock
  is reported in the completion message.
- **Pass / Fail buttons** always render green (Pass) / red (Fail) regardless of
  the org theme accent color.

### Checklist admin

- Condition Code shows as a hidden system question on custom iLPN criteria, with
  the standard eye / required / default controls.
- **"On Fail, lock Condition Code"** picker on Pass/Fail questions (iLPN only);
  the question list shows a `Fail → <code>` tag when set.
- **Manage Criteria modal** — the whole rule row now selects the rule, including
  a single click on the drag grip (drag-to-reorder still works). Renaming a rule
  moved to a double-click on its name. Selectable area per row went from ~13% to
  ~90% (everything but the trash button).
- Preview matches the app's fixed green/red Pass/Fail styling.

---

## v0.1.0 — Location & graphical answer types (2026-07-09)

Milestone release: **Location** as a seventh inspection object type, configurable graphical answer types, and admin/UX polish across the app and checklist configurator.

| Component | Version |
|-----------|---------|
| Inspection app | **v0.1.0** |
| Checklist admin | **v0.3.0** |
| API / package | **v0.1.0** |
| Checklist config schema | **v17** |

### Inspection app

- **Location object type** — search, default checklist, putaway/inventory condition locking, and photo markup pad (same pattern as iLPN).
- **Graphical answer types** (configurable on any object type):
  - **Traffic light** — three fixed-order status lights with custom labels.
  - **Slider** — ordered stops with live value label; defaults to first stop.
  - **Multi-select** — tap-to-toggle option chips (minimum two options).
  - **Gauge** — semicircle dial with position buttons; optional red→green color reversal.
- **Dropdown** renamed from “Pick one” in admin; stored type remains `dropdown`.
- **Signature pad** — “Sign here” icon + label placeholder when empty.
- **Gauge & chips** — colored gauge arc renders correctly on light themes; selected chips use high-contrast solid green + white text.
- Search placeholder ends with **“…Shipment, or Location”**.

### Checklist admin

- **Inline question editor** — edit panel opens below the selected row (or above **+** for new questions).
- Editors and live preview for traffic light, slider, multi-select, and gauge.
- Traffic light labels edited directly in three inline text fields (no browser prompt).
- Section editors (signature, photos, damage pad) use the same inline placement.
- **Import / Export / Save & Deploy** merge partial org drafts and always include all seven object types (Location hardened).
- Preview matches app: signature placeholder, gauge arc, chip contrast.

### API

- Location search and condition-lock endpoints (putaway + inventory).
- Inventory lock treats success when `containerCondition/search` verifies the applied code.
- Clarified Manhattan payload shapes and error responses for location locks.

### Samples

- `samples/object-types/index.html` — Location mockup and proposed answer-type demos.
- Trailer inspection checklist PDF generator (`samples/generate-trailer-checklist-pdf.py`).

---

## v0.0.21 / v0.2.3 — Checkpoint (2026-07-08)

Pre-Location checkpoint: compact admin toolbar, section ON/OFF badges, system field `enabled` flag respected in the inspection app.

---

## Earlier history

See git log for incremental fixes (damage diagram pad, JPEG form capture, configurable signature/photos/damage sections, per-org checklist overrides, and theme support).
