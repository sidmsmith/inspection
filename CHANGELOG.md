# Inspection — Changelog

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
