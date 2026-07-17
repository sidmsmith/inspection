/** PO checklist seed — from inspection/config/checklists.json */

const PO_CHECKLIST_META = {

  objectType: 'po',

  objectLabel: 'PO',

  note: 'Signature pad, damage diagram, and photos are always included (not configured here).'

};



const DEFAULT_PO_FIELDS = [

  {

    id: 'po_details_match',

    label: 'PO # And Details Match',

    type: 'segmented',

    options: ['Yes', 'No'],

    default: 'Yes'

  },

  {

    id: 'items_skus_correct',

    label: 'Items / SKUs Correct',

    type: 'segmented',

    options: ['Yes', 'No'],

    default: 'No'

  },

  {

    id: 'quantities_match',

    label: 'Quantities Match',

    type: 'segmented',

    options: ['Yes', 'No']

  },

  {

    id: 'delivery_date_on_track',

    label: 'Delivery Date On Track',

    type: 'dropdown',

    options: ['Delayed', 'Early', 'On Time'],

    required: true,

    default: 'Delayed'

  },

  {

    id: 'special_instructions_met',

    label: 'Special Instructions Met',

    type: 'segmented',

    options: ['Yes', 'No']

  },

  {

    id: 'approvals_complete',

    label: 'Approvals Complete',

    type: 'segmented',

    options: ['Yes', 'No']

  },

  {

    id: 'compliance_requirements',

    label: 'Compliance Requirements',

    type: 'segmented',

    options: ['Yes', 'No']

  },

  {

    id: 'amendments_noted',

    label: 'Amendments Noted',

    type: 'freeform',

    placeholder: 'None / Details here...',

    default: 'None'

  }

];



function clonePoFields() {

  return JSON.parse(JSON.stringify(DEFAULT_PO_FIELDS));

}

