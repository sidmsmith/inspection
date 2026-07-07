/** Shared helpers for checklist config UI samples */

const FIELD_TYPES = [
  { key: 'yes_no', label: 'Yes / No', icon: 'fa-toggle-on', type: 'segmented', options: ['Yes', 'No'] },
  { key: 'pass_fail', label: 'Pass / Fail', icon: 'fa-check-double', type: 'segmented', options: ['Pass', 'Fail'] },
  { key: 'dropdown', label: 'Pick one', icon: 'fa-list', type: 'dropdown', options: [] },
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
  if (!field?.type) return null;
  if (field.type === 'freeform') return 'text';
  if (field.type === 'dropdown') return 'dropdown';
  if (field.type === 'segmented' && field.options?.join(',') === 'Pass,Fail') return 'pass_fail';
  if (field.type === 'segmented') return 'yes_no';
  return null;
}

function typeLabelForField(field) {
  const key = typeKeyForField(field);
  if (!key) return 'Not set';
  return FIELD_TYPES.find(t => t.key === key)?.label || field.type;
}

function applyFieldType(field, typeKey) {
  const def = FIELD_TYPES.find(t => t.key === typeKey);
  if (!def) return;
  field.type = def.type;
  if (def.type === 'freeform') {
    delete field.options;
    field.placeholder = field.placeholder || '';
  } else if (def.type === 'dropdown') {
    field.options = field.options ? [...field.options] : [];
  } else {
    field.options = [...def.options];
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
    wirePreviewThemeGear();
    onAuth(org);
  }

  authBtn.onclick = authenticate;
  orgInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') authenticate();
  });
}

/**
 * PRODUCTION: Wire this button to the inspection app theme system —
 * reuse themeSelectorBtn, themes{}, applyTheme(), and themeModal from index.html
 * so the preview panel renders with the selected customer theme colors/logo.
 */
function wirePreviewThemeGear() {
  document.querySelectorAll('.preview-theme-gear').forEach(btn => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.onclick = () => {
      console.info(
        '[SAMPLE] Production: open theme modal and apply inspection themes to .preview-form-theme-wrap'
      );
    };
  });
}

function appendAddQuestionButton(container, onClick) {
  const wrap = document.createElement('div');
  wrap.className = 'add-question-row';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'add-question-inline-btn';
  btn.title = 'Add question';
  btn.setAttribute('aria-label', 'Add question');
  btn.innerHTML = '<i class="fa-solid fa-plus"></i>';
  btn.onclick = onClick;
  wrap.appendChild(btn);
  container.appendChild(wrap);
}

function bindDragReorder(listEl, { fields, onReorder, itemSelector = '.draggable-item', gripSelector = '.grip' }) {
  if (!listEl) return;
  let dragFrom = null;

  listEl.querySelectorAll(itemSelector).forEach(item => {
    const grip = item.querySelector(gripSelector);
    if (!grip) return;

    grip.draggable = true;
    grip.addEventListener('dragstart', e => {
      dragFrom = +item.dataset.idx;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragFrom));
      e.stopPropagation();
    });
    grip.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      listEl.querySelectorAll(itemSelector).forEach(i => i.classList.remove('drag-over'));
      dragFrom = null;
    });

    item.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', e => {
      if (!item.contains(e.relatedTarget)) item.classList.remove('drag-over');
    });
    item.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      item.classList.remove('drag-over');
      const to = +item.dataset.idx;
      if (dragFrom == null || dragFrom === to) return;
      const [moved] = fields.splice(dragFrom, 1);
      fields.splice(to, 0, moved);
      onReorder(dragFrom, to);
    });
  });
}

function renderOptionChips(container, options, onChange, onValidationChange) {
  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'option-chips';

  function emit() {
    onChange([...options]);
    onValidationChange?.();
  }

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'chip-add-input';
  input.placeholder = '+ Add option';

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
      <div class="preview-form preview-form-theme-wrap">
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
    } else if (field.type === 'freeform') {
      control = `<input type="text" class="form-control form-control-sm" disabled placeholder="${escapeHtml(field.placeholder || '')}" />`;
    } else {
      control = `<p class="text-muted small mb-0">—</p>`;
    }
    return `<div class="form-group"><label>${escapeHtml(field.label)}${req}</label>${control}</div>`;
  }).join('');

  container.innerHTML = `<div class="preview-form preview-form-theme-wrap">${html}${fixed}</div>`;
}

function createEditorForm({ field, isNew, onSave, onCancel }) {
  const wrap = document.createElement('div');
  wrap.className = 'editor-panel';
  const creating = isNew ?? !field.id;
  const working = JSON.parse(JSON.stringify(field));
  let selectedTypeKey = creating ? null : typeKeyForField(working);
  let options = working.type === 'dropdown' && working.options ? [...working.options] : [];

  wrap.innerHTML = `
    <h3>${creating ? 'Add question' : 'Edit question'}</h3>
    <div class="mb-3">
      <label class="form-label">Question</label>
      <input type="text" class="form-control" id="edLabel" value="${escapeHtml(working.label || '')}" placeholder="e.g. Quantities Match" />
    </div>
    <div class="mb-3">
      <label class="form-label">Answer type</label>
      <div id="edTypePicker" class="type-picker"></div>
    </div>
    <div class="mb-3" id="edOptionsWrap">
      <label class="form-label">Options</label>
      <div id="edOptions"></div>
      <small class="text-muted" id="edOptionsHint">Add at least one option before saving.</small>
    </div>
    <div class="mb-3 form-check">
      <input type="checkbox" class="form-check-input" id="edRequired" ${working.required ? 'checked' : ''} />
      <label class="form-check-label" for="edRequired">Required</label>
    </div>
    <div class="d-flex gap-2 flex-wrap">
      <button type="button" class="btn btn-primary" id="edSave" disabled>${creating ? 'Add' : 'Save'}</button>
      <button type="button" class="btn btn-secondary" id="edCancel">Cancel</button>
    </div>
  `;

  const typePicker = wrap.querySelector('#edTypePicker');
  const optionsWrap = wrap.querySelector('#edOptionsWrap');
  const optionsHost = wrap.querySelector('#edOptions');
  const saveBtn = wrap.querySelector('#edSave');
  const labelInput = wrap.querySelector('#edLabel');

  function syncOptionsVisibility() {
    optionsWrap.style.display = selectedTypeKey === 'dropdown' ? 'block' : 'none';
  }

  function updateSaveState() {
    const label = labelInput.value.trim();
    const hasType = selectedTypeKey != null;
    let valid = !!label && hasType;
    if (valid && selectedTypeKey === 'dropdown') {
      valid = options.length >= 1;
    }
    saveBtn.disabled = !valid;
  }

  function mountOptionChips() {
    renderOptionChips(optionsHost, options, next => {
      options = next;
      working.options = [...options];
      updateSaveState();
    }, updateSaveState);
  }

  function refreshTypePicker() {
    renderTypePicker(typePicker, selectedTypeKey, key => {
      selectedTypeKey = key;
      applyFieldType(working, key);
      if (key === 'dropdown') {
        if (!creating && working.options?.length) {
          options = [...working.options];
        } else {
          options = [];
          working.options = [];
        }
        mountOptionChips();
      }
      syncOptionsVisibility();
      refreshTypePicker();
      updateSaveState();
    });
  }

  refreshTypePicker();
  if (selectedTypeKey === 'dropdown') mountOptionChips();
  syncOptionsVisibility();
  labelInput.addEventListener('input', updateSaveState);
  updateSaveState();

  saveBtn.onclick = () => {
    if (saveBtn.disabled) return;
    const label = labelInput.value.trim();
    working.label = label;
    working.id = working.id || slugifyId(label);
    working.required = wrap.querySelector('#edRequired').checked;
    if (working.type === 'dropdown') working.options = [...options];
    onSave(working);
  };
  wrap.querySelector('#edCancel').onclick = onCancel;

  return wrap;
}

function newEmptyField() {
  return { label: '' };
}

function adjustIndexAfterReorder(index, from, to) {
  if (index < 0) return index;
  if (index === from) return to;
  if (from < index && to >= index) return index - 1;
  if (from > index && to <= index) return index + 1;
  return index;
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
