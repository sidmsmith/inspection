/** Shared helpers for checklist config UI samples */

const FIELD_TYPES = [
  { key: 'yes_no', label: 'Yes / No', icon: 'fa-toggle-on', type: 'segmented', options: ['Yes', 'No'] },
  { key: 'pass_fail', label: 'Pass / Fail', icon: 'fa-check-double', type: 'segmented', options: ['Pass', 'Fail'] },
  { key: 'dropdown', label: 'Pick one', icon: 'fa-list', type: 'dropdown', options: ['Option A', 'Option B'] },
  { key: 'text', label: 'Text', icon: 'fa-font', type: 'freeform', options: [] }
];

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function slugifyId(label) {
  return String(label || 'question')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48) || 'question';
}

function typeKeyForField(field) {
  if (field.type === 'freeform') return 'text';
  if (field.type === 'dropdown') return 'dropdown';
  if (field.type === 'segmented' && field.options?.join(',') === 'Pass,Fail') return 'pass_fail';
  return 'yes_no';
}

function typeLabelForField(field) {
  const key = typeKeyForField(field);
  return FIELD_TYPES.find(t => t.key === key)?.label || field.type;
}

function applyFieldType(field, typeKey) {
  const def = FIELD_TYPES.find(t => t.key === typeKey);
  if (!def) return;
  field.type = def.type;
  field.options = [...def.options];
  if (field.type === 'freeform') {
    delete field.options;
    field.placeholder = field.placeholder || '';
  } else {
    delete field.placeholder;
  }
}

function bindAuth({ orgInput, authBtn, orgSection, mainUI, statusEl, onAuth }) {
  async function authenticate() {
    const org = orgInput.value.trim().toUpperCase();
    if (!org) {
      statusEl.textContent = 'ORG required';
      statusEl.className = 'app-status text-danger';
      return;
    }
    authBtn.disabled = true;
    statusEl.textContent = 'Authenticating...';
    statusEl.className = 'app-status';
    await new Promise(r => setTimeout(r, 400));
    statusEl.textContent = `Authenticated — editing ${org} PO checklist`;
    statusEl.className = 'app-status text-success';
    orgSection.style.display = 'none';
    mainUI.style.display = 'block';
    authBtn.disabled = false;
    onAuth(org);
  }

  authBtn.onclick = authenticate;
  orgInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') authenticate();
  });
}

function renderOptionChips(container, options, onChange) {
  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'option-chips';

  function emit() {
    onChange([...options]);
  }

  function renderChips() {
    wrap.querySelectorAll('.option-chip').forEach(el => el.remove());
    options.forEach((opt, idx) => {
      const chip = document.createElement('span');
      chip.className = 'option-chip';
      chip.innerHTML = `${escapeHtml(opt)} <button type="button" class="chip-remove" aria-label="Remove">×</button>`;
      chip.querySelector('.chip-remove').onclick = e => {
        e.stopPropagation();
        options.splice(idx, 1);
        emit();
        renderChips();
      };
      wrap.insertBefore(chip, input);
    });
  }

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'chip-add-input';
  input.placeholder = '+ Add option';
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = input.value.trim();
      if (val && !options.includes(val)) {
        options.push(val);
        input.value = '';
        emit();
        renderChips();
      }
    }
  });

  wrap.appendChild(input);
  container.appendChild(wrap);
  renderChips();
}

function renderTypePicker(container, selectedKey, onSelect) {
  container.innerHTML = FIELD_TYPES.map(t => `
    <button type="button" class="type-btn${t.key === selectedKey ? ' active' : ''}" data-key="${t.key}">
      <i class="fa-solid ${t.icon}"></i>
      <span>${escapeHtml(t.label)}</span>
    </button>
  `).join('');
  container.querySelectorAll('.type-btn').forEach(btn => {
    btn.onclick = () => onSelect(btn.dataset.key);
  });
}

function renderPreview(fields, container) {
  const fixed = `
    <div class="preview-fixed">
      <i class="fa-solid fa-lock me-1"></i>
      Always included: damage diagram, inspection photos, signature pad
    </div>`;

  if (!fields.length) {
    container.innerHTML = `
      <div class="preview-form">
        <p class="text-muted mb-0">No questions yet — add one to preview the PO form.</p>
        ${fixed}
      </div>`;
    return;
  }

  const html = fields.map(field => {
    const req = field.required ? '<span class="required-asterisk">*</span>' : '';
    let control = '';
    if (field.type === 'segmented') {
      control = `<div class="preview-segmented">${(field.options || []).map((o, i) =>
        `<span class="seg${i === 0 ? ' on' : ''}">${escapeHtml(o)}</span>`
      ).join('')}</div>`;
    } else if (field.type === 'dropdown') {
      control = `<select class="form-select form-select-sm" disabled><option>${escapeHtml(field.options?.[0] || '')}</option></select>`;
    } else {
      control = `<input type="text" class="form-control form-control-sm" disabled placeholder="${escapeHtml(field.placeholder || '')}" />`;
    }
    return `<div class="form-group"><label>${escapeHtml(field.label)}${req}</label>${control}</div>`;
  }).join('');

  container.innerHTML = `<div class="preview-form">${html}${fixed}</div>`;
}

function createEditorForm({ field, onSave, onCancel }) {
  const wrap = document.createElement('div');
  wrap.className = 'editor-panel';
  const isNew = !field.id;
  const working = JSON.parse(JSON.stringify(field));

  wrap.innerHTML = `
    <h3>${isNew ? 'Add question' : 'Edit question'}</h3>
    <div class="mb-3">
      <label class="form-label">Question</label>
      <input type="text" class="form-control" id="edLabel" value="${escapeHtml(working.label)}" placeholder="e.g. Quantities Match" />
    </div>
    <div class="mb-3">
      <label class="form-label">Answer type</label>
      <div id="edTypePicker"></div>
    </div>
    <div class="mb-3" id="edOptionsWrap">
      <label class="form-label">Options</label>
      <div id="edOptions"></div>
    </div>
    <div class="mb-3 form-check">
      <input type="checkbox" class="form-check-input" id="edRequired" ${working.required ? 'checked' : ''} />
      <label class="form-check-label" for="edRequired">Required</label>
    </div>
    <div class="d-flex gap-2 flex-wrap">
      <button type="button" class="btn btn-primary" id="edSave">${isNew ? 'Add' : 'Save'}</button>
      <button type="button" class="btn btn-secondary" id="edCancel">Cancel</button>
    </div>
  `;

  const typePicker = wrap.querySelector('#edTypePicker');
  const optionsWrap = wrap.querySelector('#edOptionsWrap');
  const optionsHost = wrap.querySelector('#edOptions');
  let options = working.options ? [...working.options] : [];

  function syncOptionsVisibility() {
    const key = typeKeyForField(working);
    optionsWrap.style.display = key === 'dropdown' ? 'block' : 'none';
  }

  function refreshTypePicker() {
    renderTypePicker(typePicker, typeKeyForField(working), key => {
      applyFieldType(working, key);
      if (key === 'dropdown' && !working.options?.length) {
        working.options = ['Option A', 'Option B'];
        options = [...working.options];
      }
      syncOptionsVisibility();
      refreshTypePicker();
      if (key === 'dropdown') {
        renderOptionChips(optionsHost, options, next => {
          options = next;
          working.options = [...options];
        });
      }
    });
  }

  refreshTypePicker();
  if (working.type === 'dropdown') {
    renderOptionChips(optionsHost, options, next => {
      options = next;
      working.options = [...options];
    });
  }
  syncOptionsVisibility();

  wrap.querySelector('#edSave').onclick = () => {
    const label = wrap.querySelector('#edLabel').value.trim();
    if (!label) return;
    working.label = label;
    working.id = working.id || slugifyId(label);
    working.required = wrap.querySelector('#edRequired').checked;
    if (working.type === 'dropdown') working.options = [...options];
    onSave(working);
  };
  wrap.querySelector('#edCancel').onclick = onCancel;

  return wrap;
}

function confirmClear() {
  return window.confirm('Clear all PO questions and start from scratch?');
}

function mockSaveDeploy(statusEl) {
  statusEl.textContent = 'Save & Deploy — sample only (would commit to GitHub and redeploy)';
  statusEl.className = 'app-status text-success';
  setTimeout(() => {
    statusEl.textContent = 'Ready — changes are local in this sample';
    statusEl.className = 'app-status';
  }, 3000);
}
