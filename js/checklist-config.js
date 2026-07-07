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
