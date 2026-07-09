/** Checklist config load/merge — shared by inspection app and admin UI */

const FORM_SECTION_KEYS = ['signature', 'photos', 'damagePad'];

const DEFAULT_SECTION_LABELS = {
  signature: "Inspector's Signature",
  photos: 'Inspection Photos',
  damagePad: 'Markup Pad'
};

function mergeChecklistConfigs(base, orgOverlay) {
  const result = JSON.parse(JSON.stringify(base));
  if (!orgOverlay?.checklists) return result;
  for (const [typeKey, orgChecklist] of Object.entries(orgOverlay.checklists)) {
    if (!result.checklists) result.checklists = {};
    if (!result.checklists[typeKey]) result.checklists[typeKey] = {};
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

function normalizeAllChecklists(config) {
  if (!config?.checklists) return config;
  const next = JSON.parse(JSON.stringify(config));
  for (const typeKey of Object.keys(next.checklists)) {
    next.checklists[typeKey] = normalizeChecklistEntry(next.checklists[typeKey], typeKey);
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
      images: ['container', 'trailer']
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

function normalizeChecklistEntry(raw, objectType) {
  const fields = Array.isArray(raw?.fields) ? JSON.parse(JSON.stringify(raw.fields)) : [];
  const sections = buildSectionsFromRaw(raw || {}, objectType);
  const layout = sanitizeLayout(raw?.layout, fields, sections);
  return { fields, sections, layout };
}

function loadChecklistState(config, objectType) {
  const raw = config?.checklists?.[objectType] || { fields: [] };
  const normalized = normalizeChecklistEntry(raw, objectType);
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
  { key: 'traffic_light', label: 'Traffic light', icon: 'fa-circle', type: 'traffic_light', options: ['Stop', 'Caution', 'Go'] },
  { key: 'slider', label: 'Slider', icon: 'fa-sliders', type: 'slider', options: ['None', 'Light', 'Moderate', 'Heavy', 'Severe'] },
  { key: 'gauge', label: 'Gauge', icon: 'fa-gauge-high', type: 'gauge', options: ['Empty', '25%', '50%', '75%', 'Full'] }
];

const CHECKLIST_OPTION_FIELD_TYPES = new Set([
  'dropdown', 'multi_select', 'traffic_light', 'slider', 'gauge'
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
  } else if (def.type === 'gauge') {
    field.options = Array.isArray(field.options) && field.options.length ? [...field.options] : [...def.options];
    field.description = field.description || '';
    if (field.gaugeColors !== 'red_to_green') delete field.gaugeColors;
    delete field.placeholder;
  } else if (fieldTypeUsesOptions(def.type)) {
    field.options = Array.isArray(field.options) && field.options.length ? [...field.options] : [...(def.options || [])];
    delete field.description;
    delete field.gaugeColors;
    delete field.placeholder;
  } else {
    field.options = [...def.options];
    delete field.description;
    delete field.gaugeColors;
    delete field.placeholder;
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

function cloneChecklistFields(config, objectType) {
  return loadChecklistState(config, objectType).fields;
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
    || field.type === 'gauge';
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
  if (!entry) return buildChecklistEntryFromState({ fields: [] }, objectType);
  return buildChecklistEntryFromState({
    fields: entry.fields,
    sections: entry.sections,
    layout: entry.layout
  }, objectType);
}

function syncChecklistStateToOrgDraft(orgDraft, defaultConfig, objectType, state, checklistsConfig) {
  if (!orgDraft.checklists) orgDraft.checklists = {};
  const entry = JSON.parse(JSON.stringify(buildChecklistEntryFromState(state, objectType)));

  orgDraft.checklists[objectType] = entry;

  if (!checklistsConfig.checklists) checklistsConfig.checklists = {};
  checklistsConfig.checklists[objectType] = JSON.parse(JSON.stringify(entry));
}

/** Build a complete per-ORG checklist map (all object types) for save/export/deploy. */
function buildFullOrgChecklistsFromConfig(checklistsConfig, defaultConfig) {
  const checklists = {};
  for (const { key } of CHECKLIST_OBJECT_TYPES) {
    const raw = checklistsConfig?.checklists?.[key] ?? defaultConfig?.checklists?.[key];
    const normalized = normalizeChecklistEntry(raw || { fields: [] }, key);
    checklists[key] = {
      fields: normalized.fields,
      sections: normalized.sections,
      layout: normalized.layout
    };
  }
  return checklists;
}

function initOrgDraftFromChecklistsConfig(checklistsConfig, defaultConfig) {
  return { checklists: buildFullOrgChecklistsFromConfig(checklistsConfig, defaultConfig) };
}

/** Replace org draft + in-memory config from defaults for one object type or all. */
function applyDefaultChecklistsToOrgDraft(orgDraft, checklistsConfig, defaultConfig, objectTypeKey = null) {
  if (!orgDraft.checklists) orgDraft.checklists = {};
  if (!checklistsConfig.checklists) checklistsConfig.checklists = {};
  const types = objectTypeKey
    ? CHECKLIST_OBJECT_TYPES.filter(t => t.key === objectTypeKey)
    : CHECKLIST_OBJECT_TYPES;
  for (const { key } of types) {
    const state = loadChecklistState(defaultConfig, key);
    const entry = JSON.parse(JSON.stringify(buildChecklistEntryFromState(state, key)));
    orgDraft.checklists[key] = entry;
    checklistsConfig.checklists[key] = entry;
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
      checklistsConfig
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

function normalizeImportedOrgConfig(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid file — expected a JSON object');
  }
  const checklists = raw.checklists;
  if (!checklists || typeof checklists !== 'object' || Array.isArray(checklists)) {
    throw new Error('Invalid file — expected a "checklists" object');
  }
  const normalized = { checklists: {} };
  for (const [typeKey, entry] of Object.entries(checklists)) {
    if (!CHECKLIST_OBJECT_TYPE_KEYS.has(typeKey)) continue;
    if (!entry || !Array.isArray(entry.fields)) continue;
    const item = normalizeChecklistEntry(entry, typeKey);
    normalized.checklists[typeKey] = {
      fields: item.fields,
      sections: item.sections,
      layout: item.layout
    };
  }
  if (!Object.keys(normalized.checklists).length) {
    throw new Error('No valid checklist types found — need at least one object type with a "fields" array');
  }
  return normalized;
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
