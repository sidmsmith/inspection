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
  { key: 'shipment', label: 'Shipment' }
];

function cloneChecklistFields(config, objectType) {
  return loadChecklistState(config, objectType).fields;
}

function isAdminEditableField(field) {
  if (!field) return false;
  if (field.dataSource) return false;
  if (field.type === 'toggle_pair') return false;
  return field.type === 'segmented' || field.type === 'dropdown' || field.type === 'freeform';
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

function syncChecklistStateToOrgDraft(orgDraft, defaultConfig, objectType, state, checklistsConfig) {
  if (!orgDraft.checklists) orgDraft.checklists = {};
  const normalized = normalizeChecklistEntry({
    fields: state.fields,
    sections: state.sections,
    layout: state.layout
  }, objectType);

  orgDraft.checklists[objectType] = {
    fields: normalized.fields,
    sections: normalized.sections,
    layout: normalized.layout
  };

  if (!checklistsConfig.checklists) checklistsConfig.checklists = {};
  checklistsConfig.checklists[objectType] = normalized;
}

/** Build a complete per-ORG checklist map (all object types) for save/export/deploy. */
function buildFullOrgChecklistsFromConfig(checklistsConfig) {
  const checklists = {};
  for (const { key } of CHECKLIST_OBJECT_TYPES) {
    const raw = checklistsConfig?.checklists?.[key];
    const normalized = raw?.sections && raw?.layout
      ? normalizeChecklistEntry(raw, key)
      : normalizeChecklistEntry(raw || { fields: [] }, key);
    checklists[key] = {
      fields: normalized.fields,
      sections: normalized.sections,
      layout: normalized.layout
    };
  }
  return checklists;
}

function initOrgDraftFromChecklistsConfig(checklistsConfig) {
  return { checklists: buildFullOrgChecklistsFromConfig(checklistsConfig) };
}

/** @deprecated use syncChecklistStateToOrgDraft */
function syncFieldsToOrgDraft(orgDraft, defaultConfig, objectType, fields, checklistsConfig) {
  syncChecklistStateToOrgDraft(orgDraft, defaultConfig, objectType, {
    fields,
    sections: checklistsConfig?.checklists?.[objectType]?.sections || getDefaultSectionsForType(objectType),
    layout: checklistsConfig?.checklists?.[objectType]?.layout || buildDefaultLayout(fields, getDefaultSectionsForType(objectType))
  }, checklistsConfig);
}

function buildOrgSavePayload(org, orgDraft, checklistsConfig) {
  const checklists = checklistsConfig
    ? buildFullOrgChecklistsFromConfig(checklistsConfig)
    : (orgDraft?.checklists || {});
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
  orgDraft.checklists = JSON.parse(JSON.stringify(imported.checklists || {}));
}

function sectionSummaryLabel(key, sections) {
  const sec = sections?.[key];
  if (!sec?.enabled) return 'Off';
  const req = sec.required ? ' · required' : '';
  if (key === 'damagePad') {
    const mode = sec.mode === 'photo' ? 'Camera photo' : 'Stock diagram';
    return `${mode}${req}`;
  }
  return `On${req}`;
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
