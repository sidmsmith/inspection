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
  delete field.default;
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

/** Live preview selections — persists while editing; reset on clear/auth. */
const previewState = {};

function clearPreviewState() {
  Object.keys(previewState).forEach(k => delete previewState[k]);
}

function setPreviewFromField(field) {
  if (!field?.id) return;
  previewState[field.id] =
    field.default != null && field.default !== '' ? String(field.default) : '';
}

function prunePreviewState(fields) {
  const ids = new Set(fields.map(f => f.id).filter(Boolean));
  Object.keys(previewState).forEach(id => {
    if (!ids.has(id)) delete previewState[id];
  });
}

function optionsForTypeKey(typeKey, dropdownOptions) {
  if (typeKey === 'dropdown') return dropdownOptions || [];
  return FIELD_TYPES.find(t => t.key === typeKey)?.options || [];
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

/**
 * Insert-slot question list (sample UX — two complementary patterns):
 * 1) Hover gutters: faint + between rows; brightens when hovering a row or the list.
 * 2) Drag affordance: while dragging / briefly after drop, highlights + below the target row.
 */
function mountQuestionListWithInsertSlots(listHost, {
  fields,
  selectedIdx,
  onInsertAt,
  onEdit,
  onDelete,
  onReorder,
  rowHtmlForField
}) {
  listHost.innerHTML = '';

  if (!fields.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <i class="fa-solid fa-inbox fa-2x mb-2"></i>
      <p>No questions yet.</p>
      <button type="button" class="btn btn-outline-primary btn-sm mt-2" id="emptyInsertBtn">
        <i class="fa-solid fa-plus"></i> Add first question
      </button>`;
    empty.querySelector('#emptyInsertBtn').onclick = () => onInsertAt(0);
    listHost.appendChild(empty);
    return;
  }

  const inner = document.createElement('div');
  inner.className = 'question-list-inner question-list-insert-mode';

  const parts = [];
  parts.push(`
    <button type="button" class="question-insert-slot" data-insert-at="0" title="Insert question here" aria-label="Insert question at top">
      <i class="fa-solid fa-plus"></i>
    </button>`);
  fields.forEach((f, i) => {
    parts.push(rowHtmlForField(f, i, selectedIdx));
    parts.push(`
      <button type="button" class="question-insert-slot" data-insert-at="${i + 1}" title="Insert question here" aria-label="Insert question after row ${i + 1}">
        <i class="fa-solid fa-plus"></i>
      </button>`);
  });
  inner.innerHTML = parts.join('');
  listHost.appendChild(inner);

  inner.querySelectorAll('.question-insert-slot').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      onInsertAt(+btn.dataset.insertAt);
    };
  });

  inner.querySelectorAll('.question-row').forEach(row => {
    const idx = +row.dataset.idx;
    const editBtn = row.querySelector('.edit-btn');
    const delBtn = row.querySelector('.del-btn');
    if (editBtn) editBtn.onclick = e => { e.stopPropagation(); onEdit(idx); };
    if (delBtn) delBtn.onclick = e => {
      e.stopPropagation();
      onDelete(idx);
    };
    row.onclick = e => {
      if (e.target.closest('.grip') || e.target.closest('.q-actions') || e.target.closest('.question-insert-slot')) return;
      onEdit(idx);
    };
    row.addEventListener('mouseenter', () => highlightInsertSlot(inner, idx + 1));
    row.addEventListener('mouseleave', () => clearInsertSlotHighlight(inner));
  });

  bindDragReorder(inner, {
    fields,
    onReorder,
    onDragStateChange: active => {
      inner.classList.toggle('list-dragging', active);
      if (!active) clearInsertSlotHighlight(inner);
    },
    onDragHover: toIdx => highlightInsertSlot(inner, toIdx + 1),
    onDragComplete: toIdx => flashInsertSlot(inner, toIdx + 1)
  });
}

function highlightInsertSlot(listEl, insertAt) {
  if (!listEl) return;
  listEl.querySelectorAll('.question-insert-slot').forEach(s => {
    s.classList.toggle('insert-slot-hover', +s.dataset.insertAt === insertAt);
  });
}

function clearInsertSlotHighlight(listEl) {
  listEl?.querySelectorAll('.question-insert-slot').forEach(s => s.classList.remove('insert-slot-hover'));
}

function flashInsertSlot(listEl, insertAt) {
  const slot = listEl?.querySelector(`.question-insert-slot[data-insert-at="${insertAt}"]`);
  if (!slot) return;
  slot.classList.add('insert-slot-flash');
  setTimeout(() => slot.classList.remove('insert-slot-flash'), 2200);
}

function bindDragReorder(listEl, {
  fields,
  onReorder,
  itemSelector = '.draggable-item',
  gripSelector = '.grip',
  onDragStateChange,
  onDragHover,
  onDragComplete
}) {
  if (!listEl) return;
  let dragFrom = null;

  listEl.querySelectorAll(itemSelector).forEach(item => {
    const grip = item.querySelector(gripSelector);
    if (!grip) return;

    grip.draggable = true;
    grip.addEventListener('dragstart', e => {
      dragFrom = +item.dataset.idx;
      item.classList.add('dragging');
      onDragStateChange?.(true);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragFrom));
      e.stopPropagation();
    });
    grip.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      listEl.querySelectorAll(itemSelector).forEach(i => i.classList.remove('drag-over'));
      onDragStateChange?.(false);
      dragFrom = null;
    });

    item.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      item.classList.add('drag-over');
      onDragHover?.(+item.dataset.idx);
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
      onDragComplete?.(to);
    });
  });
}

function bindChipReorder(wrap, options, onReorder) {
  if (!wrap) return;
  let dragFrom = null;

  wrap.querySelectorAll('.option-chip').forEach(chip => {
    const grip = chip.querySelector('.chip-grip');
    if (!grip) return;

    grip.draggable = true;
    grip.addEventListener('dragstart', e => {
      dragFrom = +chip.dataset.idx;
      chip.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragFrom));
      e.stopPropagation();
    });
    grip.addEventListener('dragend', () => {
      chip.classList.remove('dragging');
      wrap.querySelectorAll('.option-chip').forEach(c => c.classList.remove('drag-over'));
      dragFrom = null;
    });

    chip.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      chip.classList.add('drag-over');
    });
    chip.addEventListener('dragleave', e => {
      if (!chip.contains(e.relatedTarget)) chip.classList.remove('drag-over');
    });
    chip.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      chip.classList.remove('drag-over');
      const to = +chip.dataset.idx;
      if (dragFrom == null || dragFrom === to) return;
      const [moved] = options.splice(dragFrom, 1);
      options.splice(to, 0, moved);
      onReorder();
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
      chip.dataset.idx = String(idx);
      chip.innerHTML = `
        <span class="chip-grip" title="Drag to reorder"><i class="fa-solid fa-grip-vertical"></i></span>
        <span class="chip-label">${escapeHtml(opt)}</span>
        <button type="button" class="chip-remove" aria-label="Remove">×</button>`;
      chip.querySelector('.chip-remove').onclick = e => {
        e.stopPropagation();
        options.splice(idx, 1);
        emit();
        renderChips();
      };
      wrap.insertBefore(chip, input);
    });
    bindChipReorder(wrap, options, () => {
      emit();
      renderChips();
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

function renderDefaultPicker(container, { typeKey, options, value, onChange }) {
  container.innerHTML = '';
  if (!typeKey) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';

  if (typeKey === 'text') {
    container.innerHTML = `
      <label class="form-label">Default answer</label>
      <input type="text" class="form-control form-control-sm" id="edDefaultInput"
        placeholder="Leave blank for no default"
        value="${escapeHtml(value || '')}" />
      <small class="text-muted default-answer-hint">Optional pre-filled value in the inspection form.</small>`;
    container.querySelector('#edDefaultInput').addEventListener('input', e => {
      const v = e.target.value.trim();
      onChange(v || null);
    });
    return;
  }

  const opts = optionsForTypeKey(typeKey, options);
  container.innerHTML = `
    <label class="form-label">Default answer</label>
    <select class="form-select form-select-sm" id="edDefaultSelect">
      <option value="">No default</option>
      ${opts.map(o => `
        <option value="${escapeHtml(o)}"${o === value ? ' selected' : ''}>${escapeHtml(o)}</option>
      `).join('')}
    </select>
    <small class="text-muted default-answer-hint">Pre-selected when inspectors open this question.</small>`;
  container.querySelector('#edDefaultSelect').addEventListener('change', e => {
    onChange(e.target.value || null);
  });
}

function renderPreview(fields, container) {
  const fixed = `
    <div class="preview-fixed">
      <i class="fa-solid fa-lock me-1"></i>
      Always included: damage diagram, inspection photos, signature pad
    </div>`;

  prunePreviewState(fields);
  fields.forEach(f => {
    if (f.id && !(f.id in previewState)) setPreviewFromField(f);
  });

  if (!fields.length) {
    container.innerHTML = `
      <div class="preview-form preview-form-theme-wrap">
        <p class="text-muted mb-0">No questions yet — add one to preview the PO form.</p>
        ${fixed}
      </div>`;
    return;
  }

  container.innerHTML = `
    <p class="preview-interactive-hint">Try the form — click toggles, change dropdowns, type in text fields.</p>
    <div class="preview-form preview-form-theme-wrap" id="previewFormRoot"></div>
    ${fixed}`;
  const root = container.querySelector('#previewFormRoot');

  fields.forEach(field => {
    const group = document.createElement('div');
    group.className = 'form-group';

    const label = document.createElement('label');
    label.innerHTML = `${escapeHtml(field.label)}${field.required ? ' <span class="required-asterisk">*</span>' : ''}`;
    group.appendChild(label);

    const current = field.id ? (previewState[field.id] ?? '') : '';

    if (field.type === 'segmented') {
      const segWrap = document.createElement('div');
      segWrap.className = 'preview-segmented';
      (field.options || []).forEach(option => {
        const seg = document.createElement('span');
        seg.className = 'seg' + (current === option ? ' on' : '');
        seg.dataset.option = option;
        seg.textContent = option;
        seg.onclick = () => {
          const active = previewState[field.id] ?? '';
          const next = active === option ? '' : option;
          previewState[field.id] = next;
          segWrap.querySelectorAll('.seg').forEach(s => {
            s.classList.toggle('on', s.dataset.option === next);
          });
        };
        segWrap.appendChild(seg);
      });
      group.appendChild(segWrap);
    } else if (field.type === 'dropdown') {
      const select = document.createElement('select');
      select.className = 'form-select form-select-sm';
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = '— Select —';
      select.appendChild(blank);
      (field.options || []).forEach(option => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        if (current === option) opt.selected = true;
        select.appendChild(opt);
      });
      select.onchange = () => {
        previewState[field.id] = select.value;
      };
      group.appendChild(select);
    } else if (field.type === 'freeform') {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'form-control form-control-sm';
      input.placeholder = field.placeholder || '';
      input.value = current;
      input.oninput = () => {
        previewState[field.id] = input.value;
      };
      group.appendChild(input);
    } else {
      const p = document.createElement('p');
      p.className = 'text-muted small mb-0';
      p.textContent = '—';
      group.appendChild(p);
    }

    root.appendChild(group);
  });
}

function createEditorForm({ field, isNew, onSave, onCancel }) {
  const wrap = document.createElement('div');
  wrap.className = 'editor-panel';
  const creating = isNew ?? !field.id;
  const working = JSON.parse(JSON.stringify(field));
  let selectedTypeKey = creating ? null : typeKeyForField(working);
  let options = working.type === 'dropdown' && working.options ? [...working.options] : [];
  let defaultValue = working.default ?? null;

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
      <small class="text-muted" id="edOptionsHint">Add at least one option. Drag chips to reorder.</small>
    </div>
    <div class="mb-3" id="edDefaultHost"></div>
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
  const defaultHost = wrap.querySelector('#edDefaultHost');
  const saveBtn = wrap.querySelector('#edSave');
  const labelInput = wrap.querySelector('#edLabel');

  function syncOptionsVisibility() {
    optionsWrap.style.display = selectedTypeKey === 'dropdown' ? 'block' : 'none';
  }

  function validateDefaultValue() {
    if (!defaultValue || selectedTypeKey === 'text') return;
    const opts = optionsForTypeKey(selectedTypeKey, options);
    if (!opts.includes(defaultValue)) {
      defaultValue = null;
      mountDefaultPicker();
    }
  }

  function mountDefaultPicker() {
    renderDefaultPicker(defaultHost, {
      typeKey: selectedTypeKey,
      options,
      value: defaultValue,
      onChange: v => { defaultValue = v; }
    });
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
      validateDefaultValue();
      updateSaveState();
    }, updateSaveState);
  }

  function refreshTypePicker() {
    renderTypePicker(typePicker, selectedTypeKey, key => {
      selectedTypeKey = key;
      applyFieldType(working, key);
      defaultValue = null;
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
      mountDefaultPicker();
      refreshTypePicker();
      updateSaveState();
    });
  }

  refreshTypePicker();
  if (selectedTypeKey === 'dropdown') mountOptionChips();
  syncOptionsVisibility();
  mountDefaultPicker();
  labelInput.addEventListener('input', updateSaveState);
  updateSaveState();

  saveBtn.onclick = () => {
    if (saveBtn.disabled) return;
    const label = labelInput.value.trim();
    working.label = label;
    working.id = working.id || slugifyId(label);
    working.required = wrap.querySelector('#edRequired').checked;
    if (working.type === 'dropdown') working.options = [...options];
    if (defaultValue) working.default = defaultValue;
    else delete working.default;
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
