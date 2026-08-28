/** Checklist config load/merge — shared by inspection app and admin UI */

const FORM_SECTION_KEYS = ['signature', 'photos', 'damagePad'];

const DEFAULT_SECTION_LABELS = {
  signature: "Inspector's Signature",
  photos: 'Inspection Photos',
  damagePad: 'Markup Pad'
};

/** Presence of a `criteria` array marks an object type as rule-driven (multiple checklist configs). */
function hasCriteria(raw) {
  return !!raw && Array.isArray(raw.criteria);
}

function mergeChecklistConfigs(base, orgOverlay) {
  const result = JSON.parse(JSON.stringify(base));
  if (!orgOverlay?.checklists) return result;
  for (const [typeKey, orgChecklist] of Object.entries(orgOverlay.checklists)) {
    if (!result.checklists) result.checklists = {};
    if (!result.checklists[typeKey]) result.checklists[typeKey] = {};
    if (Array.isArray(orgChecklist.criteria)) {
      result.checklists[typeKey] = { criteria: JSON.parse(JSON.stringify(orgChecklist.criteria)) };
      continue;
    }
    if (Array.isArray(orgChecklist.fields)) {
      result.checklists[typeKey].fields = JSON.parse(JSON.stringify(orgChecklist.fields));
    }
    if (orgChecklist.sections) {
      result.checklists[typeKey].sections = JSON.parse(JSON.stringify(orgChecklist.sections));
    }
    if (Array.isArray(orgChecklist.layout)) {
      result.checklists[typeKey].layout = JSON.parse(JSON.stringify(orgChecklist.layout));
    }
  }
  return result;
}

async function fetchChecklistJson(url) {
  const bust = `_=${Date.now()}`;
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${sep}${bust}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function loadChecklistsForOrg(org) {
  let base;
  try {
    base = await fetchChecklistJson('/config/checklists.default.json');
  } catch {
    base = await fetchChecklistJson('/config/checklists.json');
  }
  const normalizedOrg = org ? String(org).trim().toUpperCase() : '';
  if (!normalizedOrg) return normalizeAllChecklists(base);
  try {
    const orgCfg = await fetchChecklistJson(`/config/orgs/${encodeURIComponent(normalizedOrg)}.json`);
    return normalizeAllChecklists(mergeChecklistConfigs(base, orgCfg));
  } catch {
    return normalizeAllChecklists(base);
  }
}

/** Normalize one object-type entry, preserving criteria metadata (id/name/isDefault/rule) when present. */
function normalizeChecklistTypeEntry(raw, typeKey) {
  if (hasCriteria(raw)) {
    return {
      criteria: raw.criteria.map(c => ({
        id: c.id,
        name: c.name,
        isDefault: !!c.isDefault,
        rule: c.rule ? JSON.parse(JSON.stringify(c.rule)) : null,
        ...normalizeChecklistEntry(c, typeKey)
      }))
    };
  }
  return normalizeChecklistEntry(raw, typeKey);
}

function normalizeAllChecklists(config) {
  if (!config?.checklists) return config;
  const next = JSON.parse(JSON.stringify(config));
  for (const typeKey of Object.keys(next.checklists)) {
    next.checklists[typeKey] = normalizeChecklistTypeEntry(next.checklists[typeKey], typeKey);
  }
  return next;
}

function getDefaultSectionsForType(objectType) {
  const sections = {
    signature: {
      enabled: true,
      required: true,
      label: DEFAULT_SECTION_LABELS.signature
    },
    photos: {
      enabled: true,
      required: false,
      label: DEFAULT_SECTION_LABELS.photos
    },
    damagePad: {
      enabled: true,
      required: false,
      label: DEFAULT_SECTION_LABELS.damagePad,
      mode: 'stock',
      defaultImage: 'container',
      images: ['container', 'trailer'],
      includeInDocumentUpload: false
    }
  };
  if (objectType === 'ilpn' || objectType === 'olpn') {
    sections.damagePad.mode = 'photo';
    sections.damagePad.label = 'LPN Photo for Markup';
    delete sections.damagePad.defaultImage;
    delete sections.damagePad.images;
  }
  if (objectType === 'location') {
    sections.damagePad.mode = 'photo';
    sections.damagePad.label = 'Location Photo for Markup';
    delete sections.damagePad.defaultImage;
    delete sections.damagePad.images;
  }
  return sections;
}

function buildSectionsFromRaw(raw, objectType) {
  const sections = getDefaultSectionsForType(objectType);
  const fromSections = raw?.sections || {};
  for (const key of FORM_SECTION_KEYS) {
    if (fromSections[key] && typeof fromSections[key] === 'object') {
      Object.assign(sections[key], JSON.parse(JSON.stringify(fromSections[key])));
    }
  }
  const legacyPad = raw?.damagePad;
  if (legacyPad && typeof legacyPad === 'object' && !fromSections.damagePad) {
    Object.assign(sections.damagePad, JSON.parse(JSON.stringify(legacyPad)));
    if (legacyPad.enabled === false) sections.damagePad.enabled = false;
  }
  if (sections.damagePad.mode !== 'stock') {
    delete sections.damagePad.defaultImage;
    delete sections.damagePad.images;
  }
  return sections;
}

function buildDefaultLayout(fields, sections) {
  const items = (fields || []).filter(f => f?.id).map(f => ({ type: 'field', id: f.id }));
  for (const key of FORM_SECTION_KEYS) {
    items.push({ type: 'section', key });
  }
  return items;
}

function sanitizeLayout(layout, fields, sections) {
  const fieldIds = new Set((fields || []).map(f => f.id).filter(Boolean));
  const seen = new Set();
  const result = [];

  const push = item => {
    const token = item.type === 'field' ? `f:${item.id}` : `s:${item.key}`;
    if (seen.has(token)) return;
    seen.add(token);
    result.push(item);
  };

  if (Array.isArray(layout)) {
    for (const item of layout) {
      if (!item || typeof item !== 'object') continue;
      if (item.type === 'field' && item.id && fieldIds.has(item.id)) {
        push({ type: 'field', id: item.id });
      } else if (item.type === 'section' && FORM_SECTION_KEYS.includes(item.key)) {
        push({ type: 'section', key: item.key });
      }
    }
  }

  for (const f of fields || []) {
    if (f?.id && !seen.has(`f:${f.id}`)) push({ type: 'field', id: f.id });
  }
  for (const key of FORM_SECTION_KEYS) {
    if (!seen.has(`s:${key}`)) push({ type: 'section', key });
  }
  return result;
}

/**
 * Object types that always carry a system Condition Code question, even on
 * criteria-based checklists. If a config omits it (e.g. a custom iLPN criteria),
 * it is auto-added hidden (`enabled: false`) so an admin opts in per criteria
 * with the eye toggle — matching how the Default iLPN criteria has always had it.
 */
const SYSTEM_CHECKLIST_FIELDS = {
  ilpn: [
    { id: 'condition_code', label: 'Condition Code', type: 'dropdown', dataSource: 'ilpn_condition_codes' }
  ]
};

/**
 * Ensure this object type's system fields exist on `fields` (mutated in place).
 * A match on `dataSource` or `id` counts as already-present, so an org that
 * renamed the field keeps its version untouched. Returns the ids that were added.
 */
function ensureSystemChecklistFields(fields, objectType) {
  const specs = SYSTEM_CHECKLIST_FIELDS[objectType];
  if (!specs) return [];
  const added = [];
  for (const spec of specs) {
    if (fields.some(f => f && (f.dataSource === spec.dataSource || f.id === spec.id))) continue;
    fields.push({ ...spec, enabled: false });
    added.push(spec.id);
  }
  return added;
}

function normalizeChecklistEntry(raw, objectType) {
  const fields = Array.isArray(raw?.fields) ? JSON.parse(JSON.stringify(raw.fields)) : [];
  const addedSystemIds = ensureSystemChecklistFields(fields, objectType);
  const sections = buildSectionsFromRaw(raw || {}, objectType);
  // Seed layout slots for auto-added system fields ahead of the section rows so
  // sanitizeLayout doesn't park them after signature/photos/damage pad.
  let rawLayout = Array.isArray(raw?.layout) ? JSON.parse(JSON.stringify(raw.layout)) : raw?.layout;
  if (addedSystemIds.length && Array.isArray(rawLayout)) {
    const tokens = addedSystemIds.map(id => ({ type: 'field', id }));
    const firstSectionIdx = rawLayout.findIndex(it => it && it.type === 'section');
    if (firstSectionIdx < 0) rawLayout.push(...tokens);
    else rawLayout.splice(firstSectionIdx, 0, ...tokens);
  }
  const layout = sanitizeLayout(rawLayout, fields, sections);
  return { fields, sections, layout };
}

function defaultCriteriaEntry(list) {
  if (!Array.isArray(list) || !list.length) return null;
  return list.find(c => c.isDefault) || list[list.length - 1];
}

/** Pick a criteria entry by id, falling back to the Default (catch-all) entry. */
function findCriteriaEntry(raw, criteriaId) {
  if (!hasCriteria(raw)) return null;
  if (criteriaId) {
    const found = raw.criteria.find(c => c.id === criteriaId);
    if (found) return found;
  }
  return defaultCriteriaEntry(raw.criteria);
}

function loadChecklistState(config, objectType, criteriaId) {
  const raw = config?.checklists?.[objectType] || { fields: [] };
  const entryRaw = hasCriteria(raw) ? (findCriteriaEntry(raw, criteriaId) || { fields: [] }) : raw;
  const normalized = normalizeChecklistEntry(entryRaw, objectType);
  return {
    fields: normalized.fields,
    sections: normalized.sections,
    layout: normalized.layout
  };
}

function fieldsFromLayout(layout, fields) {
  const byId = new Map((fields || []).filter(f => f?.id).map(f => [f.id, f]));
  const ordered = [];
  for (const item of layout || []) {
    if (item.type === 'field' && byId.has(item.id)) ordered.push(byId.get(item.id));
  }
  for (const f of fields || []) {
    if (f?.id && !ordered.some(x => x.id === f.id)) ordered.push(f);
  }
  return ordered;
}

function checklistStateEqualsDefault(normalized, defaultConfig, objectType) {
  const defaultEntry = normalizeChecklistEntry(defaultConfig?.checklists?.[objectType] || { fields: [] }, objectType);
  return JSON.stringify(normalized) === JSON.stringify(defaultEntry);
}

const CHECKLIST_OBJECT_TYPES = [
  { key: 'trailer', label: 'Trailer' },
  { key: 'po', label: 'PO' },
  { key: 'asn', label: 'ASN' },
  { key: 'ilpn', label: 'iLPN' },
  { key: 'olpn', label: 'oLPN' },
  { key: 'shipment', label: 'Shipment' },
  { key: 'location', label: 'Location' }
];

/** Admin answer-type catalog — stored `type` may differ from `key` for legacy segmented presets. */
const CHECKLIST_FIELD_TYPES = [
  { key: 'yes_no', label: 'Yes / No', icon: 'fa-toggle-on', type: 'segmented', options: ['Yes', 'No'] },
  { key: 'pass_fail', label: 'Pass / Fail', icon: 'fa-check-double', type: 'segmented', options: ['Pass', 'Fail'] },
  { key: 'dropdown', label: 'Dropdown', icon: 'fa-list', type: 'dropdown', options: [] },
  { key: 'multi_select', label: 'Multi-select', icon: 'fa-tags', type: 'multi_select', options: [] },
  { key: 'text', label: 'Text', icon: 'fa-font', type: 'freeform', options: [] },
  { key: 'number', label: 'Number', icon: 'fa-hashtag', type: 'number', options: [] },
  { key: 'traffic_light', label: 'Traffic light', icon: 'fa-circle', type: 'traffic_light', options: ['Stop', 'Caution', 'Go'] },
  { key: 'slider', label: 'Slider', icon: 'fa-sliders', type: 'slider', options: ['None', 'Light', 'Moderate', 'Heavy', 'Severe'] },
  { key: 'gauge', label: 'Gauge', icon: 'fa-gauge-high', type: 'gauge', options: ['Empty', '25%', '50%', '75%', 'Full'] },
  { key: 'color_swatch', label: 'Color Swatch', icon: 'fa-palette', type: 'color_swatch', options: ['#8BC34A', '#CDDC39', '#FFEB3B', '#FF9800'] },
  { key: 'image', label: 'Image', icon: 'fa-image', type: 'image', options: [] }
];

const CHECKLIST_OPTION_FIELD_TYPES = new Set([
  'dropdown', 'multi_select', 'traffic_light', 'slider', 'gauge', 'color_swatch'
]);

function fieldTypeConfigForKey(key) {
  return CHECKLIST_FIELD_TYPES.find(t => t.key === key);
}

function fieldTypeUsesOptions(type) {
  return CHECKLIST_OPTION_FIELD_TYPES.has(type);
}

function minOptionsForFieldType(typeKey) {
  if (typeKey === 'traffic_light') return 3;
  if (typeKey === 'slider' || typeKey === 'gauge') return 2;
  if (typeKey === 'multi_select') return 2;
  if (typeKey === 'color_swatch') return 2;
  if (typeKey === 'dropdown') return 1;
  return 0;
}

function maxOptionsForFieldType(typeKey) {
  if (typeKey === 'traffic_light') return 3;
  return null;
}

function optionsHintForFieldType(typeKey) {
  switch (typeKey) {
    case 'traffic_light':
      return 'Edit each light label directly (red · amber · green, fixed order).';
    case 'slider':
      return 'Add a label for each slider stop (minimum 2). Drag chips to reorder.';
    case 'gauge':
      return 'Add a label for each gauge position (minimum 2). Drag chips to reorder.';
    case 'multi_select':
      return 'Add choices inspectors can tap — multiple allowed (minimum 2). Drag chips to reorder.';
    case 'color_swatch':
      return 'Pick the range of colors inspectors can match against (minimum 2). Drag chips to reorder.';
    default:
      return 'Add at least one option. Drag chips to reorder.';
  }
}

function typeKeyForChecklistField(field) {
  if (!field?.type) return null;
  if (field.type === 'freeform') return 'text';
  if (field.type === 'dropdown' && !field.dataSource) return 'dropdown';
  if (field.type === 'multi_select') return 'multi_select';
  if (field.type === 'traffic_light') return 'traffic_light';
  if (field.type === 'slider') return 'slider';
  if (field.type === 'gauge') return 'gauge';
  if (field.type === 'color_swatch') return 'color_swatch';
  if (field.type === 'image') return 'image';
  if (field.type === 'number') return 'number';
  if (field.type === 'segmented' && field.options?.join(',') === 'Pass,Fail') return 'pass_fail';
  if (field.type === 'segmented') return 'yes_no';
  return null;
}

function applyChecklistFieldType(field, typeKey) {
  const def = fieldTypeConfigForKey(typeKey);
  if (!def) return;
  field.type = def.type;
  delete field.dataSource;
  delete field.default;
  if (def.type === 'freeform') {
    delete field.options;
    delete field.description;
    field.placeholder = field.placeholder || '';
    delete field.useItemImage;
    delete field.imageUrl;
    delete field.unit;
    delete field.min;
    delete field.max;
  } else if (def.type === 'number') {
    delete field.options;
    delete field.description;
    delete field.gaugeColors;
    field.placeholder = field.placeholder || '';
    field.unit = field.unit || '';
    if (!('min' in field)) field.min = null;
    if (!('max' in field)) field.max = null;
    delete field.useItemImage;
    delete field.imageUrl;
  } else if (def.type === 'gauge') {
    field.options = Array.isArray(field.options) && field.options.length ? [...field.options] : [...def.options];
    field.description = field.description || '';
    if (field.gaugeColors !== 'red_to_green') delete field.gaugeColors;
    delete field.placeholder;
    delete field.useItemImage;
    delete field.imageUrl;
    delete field.unit;
    delete field.min;
    delete field.max;
  } else if (def.type === 'image') {
    delete field.options;
    delete field.description;
    delete field.gaugeColors;
    delete field.placeholder;
    delete field.default;
    delete field.unit;
    delete field.min;
    delete field.max;
    if (typeof field.useItemImage !== 'boolean') field.useItemImage = false;
    field.imageUrl = field.imageUrl || '';
  } else if (fieldTypeUsesOptions(def.type)) {
    field.options = Array.isArray(field.options) && field.options.length ? [...field.options] : [...(def.options || [])];
    delete field.description;
    delete field.gaugeColors;
    delete field.placeholder;
    delete field.useItemImage;
    delete field.imageUrl;
    delete field.unit;
    delete field.min;
    delete field.max;
  } else {
    field.options = [...def.options];
    delete field.description;
    delete field.gaugeColors;
    delete field.placeholder;
    delete field.useItemImage;
    delete field.imageUrl;
    delete field.unit;
    delete field.min;
    delete field.max;
  }
}

function isGaugeRedToGreen(field) {
  return field?.gaugeColors === 'red_to_green';
}

function effectiveSliderDefault(field) {
  const opts = optionLabelsForField(field);
  if (!opts.length) return null;
  const raw = field?.default;
  if (raw != null && raw !== '' && opts.includes(String(raw))) return String(raw);
  return opts[0];
}

function optionLabelsForField(field) {
  return Array.isArray(field?.options) ? field.options.filter(Boolean) : [];
}

function isValueAllowedForField(field, value) {
  if (value == null || value === '') return false;
  const labels = optionLabelsForField(field);
  if (field.type === 'multi_select') {
    const parts = String(value).split(',').map(s => s.trim()).filter(Boolean);
    return parts.length > 0 && parts.every(p => labels.includes(p));
  }
  return labels.includes(String(value));
}

/** A blank value is never "out of range" here — that's the required-field check's job. */
function isNumberValueInRange(field, rawValue) {
  if (rawValue === '' || rawValue == null) return true;
  const num = Number(rawValue);
  if (Number.isNaN(num)) return false;
  if (field?.min != null && field.min !== '' && num < Number(field.min)) return false;
  if (field?.max != null && field.max !== '' && num > Number(field.max)) return false;
  return true;
}

function cloneChecklistFields(config, objectType, criteriaId) {
  return loadChecklistState(config, objectType, criteriaId).fields;
}

function isAdminEditableField(field) {
  if (!field) return false;
  if (field.dataSource) return false;
  if (field.type === 'toggle_pair') return false;
  return field.type === 'segmented'
    || field.type === 'dropdown'
    || field.type === 'freeform'
    || field.type === 'traffic_light'
    || field.type === 'slider'
    || field.type === 'multi_select'
    || field.type === 'gauge'
    || field.type === 'color_swatch'
    || field.type === 'image'
    || field.type === 'number';
}

function isSystemField(field) {
  if (!field) return false;
  return !!field.dataSource || field.type === 'toggle_pair';
}

function isFieldEnabledInForm(field) {
  return !field || field.enabled !== false;
}

function fieldsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function loadOrgDraftForOrg(org) {
  const normalizedOrg = org ? String(org).trim().toUpperCase() : '';
  if (!normalizedOrg) return { checklists: {} };
  try {
    const raw = await fetchChecklistJson(`/config/orgs/${encodeURIComponent(normalizedOrg)}.json`);
    return {
      checklists: raw.checklists ? JSON.parse(JSON.stringify(raw.checklists)) : {}
    };
  } catch {
    return { checklists: {} };
  }
}

/** Preserve explicit section flags (e.g. required: false) from live admin state. */
function serializeSectionsForStorage(stateSections, objectType) {
  const defaults = getDefaultSectionsForType(objectType);
  const out = {};
  for (const key of FORM_SECTION_KEYS) {
    const src = stateSections?.[key] || {};
    const base = JSON.parse(JSON.stringify(defaults[key]));
    out[key] = { ...base, ...JSON.parse(JSON.stringify(src)) };
    out[key].enabled = 'enabled' in src ? src.enabled !== false : base.enabled !== false;
    out[key].required = 'required' in src ? src.required === true : base.required === true;
    if (!String(out[key].label || '').trim()) out[key].label = base.label;
    if (key === 'damagePad') {
      out[key].mode = src.mode || base.mode || 'stock';
      if (out[key].mode === 'stock') {
        out[key].defaultImage = src.defaultImage || base.defaultImage || 'container';
        out[key].images = Array.isArray(src.images) ? [...src.images] : [...(base.images || ['container', 'trailer'])];
      } else {
        delete out[key].defaultImage;
        delete out[key].images;
      }
      out[key].includeInDocumentUpload = 'includeInDocumentUpload' in src
        ? src.includeInDocumentUpload === true
        : base.includeInDocumentUpload === true;
    }
  }
  return out;
}

/** @deprecated use serializeSectionsForStorage */
function captureSectionsFromState(stateSections, objectType) {
  return serializeSectionsForStorage(stateSections, objectType);
}

function buildChecklistEntryFromState(state, objectType) {
  const fields = Array.isArray(state?.fields) ? JSON.parse(JSON.stringify(state.fields)) : [];
  const sections = serializeSectionsForStorage(state?.sections, objectType);
  const layout = sanitizeLayout(state?.layout, fields, sections);
  return { fields, sections, layout };
}

function cloneChecklistEntryForExport(entry, objectType) {
  if (hasCriteria(entry)) {
    return {
      criteria: entry.criteria.map(c => ({
        id: c.id,
        name: c.name,
        isDefault: !!c.isDefault,
        rule: c.rule ? JSON.parse(JSON.stringify(c.rule)) : null,
        ...buildChecklistEntryFromState({ fields: c.fields, sections: c.sections, layout: c.layout }, objectType)
      }))
    };
  }
  if (!entry) return buildChecklistEntryFromState({ fields: [] }, objectType);
  return buildChecklistEntryFromState({
    fields: entry.fields,
    sections: entry.sections,
    layout: entry.layout
  }, objectType);
}

/**
 * Write the currently-edited fields/sections/layout back into the draft.
 * For criteria-mode object types, splices into the matching criteria slot
 * (by criteriaId, default Default) so every other rule is left untouched.
 */
function syncChecklistStateToOrgDraft(orgDraft, defaultConfig, objectType, state, checklistsConfig, criteriaId) {
  if (!orgDraft.checklists) orgDraft.checklists = {};
  const entry = JSON.parse(JSON.stringify(buildChecklistEntryFromState(state, objectType)));

  const existingRaw = checklistsConfig?.checklists?.[objectType];
  if (hasCriteria(existingRaw) || criteriaId) {
    const currentDraftRaw = orgDraft.checklists[objectType];
    const baseList = hasCriteria(currentDraftRaw)
      ? currentDraftRaw.criteria
      : (hasCriteria(existingRaw) ? JSON.parse(JSON.stringify(existingRaw.criteria)) : []);
    const targetId = criteriaId || (defaultCriteriaEntry(baseList) || {}).id;
    const idx = baseList.findIndex(c => c.id === targetId);
    const meta = idx >= 0 ? baseList[idx] : { id: targetId, name: 'New Rule', isDefault: false, rule: { conditions: [] } };
    const nextEntry = { ...meta, ...entry };
    if (idx >= 0) baseList[idx] = nextEntry; else baseList.push(nextEntry);

    orgDraft.checklists[objectType] = { criteria: baseList };
    if (!checklistsConfig.checklists) checklistsConfig.checklists = {};
    checklistsConfig.checklists[objectType] = JSON.parse(JSON.stringify(orgDraft.checklists[objectType]));
    return;
  }

  orgDraft.checklists[objectType] = entry;

  if (!checklistsConfig.checklists) checklistsConfig.checklists = {};
  checklistsConfig.checklists[objectType] = JSON.parse(JSON.stringify(entry));
}

/** Sync a criteria-mode object type's whole rule list (names/order/conditions) — e.g. after the rule-builder modal edits it in place. */
function syncCriteriaListToOrgDraft(orgDraft, checklistsConfig, objectType) {
  const raw = checklistsConfig?.checklists?.[objectType];
  if (!hasCriteria(raw)) return;
  if (!orgDraft.checklists) orgDraft.checklists = {};
  orgDraft.checklists[objectType] = { criteria: JSON.parse(JSON.stringify(raw.criteria)) };
}

/** Build a complete per-ORG checklist map (all object types) for save/export/deploy. */
function buildFullOrgChecklistsFromConfig(checklistsConfig, defaultConfig) {
  const checklists = {};
  for (const { key } of CHECKLIST_OBJECT_TYPES) {
    const raw = checklistsConfig?.checklists?.[key] ?? defaultConfig?.checklists?.[key];
    checklists[key] = normalizeChecklistTypeEntry(raw || { fields: [] }, key);
  }
  return checklists;
}

function initOrgDraftFromChecklistsConfig(checklistsConfig, defaultConfig) {
  return { checklists: buildFullOrgChecklistsFromConfig(checklistsConfig, defaultConfig) };
}

/** Replace org draft + in-memory config from defaults for one object type or all (whole criteria array, for criteria-mode types). */
function applyDefaultChecklistsToOrgDraft(orgDraft, checklistsConfig, defaultConfig, objectTypeKey = null) {
  if (!orgDraft.checklists) orgDraft.checklists = {};
  if (!checklistsConfig.checklists) checklistsConfig.checklists = {};
  const types = objectTypeKey
    ? CHECKLIST_OBJECT_TYPES.filter(t => t.key === objectTypeKey)
    : CHECKLIST_OBJECT_TYPES;
  for (const { key } of types) {
    const defaultRaw = defaultConfig?.checklists?.[key] || { fields: [] };
    const entry = JSON.parse(JSON.stringify(normalizeChecklistTypeEntry(defaultRaw, key)));
    orgDraft.checklists[key] = entry;
    checklistsConfig.checklists[key] = JSON.parse(JSON.stringify(entry));
  }
}

/** @deprecated use syncChecklistStateToOrgDraft */
function syncFieldsToOrgDraft(orgDraft, defaultConfig, objectType, fields, checklistsConfig) {
  syncChecklistStateToOrgDraft(orgDraft, defaultConfig, objectType, {
    fields,
    sections: checklistsConfig?.checklists?.[objectType]?.sections || getDefaultSectionsForType(objectType),
    layout: checklistsConfig?.checklists?.[objectType]?.layout || buildDefaultLayout(fields, getDefaultSectionsForType(objectType))
  }, checklistsConfig);
}

function buildOrgSavePayload(org, orgDraft, checklistsConfig, liveState, defaultConfig) {
  if (liveState?.objectType) {
    syncChecklistStateToOrgDraft(
      orgDraft,
      null,
      liveState.objectType,
      {
        fields: liveState.fields,
        sections: liveState.sections,
        layout: liveState.layout
      },
      checklistsConfig,
      liveState.criteriaId
    );
  }

  const checklists = {};
  for (const { key } of CHECKLIST_OBJECT_TYPES) {
    const entry = orgDraft?.checklists?.[key]
      ?? checklistsConfig?.checklists?.[key]
      ?? defaultConfig?.checklists?.[key];
    checklists[key] = cloneChecklistEntryForExport(entry, key);
  }
  return {
    org: String(org || '').trim().toUpperCase(),
    updatedAt: new Date().toISOString(),
    checklists
  };
}

const CHECKLIST_OBJECT_TYPE_KEYS = new Set(CHECKLIST_OBJECT_TYPES.map(t => t.key));

/** Normalize an imported criteria array: guarantee exactly one Default (catch-all, always last),
 *  preserve existing ids where present, and normalize each rule's fields/sections/layout. */
function normalizeImportedCriteriaList(rawCriteria, typeKey) {
  const seen = new Set();
  const list = rawCriteria
    .filter(c => c && typeof c === 'object')
    .map(c => {
      const normalizedEntry = normalizeChecklistEntry(c, typeKey);
      let id = c.isDefault ? 'default' : (c.id || newCriteriaId());
      while (seen.has(id)) id = newCriteriaId();
      seen.add(id);
      return {
        id,
        name: c.name || (c.isDefault ? 'Default' : 'New Rule'),
        isDefault: !!c.isDefault,
        rule: c.isDefault ? null : { conditions: Array.isArray(c.rule?.conditions) ? c.rule.conditions : [] },
        ...normalizedEntry
      };
    });

  const rules = list.filter(c => !c.isDefault);
  const defaultEntry = list.find(c => c.isDefault) || {
    id: 'default', name: 'Default', isDefault: true, rule: null, fields: [], sections: {}, layout: []
  };
  return [...rules, { ...defaultEntry, id: 'default', isDefault: true, rule: null }];
}

/**
 * Returns { checklists, notes } — notes flags any type imported as a flat/legacy shape (no
 * "criteria" array) for an object type this app now treats as criteria-driven; that flat shape
 * becomes the Default (catch-all) criteria, since Default is exactly the one fixed checklist
 * this type used to have before rule-based criteria existed.
 */
function normalizeImportedOrgConfig(raw, referenceConfig) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid file — expected a JSON object');
  }
  const checklists = raw.checklists;
  if (!checklists || typeof checklists !== 'object' || Array.isArray(checklists)) {
    throw new Error('Invalid file — expected a "checklists" object');
  }
  const normalized = { checklists: {} };
  const notes = [];
  for (const [typeKey, entry] of Object.entries(checklists)) {
    if (!CHECKLIST_OBJECT_TYPE_KEYS.has(typeKey)) continue;
    if (!entry || typeof entry !== 'object') continue;

    if (Array.isArray(entry.criteria)) {
      normalized.checklists[typeKey] = { criteria: normalizeImportedCriteriaList(entry.criteria, typeKey) };
      continue;
    }

    if (!Array.isArray(entry.fields)) continue;
    const item = normalizeChecklistEntry(entry, typeKey);

    if (hasCriteria(referenceConfig?.checklists?.[typeKey])) {
      normalized.checklists[typeKey] = {
        criteria: [{
          id: 'default', name: 'Default', isDefault: true, rule: null,
          fields: item.fields, sections: item.sections, layout: item.layout
        }]
      };
      notes.push(`${typeKey}: file had no "criteria" — applied as the Default rule`);
    } else {
      normalized.checklists[typeKey] = {
        fields: item.fields,
        sections: item.sections,
        layout: item.layout
      };
    }
  }
  if (!Object.keys(normalized.checklists).length) {
    throw new Error('No valid checklist types found — need at least one object type with a "fields" or "criteria" array');
  }
  return { checklists: normalized.checklists, notes };
}

function applyOrgDraftFromImport(orgDraft, imported) {
  if (!orgDraft.checklists) orgDraft.checklists = {};
  for (const [typeKey, entry] of Object.entries(imported.checklists || {})) {
    orgDraft.checklists[typeKey] = JSON.parse(JSON.stringify(entry));
  }
}

function sectionSummaryLabel(key, sections) {
  const sec = sections?.[key];
  if (!sec?.enabled) return 'OFF';
  if (key === 'damagePad') {
    return sec.mode === 'photo' ? 'Camera photo' : 'Stock diagram';
  }
  return 'ON';
}

function sectionTypeBadge(key) {
  if (key === 'signature') return 'Signature';
  if (key === 'photos') return 'Photos';
  if (key === 'damagePad') return 'Markup Pad';
  return 'Section';
}

function layoutItemKey(item) {
  return item.type === 'field' ? `field:${item.id}` : `section:${item.key}`;
}

function findLayoutIndex(layout, { type, id, key }) {
  return (layout || []).findIndex(item => {
    if (type === 'field') return item.type === 'field' && item.id === id;
    return item.type === 'section' && item.key === key;
  });
}

function addFieldToLayout(layout, fieldId) {
  if (!fieldId) return layout;
  const next = [...(layout || [])];
  if (findLayoutIndex(next, { type: 'field', id: fieldId }) >= 0) return next;
  next.push({ type: 'field', id: fieldId });
  return next;
}

function removeFieldFromLayout(layout, fieldId) {
  return (layout || []).filter(item => !(item.type === 'field' && item.id === fieldId));
}
