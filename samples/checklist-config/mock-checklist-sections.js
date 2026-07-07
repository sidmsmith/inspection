/** Per-object-type form section defaults — mirrors inspection/config/checklists.default.json shape (sample). */

const SAMPLE_SECTION_OBJECT_TYPES = [
  { key: 'po', label: 'PO' },
  { key: 'ilpn', label: 'iLPN' },
  { key: 'trailer', label: 'Trailer' }
];

const DEFAULT_SECTIONS_BY_TYPE = {
  po: {
    signature: { enabled: true, required: true },
    photos: { enabled: true, required: false },
    damagePad: {
      enabled: true,
      required: false,
      mode: 'stock',
      defaultImage: 'container',
      images: ['container', 'trailer']
    }
  },
  ilpn: {
    signature: { enabled: true, required: true },
    photos: { enabled: true, required: false },
    damagePad: {
      enabled: true,
      required: false,
      mode: 'photo'
    }
  },
  trailer: {
    signature: { enabled: true, required: true },
    photos: { enabled: true, required: false },
    damagePad: {
      enabled: true,
      required: false,
      mode: 'stock',
      defaultImage: 'container',
      images: ['container', 'trailer']
    }
  }
};

function cloneSectionsForType(objectType) {
  const base = DEFAULT_SECTIONS_BY_TYPE[objectType] || DEFAULT_SECTIONS_BY_TYPE.po;
  return JSON.parse(JSON.stringify(base));
}

const DEFAULT_ILPN_FIELDS = [
  { id: 'label_present_legible', label: 'Label Present & Legible', type: 'segmented', options: ['Yes', 'No'], default: 'Yes' },
  { id: 'quantity_matches', label: 'Quantity Matches', type: 'segmented', options: ['Yes', 'No'] },
  { id: 'visible_damage', label: 'Visible Damage', type: 'segmented', options: ['Yes', 'No'], default: 'No' },
  { id: 'ilpn_condition_code', label: 'iLPN Condition Code', type: 'dropdown', options: ['Good', 'Damaged'], required: true }
];

function cloneFieldsForType(objectType) {
  if (objectType === 'ilpn') return JSON.parse(JSON.stringify(DEFAULT_ILPN_FIELDS));
  return clonePoFields();
}

function damagePadTitle(objectType, sections) {
  if (!sections?.damagePad?.enabled) return '';
  if (sections.damagePad.mode === 'photo' && (objectType === 'ilpn' || objectType === 'olpn')) {
    return 'LPN Photo for Markup';
  }
  return 'Damage Diagram';
}
