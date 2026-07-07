/** Checklist config load/merge — shared by inspection app and admin UI */

function mergeChecklistConfigs(base, orgOverlay) {
  const result = JSON.parse(JSON.stringify(base));
  if (!orgOverlay?.checklists) return result;
  for (const [typeKey, orgChecklist] of Object.entries(orgOverlay.checklists)) {
    if (!result.checklists) result.checklists = {};
    if (!result.checklists[typeKey]) result.checklists[typeKey] = {};
    if (Array.isArray(orgChecklist.fields)) {
      result.checklists[typeKey].fields = JSON.parse(JSON.stringify(orgChecklist.fields));
    }
  }
  return result;
}

async function fetchChecklistJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
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
  if (!normalizedOrg) return base;
  try {
    const orgCfg = await fetchChecklistJson(`/config/orgs/${encodeURIComponent(normalizedOrg)}.json`);
    return mergeChecklistConfigs(base, orgCfg);
  } catch {
    return base;
  }
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
  const fields = config?.checklists?.[objectType]?.fields;
  return fields ? JSON.parse(JSON.stringify(fields)) : [];
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

function syncFieldsToOrgDraft(orgDraft, defaultConfig, objectType, fields, checklistsConfig) {
  if (!orgDraft.checklists) orgDraft.checklists = {};
  const defaultFields = cloneChecklistFields(defaultConfig, objectType);
  const nextFields = JSON.parse(JSON.stringify(fields));
  if (fieldsEqual(nextFields, defaultFields)) {
    delete orgDraft.checklists[objectType];
  } else {
    orgDraft.checklists[objectType] = { fields: nextFields };
  }
  if (!checklistsConfig.checklists) checklistsConfig.checklists = {};
  if (!checklistsConfig.checklists[objectType]) checklistsConfig.checklists[objectType] = {};
  checklistsConfig.checklists[objectType].fields = nextFields;
}

function buildOrgSavePayload(org, orgDraft) {
  return {
    org: String(org || '').trim().toUpperCase(),
    updatedAt: new Date().toISOString(),
    checklists: orgDraft?.checklists || {}
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
    normalized.checklists[typeKey] = {
      fields: JSON.parse(JSON.stringify(entry.fields))
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
