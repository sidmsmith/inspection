/** Checklist admin UI — editor, preview, drag-drop (inspection admin v0.3.3) */

const FIELD_TYPES = CHECKLIST_FIELD_TYPES;

const previewState = {};
let previewApiData = {
  condition_codes: [],
  ilpn_condition_codes: [],
  putaway_condition_codes: [],
  inventory_condition_codes: []
};

function setPreviewApiData(data) {
  previewApiData = {
    condition_codes: data?.condition_codes || [],
    ilpn_condition_codes: data?.ilpn_condition_codes || [],
    putaway_condition_codes: data?.putaway_condition_codes || [],
    inventory_condition_codes: data?.inventory_condition_codes || []
  };
}

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
  return typeKeyForChecklistField(field);
}

function typeLabelForField(field) {
  if (field?.dataSource === 'condition_codes') return 'Condition codes';
  if (field?.dataSource === 'ilpn_condition_codes') return 'iLPN condition';
  if (field?.dataSource === 'putaway_condition_codes') return 'Putaway condition';
  if (field?.dataSource === 'inventory_condition_codes') return 'Inventory condition';
  if (field?.type === 'toggle_pair') return 'Toggle pair';
  const key = typeKeyForField(field);
  if (!key) return field?.type || 'Not set';
  return FIELD_TYPES.find(t => t.key === key)?.label || field.type;
}

function applyFieldType(field, typeKey) {
  applyChecklistFieldType(field, typeKey);
}

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

function optionsForTypeKey(typeKey, customOptions) {
  if (fieldTypeUsesOptions(typeKey) || typeKey === 'dropdown' || typeKey === 'multi_select'
    || typeKey === 'traffic_light' || typeKey === 'slider' || typeKey === 'gauge') {
    return customOptions || [];
  }
  return FIELD_TYPES.find(t => t.key === typeKey)?.options || [];
}

function requiredToggleButtonHtml(required, visible = true) {
  const on = !!required;
  const disabled = !visible;
  const stateCls = on ? 'is-on' : 'is-off';
  const disabledCls = disabled ? ' is-disabled' : '';
  const title = disabled
    ? 'Show in form before marking required'
    : (on ? 'Required — click to make optional' : 'Optional — click to make required');
  const disabledAttr = disabled ? ' disabled' : '';
  return `<button type="button" class="btn btn-icon row-action-btn required-btn ${stateCls}${disabledCls}" title="${title}" aria-label="${title}"${disabledAttr}><i class="fa-solid fa-asterisk"></i></button>`;
}

function visibilityToggleButtonHtml(enabled) {
  const on = enabled !== false;
  const cls = on ? 'is-on' : 'is-off';
  const icon = on ? 'fa-eye' : 'fa-eye-slash';
  const title = on ? 'Shown in inspection form — click to hide' : 'Hidden from inspection form — click to show';
  return `<button type="button" class="btn btn-icon row-action-btn visibility-btn ${cls}" title="${title}" aria-label="${title}"><i class="fa-solid ${icon}"></i></button>`;
}

function deleteActionButtonHtml() {
  return '<button type="button" class="btn btn-icon row-action-btn del-btn" title="Delete" aria-label="Delete"><i class="fa-solid fa-trash"></i></button>';
}

function buildFieldActionsHtml(field, editable) {
  const visible = editable || field.enabled !== false;
  const parts = [requiredToggleButtonHtml(field.required, visible)];
  if (editable) parts.push(deleteActionButtonHtml());
  else parts.push(visibilityToggleButtonHtml(field.enabled !== false));
  return parts.join('');
}

function buildSectionActionsHtml(section) {
  const visible = section.enabled !== false;
  return requiredToggleButtonHtml(section.required, visible) + visibilityToggleButtonHtml(section.enabled !== false);
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

function bindLayoutDragReorder(listEl, { layout, onReorder, itemSelector = '.draggable-item', gripSelector = '.grip' }) {
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
      const next = [...layout];
      const [moved] = next.splice(dragFrom, 1);
      next.splice(to, 0, moved);
      onReorder(dragFrom, to, next);
    });
  });
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
      e.stopPropagation();
    });
    grip.addEventListener('dragend', () => {
      chip.classList.remove('dragging');
      wrap.querySelectorAll('.option-chip').forEach(c => c.classList.remove('drag-over'));
      dragFrom = null;
    });

    chip.addEventListener('dragover', e => {
      e.preventDefault();
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

function renderOptionChips(container, options, onChange, onValidationChange, chipLimits = {}) {
  const minOptions = chipLimits.minOptions ?? null;
  const maxOptions = chipLimits.maxOptions ?? null;
  const disableReorder = !!chipLimits.disableReorder;
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

  function syncAddInput() {
    if (maxOptions != null && options.length >= maxOptions) {
      input.style.display = 'none';
      input.value = '';
    } else {
      input.style.display = '';
    }
  }

  function renderChips() {
    wrap.querySelectorAll('.option-chip').forEach(el => el.remove());
    options.forEach((opt, idx) => {
      const chip = document.createElement('span');
      chip.className = 'option-chip';
      chip.dataset.idx = String(idx);
      const canRemove = minOptions == null || options.length > minOptions;
      const gripHtml = disableReorder
        ? ''
        : '<span class="chip-grip" title="Drag to reorder"><i class="fa-solid fa-grip-vertical"></i></span>';
      chip.innerHTML = `
        ${gripHtml}
        <span class="chip-label">${escapeHtml(opt)}</span>
        ${canRemove ? '<button type="button" class="chip-remove" aria-label="Remove">×</button>' : ''}`;
      const removeBtn = chip.querySelector('.chip-remove');
      if (removeBtn) {
        removeBtn.onclick = e => {
          e.stopPropagation();
          options.splice(idx, 1);
          emit();
          renderChips();
        };
      }
      wrap.insertBefore(chip, input);
    });
    if (!disableReorder) {
      bindChipReorder(wrap, options, () => {
        emit();
        renderChips();
      });
    }
    syncAddInput();
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = input.value.trim();
      if (maxOptions != null && options.length >= maxOptions) return;
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

const TRAFFIC_LIGHT_SLOT_META = [
  { className: 'tl-red', name: 'Red' },
  { className: 'tl-amber', name: 'Amber' },
  { className: 'tl-green', name: 'Green' }
];

function normalizeTrafficLightOptions(options) {
  const defaults = ['Stop', 'Caution', 'Go'];
  const next = Array.isArray(options) ? [...options] : [];
  while (next.length < 3) next.push(defaults[next.length] || `Option ${next.length + 1}`);
  return next.slice(0, 3);
}

function renderTrafficLightLabels(container, options, onChange, onValidationChange) {
  container.innerHTML = '';
  const normalized = normalizeTrafficLightOptions(options);
  options.length = 0;
  options.push(...normalized);

  const wrap = document.createElement('div');
  wrap.className = 'traffic-light-label-editor';

  TRAFFIC_LIGHT_SLOT_META.forEach((meta, idx) => {
    const row = document.createElement('div');
    row.className = 'tl-label-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = `form-control tl-label-input ${meta.className}`;
    input.value = options[idx];
    input.placeholder = `${meta.name} label`;
    input.setAttribute('aria-label', `${meta.name} light label`);
    input.addEventListener('input', () => {
      options[idx] = input.value;
      onChange([...options]);
      onValidationChange?.();
    });
    row.innerHTML = `
      <span class="tl-color-dot ${meta.className}"></span>
      <span class="tl-color-name">${meta.name}</span>`;
    row.appendChild(input);
    wrap.appendChild(row);
  });

  container.appendChild(wrap);
  onChange([...options]);
  onValidationChange?.();
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
      onChange(e.target.value.trim() || null);
    });
    return;
  }

  const opts = optionsForTypeKey(typeKey, options);

  if (typeKey === 'slider') {
    const effective = value && opts.includes(value) ? value : (opts[0] || '');
    container.innerHTML = `
      <label class="form-label">Default position</label>
      <select class="form-select form-select-sm" id="edDefaultSelect">
        ${opts.map(o => `
          <option value="${escapeHtml(o)}"${o === effective ? ' selected' : ''}>${escapeHtml(o)}</option>
        `).join('')}
      </select>
      <small class="text-muted default-answer-hint">Slider starts at this position (defaults to first stop).</small>`;
    const select = container.querySelector('#edDefaultSelect');
    if (effective) onChange(effective);
    select.addEventListener('change', e => {
      onChange(e.target.value || opts[0] || null);
    });
    return;
  }

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

function appendPreviewControl(group, field, apiData) {
  const current = field.id ? (previewState[field.id] ?? '') : '';
  const codes = apiData || previewApiData;

  if (field.type === 'segmented' || field.type === 'toggle_pair') {
    const segWrap = document.createElement('div');
    segWrap.className = 'checklist-segmented';
    (field.options || []).forEach(option => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'segment-btn' + (current === option ? ' selected' : '');
      btn.dataset.option = option;
      btn.textContent = option;
      if (field.id) {
        btn.onclick = () => {
          const active = previewState[field.id] ?? '';
          const next = active === option ? '' : option;
          previewState[field.id] = next;
          segWrap.querySelectorAll('.segment-btn').forEach(s => {
            s.classList.toggle('selected', s.dataset.option === next);
          });
        };
      }
      segWrap.appendChild(btn);
    });
    group.appendChild(segWrap);
    return;
  }

  if (field.type === 'dropdown') {
    const select = document.createElement('select');
    select.className = 'form-select form-select-sm';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '— Select —';
    select.appendChild(blank);

    if (field.dataSource === 'condition_codes') {
      const list = [...(codes.condition_codes || [])].sort((a, b) =>
        (a.Description || '').localeCompare(b.Description || '')
      );
      list.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.ConditionCodeId;
        opt.textContent = c.Description || c.ConditionCodeId;
        if (current === c.ConditionCodeId) opt.selected = true;
        select.appendChild(opt);
      });
      if (!list.length) {
        blank.textContent = 'No condition codes loaded';
      }
    } else if (field.dataSource === 'ilpn_condition_codes') {
      const list = [...(codes.ilpn_condition_codes || [])].sort((a, b) =>
        (a.Description || a.ConditionCodeId || '').localeCompare(b.Description || b.ConditionCodeId || '')
      );
      list.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.ConditionCodeId;
        opt.textContent = c.Description || c.ConditionCodeId;
        if (current === c.ConditionCodeId) opt.selected = true;
        select.appendChild(opt);
      });
      if (!list.length) {
        blank.textContent = 'No iLPN condition codes loaded';
      }
    } else if (field.dataSource === 'putaway_condition_codes') {
      const list = [...(codes.putaway_condition_codes || [])].sort((a, b) =>
        (a.Description || a.PutawayConditionCodeId || '').localeCompare(b.Description || b.PutawayConditionCodeId || '')
      );
      list.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.PutawayConditionCodeId;
        opt.textContent = c.Description || c.PutawayConditionCodeId;
        if (current === c.PutawayConditionCodeId) opt.selected = true;
        select.appendChild(opt);
      });
      if (!list.length) {
        blank.textContent = 'No putaway condition codes loaded';
      }
    } else if (field.dataSource === 'inventory_condition_codes') {
      const list = [...(codes.inventory_condition_codes || [])].sort((a, b) =>
        (a.Description || a.ConditionCodeId || '').localeCompare(b.Description || b.ConditionCodeId || '')
      );
      list.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.ConditionCodeId;
        opt.textContent = c.Description || c.ConditionCodeId;
        if (current === c.ConditionCodeId) opt.selected = true;
        select.appendChild(opt);
      });
      if (!list.length) {
        blank.textContent = 'No inventory condition codes loaded';
      }
    } else {
      (field.options || []).forEach(option => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        if (current === option) opt.selected = true;
        select.appendChild(opt);
      });
    }

    if (field.id) {
      select.onchange = () => { previewState[field.id] = select.value; };
    }
    group.appendChild(select);
    return;
  }

  if (field.type === 'freeform') {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control form-control-sm';
    input.placeholder = field.placeholder || '';
    input.value = current;
    if (field.id) {
      input.oninput = () => { previewState[field.id] = input.value; };
    }
    group.appendChild(input);
    return;
  }

  if (field.type === 'traffic_light') {
    const wrap = document.createElement('div');
    wrap.className = 'checklist-traffic-light';
    const colors = ['tl-red', 'tl-amber', 'tl-green'];
    (field.options || []).slice(0, 3).forEach((option, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tl-btn ${colors[idx] || 'tl-amber'}` + (current === option ? ' selected' : '');
      btn.textContent = option;
      btn.dataset.option = option;
      if (field.id) {
        btn.onclick = () => {
          const active = previewState[field.id] ?? '';
          const next = active === option ? '' : option;
          previewState[field.id] = next;
          wrap.querySelectorAll('.tl-btn').forEach(s => {
            s.classList.toggle('selected', s.dataset.option === next);
          });
        };
      }
      wrap.appendChild(btn);
    });
    group.appendChild(wrap);
    return;
  }

  if (field.type === 'slider') {
    const opts = field.options || [];
    const wrap = document.createElement('div');
    wrap.className = 'checklist-slider-wrap';
    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'checklist-slider-input';
    range.min = '0';
    range.max = String(Math.max(opts.length - 1, 0));
    range.step = '1';
    range.value = String(Math.max(0, opts.indexOf(current)));
    const label = document.createElement('div');
    label.className = 'checklist-slider-value';
    const update = () => {
      const idx = Number(range.value);
      const text = opts[idx] || '';
      label.textContent = text;
      if (field.id) previewState[field.id] = text;
    };
    range.addEventListener('input', update);
    update();
    if (opts.length) {
      const ends = document.createElement('div');
      ends.className = 'checklist-slider-ends';
      ends.innerHTML = `<span>${escapeHtml(opts[0])}</span><span>${escapeHtml(opts[opts.length - 1])}</span>`;
      wrap.appendChild(range);
      wrap.appendChild(ends);
      wrap.appendChild(label);
    }
    group.appendChild(wrap);
    return;
  }

  if (field.type === 'multi_select') {
    const wrap = document.createElement('div');
    wrap.className = 'checklist-chips';
    const selected = new Set(String(current || '').split(',').map(s => s.trim()).filter(Boolean));
    (field.options || []).forEach(option => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip-btn' + (selected.has(option) ? ' selected' : '');
      btn.textContent = option;
      btn.dataset.option = option;
      if (field.id) {
        btn.onclick = () => {
          if (selected.has(option)) selected.delete(option);
          else selected.add(option);
          previewState[field.id] = [...selected].join(', ');
          wrap.querySelectorAll('.chip-btn').forEach(s => {
            s.classList.toggle('selected', selected.has(s.dataset.option));
          });
        };
      }
      wrap.appendChild(btn);
    });
    group.appendChild(wrap);
    return;
  }

  if (field.type === 'gauge') {
    if (field.description) {
      const desc = document.createElement('p');
      desc.className = 'checklist-field-desc';
      desc.textContent = field.description;
      group.appendChild(desc);
    }
    const wrap = document.createElement('div');
    wrap.className = 'checklist-gauge';
    const dial = document.createElement('div');
    dial.className = 'gauge-dial';
    const arc = document.createElement('div');
    arc.className = 'gauge-arc' + (isGaugeRedToGreen(field) ? ' gauge-red-to-green' : '');
    const needle = document.createElement('div');
    needle.className = 'gauge-needle';
    dial.appendChild(arc);
    dial.appendChild(needle);
    const opts = field.options || [];
    const btnRow = document.createElement('div');
    btnRow.className = 'gauge-options';
    const setNeedle = idx => {
      const max = Math.max(opts.length - 1, 1);
      const angle = -90 + (idx / max) * 180;
      needle.style.transform = `translateX(-50%) rotate(${angle}deg)`;
    };
    const activeIdx = Math.max(0, opts.indexOf(current));
    setNeedle(activeIdx);
    opts.forEach((option, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gauge-opt-btn' + (current === option ? ' selected' : '');
      btn.textContent = option;
      btn.dataset.option = option;
      if (field.id) {
        btn.onclick = () => {
          const active = previewState[field.id] ?? '';
          const next = active === option ? '' : option;
          previewState[field.id] = next;
          btnRow.querySelectorAll('.gauge-opt-btn').forEach(s => {
            s.classList.toggle('selected', s.dataset.option === next);
          });
          setNeedle(next ? opts.indexOf(next) : 0);
        };
      }
      btnRow.appendChild(btn);
    });
    wrap.appendChild(dial);
    wrap.appendChild(btnRow);
    group.appendChild(wrap);
    return;
  }

  const p = document.createElement('p');
  p.className = 'text-muted small mb-0';
  p.textContent = '—';
  group.appendChild(p);
}

function renderPreview(fields, container, options = {}) {
  const objectLabel = options.objectLabel || 'Object';
  const objectType = options.objectType || 'po';
  const sections = options.sections || getDefaultSectionsForType(objectType);
  const layout = options.layout || buildDefaultLayout(fields, sections);
  const apiData = options.previewApiData || previewApiData;

  prunePreviewState(fields);
  fields.forEach(f => {
    if (f.id && !(f.id in previewState)) setPreviewFromField(f);
  });

  const fieldById = new Map(fields.filter(f => f.id).map(f => [f.id, f]));

  container.innerHTML = `
    <p class="preview-interactive-hint">Moto G4 · 360×640 — try toggles and dropdowns inside the device</p>
    <div class="device-frame-wrap">
      <div class="device-frame" aria-label="Mobile preview 360 by 640">
        <div class="device-earpiece"></div>
        <div class="device-screen" id="previewThemeScope">
          <div class="device-app-chrome">
            <span class="device-chrome-icon" aria-hidden="true"><i class="fas fa-camera"></i></span>
            <div class="device-chrome-center">
              <img id="previewDeviceLogo" class="device-theme-logo" alt="" />
              <div class="device-chrome-title">Inspection Checklist</div>
            </div>
            <span class="device-chrome-icon device-chrome-spacer" aria-hidden="true"></span>
          </div>
          <div class="device-form-body">
            <div class="device-screen-scroll preview-form-theme-wrap" id="previewFormRoot"></div>
            <div class="device-form-actions">
              <button type="button" class="preview-complete-btn">Complete Inspection</button>
            </div>
          </div>
        </div>
        <div class="device-home-btn"></div>
      </div>
    </div>`;

  const root = container.querySelector('#previewFormRoot');
  const themeScope = container.querySelector('#previewThemeScope');
  const deviceLogo = container.querySelector('#previewDeviceLogo');

  if (!layout.length && !fields.length) {
    root.innerHTML = `<p class="text-muted mb-0 device-empty-msg">No questions yet — add one to preview the ${escapeHtml(objectLabel)} form.</p>`;
  } else {
    layout.forEach(item => {
      if (item.type === 'field') {
        const field = fieldById.get(item.id);
        if (!field || !isFieldEnabledInForm(field)) return;
        const group = document.createElement('div');
        group.className = 'form-group';
        const label = document.createElement('label');
        label.innerHTML = `${escapeHtml(field.label)}${field.required ? ' <span class="required-asterisk">*</span>' : ''}`;
        group.appendChild(label);
        appendPreviewControl(group, field, apiData);
        root.appendChild(group);
      } else if (item.type === 'section') {
        appendPreviewSectionBlock(root, item.key, sections, objectType);
      }
    });
  }

  if (typeof options.onThemeScopeReady === 'function') {
    options.onThemeScopeReady(themeScope, deviceLogo);
  }

  return { themeScope, deviceLogo };
}

function appendPreviewSectionBlock(root, sectionKey, sections, objectType) {
  const sec = sections?.[sectionKey];
  if (!sec?.enabled) return;

  if (sectionKey === 'photos') {
    const photos = document.createElement('div');
    photos.className = 'preview-form-section preview-photos-hint';
    photos.innerHTML = `
      <div class="preview-photos-chip"><i class="fas fa-camera"></i> ${escapeHtml(sec.label || DEFAULT_SECTION_LABELS.photos)}${sec.required ? ' <span class="required-asterisk">*</span>' : ''}</div>`;
    root.appendChild(photos);
    return;
  }

  if (sectionKey === 'signature') {
    const sig = document.createElement('div');
    sig.className = 'preview-form-section preview-signature-section';
    sig.innerHTML = `
      <div class="preview-section-head">
        <label>${escapeHtml(sec.label || DEFAULT_SECTION_LABELS.signature)}${sec.required ? ' <span class="required-asterisk">*</span>' : ''}</label>
        <span class="preview-mock-btn preview-mock-static">Clear</span>
      </div>
      <div class="preview-signature-pad preview-pad-static" aria-hidden="true">
        <i class="fa-solid fa-signature"></i>
        <span>Sign here</span>
      </div>`;
    root.appendChild(sig);
    return;
  }

  if (sectionKey === 'damagePad') {
    const dp = sec;
    const title = dp.label || DEFAULT_SECTION_LABELS.damagePad;
    const block = document.createElement('div');
    block.className = 'preview-form-section preview-damage-section';
    if (dp.mode === 'photo') {
      block.innerHTML = `
        <div class="preview-section-head">
          <label>${escapeHtml(title)}${dp.required ? ' <span class="required-asterisk">*</span>' : ''}</label>
          <span class="preview-mock-btn preview-mock-static"><i class="fas fa-camera"></i></span>
        </div>
        <div class="preview-damage-pad preview-damage-empty preview-pad-static">
          <i class="fas fa-plus"></i>
          <span>${objectType === 'ilpn' || objectType === 'olpn' ? 'Tap camera to add LPN photo' : objectType === 'location' ? 'Tap camera to add location photo' : 'Add photo to mark up'}</span>
        </div>`;
    } else {
      const imgKey = dp.defaultImage || 'container';
      block.innerHTML = `
        <div class="preview-section-head">
          <label>${escapeHtml(title)}${dp.required ? ' <span class="required-asterisk">*</span>' : ''}</label>
          <div class="preview-damage-stock-toggle" role="group" aria-label="Diagram image">
            <button type="button" class="preview-seg${imgKey === 'container' ? ' on' : ''}" data-image="container">Container</button>
            <button type="button" class="preview-seg${imgKey === 'trailer' ? ' on' : ''}" data-image="trailer">Trailer</button>
          </div>
        </div>
        <div class="preview-damage-pad preview-damage-stock preview-pad-static">
          <img src="/${imgKey === 'trailer' ? 'trailer' : 'container'}.png" alt="" />
        </div>
        <small class="text-muted">Circle or mark areas of damage on the diagram</small>`;
      root.appendChild(block);
      bindPreviewDamageStockToggle(block);
      return;
    }
    root.appendChild(block);
  }
}

function bindPreviewDamageStockToggle(block) {
  const toggle = block.querySelector('.preview-damage-stock-toggle');
  const img = block.querySelector('.preview-damage-pad img');
  if (!toggle || !img) return;
  toggle.querySelectorAll('.preview-seg').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.image === 'trailer' ? 'trailer' : 'container';
      toggle.querySelectorAll('.preview-seg').forEach(s => s.classList.toggle('on', s.dataset.image === key));
      img.src = `/${key}.png`;
    };
  });
}

function formatChecklistExportFilename(org) {
  const safeOrg = String(org || 'org').trim().toUpperCase() || 'ORG';
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `checklist-config-${safeOrg}-${stamp}.json`;
}

/** Apply open section editor values to in-memory sections (export/save without clicking Save). */
function flushPendingSectionEditor(editorHost, sections, selectedSectionKey, objectType) {
  if (!editorHost || !sections) return;
  const enabledEl = editorHost.querySelector('#secEnabled');
  if (!enabledEl) return;

  const key = selectedSectionKey || editorHost.querySelector('[data-section-key]')?.dataset.sectionKey;
  if (!key) return;
  const defaults = getDefaultSectionsForType(objectType);
  const working = JSON.parse(JSON.stringify(sections[key] || defaults[key] || {}));
  const labelEl = editorHost.querySelector('#secLabel');
  const requiredEl = editorHost.querySelector('#secRequired');

  if (labelEl) {
    working.label = labelEl.value.trim() || DEFAULT_SECTION_LABELS[key] || working.label;
  }
  working.enabled = enabledEl.checked;
  working.required = enabledEl.checked && !!(requiredEl && requiredEl.checked);

  if (key === 'damagePad') {
    const modeEl = editorHost.querySelector('#secDamageMode');
    const defEl = editorHost.querySelector('#secDamageDefault');
    if (modeEl) {
      working.mode = modeEl.value === 'photo' ? 'photo' : 'stock';
      if (working.mode === 'stock') {
        working.defaultImage = defEl?.value || 'container';
        working.images = ['container', 'trailer'];
      } else {
        delete working.defaultImage;
        delete working.images;
      }
    }
  }

  sections[key] = working;
}

function createSectionEditorForm({ sectionKey, sections, objectType, onSave, onCancel }) {
  const wrap = document.createElement('div');
  wrap.className = 'editor-panel';
  wrap.dataset.sectionKey = sectionKey;
  const working = JSON.parse(JSON.stringify(sections[sectionKey] || {}));
  const titles = {
    signature: 'Signature section',
    photos: 'Inspection photos',
    damagePad: 'Markup Pad'
  };

  let bodyHtml = `
    <div class="mb-3">
      <label class="form-label" for="secLabel">Display label</label>
      <input type="text" class="form-control" id="secLabel" value="${escapeHtml(working.label || DEFAULT_SECTION_LABELS[sectionKey] || '')}" />
    </div>
    <div class="mb-3 form-check form-switch">
      <input class="form-check-input" type="checkbox" id="secEnabled" ${working.enabled !== false ? 'checked' : ''} />
      <label class="form-check-label" for="secEnabled">Show in inspection form</label>
    </div>
    <div class="mb-3 form-check" id="secRequiredWrap">
      <input class="form-check-input" type="checkbox" id="secRequired" ${working.required ? 'checked' : ''} />
      <label class="form-check-label" for="secRequired">Required</label>
    </div>`;

  if (sectionKey === 'damagePad') {
    bodyHtml += `
    <div class="mb-3" id="secDamageModeWrap">
      <label class="form-label" for="secDamageMode">Markup mode</label>
      <select class="form-select form-select-sm" id="secDamageMode">
        <option value="stock">Stock diagram (container / trailer)</option>
        <option value="photo">Camera photo (mark up captured image)</option>
      </select>
    </div>
    <div class="mb-3" id="secDamageStockWrap">
      <label class="form-label" for="secDamageDefault">Default diagram</label>
      <select class="form-select form-select-sm" id="secDamageDefault">
        <option value="container">Container</option>
        <option value="trailer">Trailer</option>
      </select>
    </div>`;
  }

  wrap.innerHTML = `
    <h3>${escapeHtml(titles[sectionKey] || 'Form section')}</h3>
    ${bodyHtml}
    <div class="d-flex gap-2 flex-wrap">
      <button type="button" class="btn btn-primary" id="secSave">Save</button>
      <button type="button" class="btn btn-secondary" id="secCancel">Cancel</button>
    </div>`;

  const enabledEl = wrap.querySelector('#secEnabled');
  const requiredWrap = wrap.querySelector('#secRequiredWrap');
  const modeWrap = wrap.querySelector('#secDamageModeWrap');
  const stockWrap = wrap.querySelector('#secDamageStockWrap');

  function syncSectionEditorVisibility() {
    const on = enabledEl.checked;
    if (requiredWrap) requiredWrap.style.display = on ? '' : 'none';
    if (modeWrap) modeWrap.style.display = on ? '' : 'none';
    if (stockWrap) {
      const stock = on && wrap.querySelector('#secDamageMode')?.value === 'stock';
      stockWrap.style.display = stock ? '' : 'none';
    }
  }

  if (sectionKey === 'damagePad') {
    wrap.querySelector('#secDamageMode').value = working.mode === 'photo' ? 'photo' : 'stock';
    wrap.querySelector('#secDamageDefault').value = working.defaultImage || 'container';
    wrap.querySelector('#secDamageMode').addEventListener('change', syncSectionEditorVisibility);
  }
  enabledEl.addEventListener('change', syncSectionEditorVisibility);
  syncSectionEditorVisibility();

  wrap.querySelector('#secSave').onclick = () => {
    working.label = wrap.querySelector('#secLabel').value.trim() || DEFAULT_SECTION_LABELS[sectionKey];
    working.enabled = enabledEl.checked;
    working.required = enabledEl.checked && wrap.querySelector('#secRequired').checked;
    if (sectionKey === 'damagePad') {
      working.mode = wrap.querySelector('#secDamageMode').value;
      if (working.mode === 'stock') {
        working.defaultImage = wrap.querySelector('#secDamageDefault').value;
        working.images = ['container', 'trailer'];
      } else {
        delete working.defaultImage;
        delete working.images;
      }
    }
    sections[sectionKey] = working;
    onSave(working);
  };
  wrap.querySelector('#secCancel').onclick = onCancel;
  return wrap;
}

function renderChecklistAdminList(listHost, {
  layout,
  fields,
  sections,
  selectedFieldId,
  selectedSectionKey,
  editorAnchor,
  editorElement,
  onEditField,
  onEditSection,
  onDeleteField,
  onToggleFieldVisibility,
  onToggleSectionVisibility,
  onToggleFieldRequired,
  onToggleSectionRequired,
  onLayoutReorder,
  onAddQuestion
}) {
  listHost.innerHTML = '';
  const fieldById = new Map(fields.filter(f => f.id).map(f => [f.id, f]));
  const rows = [];

  (layout || []).forEach(item => {
    if (item.type === 'field' && fieldById.has(item.id)) {
      rows.push({ kind: 'field', field: fieldById.get(item.id), fieldId: item.id });
    } else if (item.type === 'section' && FORM_SECTION_KEYS.includes(item.key)) {
      rows.push({ kind: 'section', sectionKey: item.key });
    }
  });

  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<i class="fa-solid fa-inbox fa-2x mb-2"></i><p>No items — add a question or reset from default.</p>';
    listHost.appendChild(empty);
    if (editorElement && editorAnchor?.beforeAdd) {
      placeInlineEditor(listHost, null, editorAnchor, editorElement);
    }
    appendAddQuestionButton(listHost, onAddQuestion);
    return;
  }

  const inner = document.createElement('div');
  inner.className = 'question-list-inner';
  inner.innerHTML = rows.map((row, i) => {
    if (row.kind === 'field') {
      const f = row.field;
      const editable = isAdminEditableField(f);
      const systemBadge = editable ? '' : ' <span class="badge-system">System</span>';
      const selected = row.fieldId === selectedFieldId && !selectedSectionKey;
      const offClass = !editable && f.enabled === false ? ' section-row-off' : '';
      const badgeText = isSystemField(f)
        ? systemFieldSummaryLabel(f)
        : escapeHtml(typeLabelForField(f));
      const actionsHtml = buildFieldActionsHtml(f, editable);
      return `
        <div class="question-row draggable-item${selected ? ' selected' : ''}${editable ? '' : ' system-field'}${offClass}" data-idx="${i}" data-kind="field" data-field-id="${escapeHtml(f.id)}">
          <span class="grip" title="Drag to reorder"><i class="fa-solid fa-grip-vertical"></i></span>
          <div class="q-label">${escapeHtml(f.label)}${f.required ? ' <span class="required-asterisk">*</span>' : ''}${systemBadge}</div>
          <span class="badge-type">${badgeText}</span>
          <div class="q-actions">${actionsHtml}</div>
        </div>`;
    }
    const key = row.sectionKey;
    const sec = sections[key] || {};
    const selected = selectedSectionKey === key;
    const offClass = sec.enabled === false ? ' section-row-off' : '';
    return `
      <div class="question-row draggable-item section-config-row system-field${selected ? ' selected' : ''}${offClass}" data-idx="${i}" data-kind="section" data-section-key="${key}">
        <span class="grip" title="Drag to reorder"><i class="fa-solid fa-grip-vertical"></i></span>
        <div class="q-label">${escapeHtml(sec.label || DEFAULT_SECTION_LABELS[key])}${sec.required ? ' <span class="required-asterisk">*</span>' : ''} <span class="badge-system">Section</span></div>
        <span class="badge-type">${escapeHtml(sectionSummaryLabel(key, sections))}</span>
        <div class="q-actions">${buildSectionActionsHtml(sec)}</div>
      </div>`;
  }).join('');

  listHost.appendChild(inner);

  bindLayoutDragReorder(inner, {
    layout: rows.map(row => (
      row.kind === 'field'
        ? { type: 'field', id: row.fieldId }
        : { type: 'section', key: row.sectionKey }
    )),
    onReorder: (from, to, nextLayout) => onLayoutReorder(from, to, nextLayout)
  });

  inner.querySelectorAll('.question-row').forEach(row => {
    const idx = +row.dataset.idx;
    const kind = row.dataset.kind;
    const requiredBtn = row.querySelector('.required-btn');
    if (requiredBtn && !requiredBtn.disabled) {
      requiredBtn.onclick = e => {
        e.stopPropagation();
        if (kind === 'section') onToggleSectionRequired?.(row.dataset.sectionKey);
        else onToggleFieldRequired?.(row.dataset.fieldId);
      };
    }
    const visibilityBtn = row.querySelector('.visibility-btn');
    if (visibilityBtn) {
      visibilityBtn.onclick = e => {
        e.stopPropagation();
        if (kind === 'section') onToggleSectionVisibility?.(row.dataset.sectionKey);
        else onToggleFieldVisibility?.(row.dataset.fieldId);
      };
    }
    const delBtn = row.querySelector('.del-btn');
    if (delBtn) {
      delBtn.onclick = e => {
        e.stopPropagation();
        onDeleteField(fields.indexOf(rows[idx].field));
      };
    }
    row.onclick = e => {
      if (e.target.closest('.grip') || e.target.closest('.q-actions')) return;
      if (kind === 'section') onEditSection(row.dataset.sectionKey);
      else onEditField(fields.indexOf(rows[idx].field));
    };
  });

  if (editorElement && editorAnchor) {
    placeInlineEditor(listHost, inner, editorAnchor, editorElement);
  }

  appendAddQuestionButton(listHost, onAddQuestion);
}

function placeInlineEditor(listHost, listInner, editorAnchor, editorElement) {
  const host = document.createElement('div');
  host.className = 'inline-editor-host';
  host.appendChild(editorElement);

  if (editorAnchor.beforeAdd) {
    const addRow = listHost.querySelector('.add-question-row');
    if (addRow) listHost.insertBefore(host, addRow);
    else listHost.appendChild(host);
    return;
  }

  const root = listInner || listHost;
  if (editorAnchor.afterFieldId) {
    const row = root.querySelector(`[data-field-id="${CSS.escape(editorAnchor.afterFieldId)}"]`);
    if (row) row.after(host);
    else listHost.appendChild(host);
    return;
  }
  if (editorAnchor.afterSectionKey) {
    const row = root.querySelector(`[data-section-key="${CSS.escape(editorAnchor.afterSectionKey)}"]`);
    if (row) row.after(host);
    else listHost.appendChild(host);
  }
}

function systemFieldSummaryLabel(field) {
  const onOff = field.enabled === false ? 'OFF' : 'ON';
  if (field.dataSource === 'condition_codes') return `TRAILER CONDITION · ${onOff}`;
  if (field.dataSource === 'ilpn_condition_codes') return `ILPN CONDITION · ${onOff}`;
  if (field.dataSource === 'putaway_condition_codes') return `PUTAWAY CONDITION · ${onOff}`;
  if (field.dataSource === 'inventory_condition_codes') return `INVENTORY CONDITION · ${onOff}`;
  return field.enabled === false ? 'Off' : 'On';
}

function createReadOnlyFieldPanel({ field, onSave, onCancel }) {
  const working = JSON.parse(JSON.stringify(field));
  const wrap = document.createElement('div');
  wrap.className = 'editor-panel';
  wrap.innerHTML = `
    <h3>System question</h3>
    <p class="mb-1 fw-semibold">${escapeHtml(field.label)}</p>
    <p class="small text-muted mb-3">
      <i class="fa-solid fa-lock me-1"></i>
      This question type (<strong>${escapeHtml(typeLabelForField(field))}</strong>) cannot be edited here.
      You can reorder it in the list and control visibility below.
    </p>
    <div class="mb-3 form-check form-switch">
      <input class="form-check-input" type="checkbox" id="sysEnabled" ${working.enabled !== false ? 'checked' : ''} />
      <label class="form-check-label" for="sysEnabled">Show in inspection form</label>
    </div>
    <div class="d-flex gap-2 flex-wrap">
      <button type="button" class="btn btn-primary" id="sysSave">Save</button>
      <button type="button" class="btn btn-secondary" id="sysCancel">Cancel</button>
    </div>`;
  wrap.querySelector('#sysSave').onclick = () => {
    working.enabled = wrap.querySelector('#sysEnabled').checked;
    onSave(working);
  };
  wrap.querySelector('#sysCancel').onclick = onCancel;
  return wrap;
}

function systemDefaultUiValue(field) {
  if (!Object.prototype.hasOwnProperty.call(field, 'default')) return '__none__';
  if (field.default === '' || field.default === null) return '__blank__';
  return String(field.default);
}

function systemCodesForField(field) {
  if (field.dataSource === 'putaway_condition_codes') return previewApiData.putaway_condition_codes || [];
  if (field.dataSource === 'inventory_condition_codes') return previewApiData.inventory_condition_codes || [];
  if (field.dataSource === 'ilpn_condition_codes') return previewApiData.ilpn_condition_codes || [];
  return previewApiData.condition_codes || [];
}

function systemCodeIdForField(field, code) {
  if (field.dataSource === 'putaway_condition_codes') return code.PutawayConditionCodeId;
  return code.ConditionCodeId;
}

function mountSystemDefaultPicker(container, field, uiValue, onChange) {
  const codes = systemCodesForField(field);
  const sorted = [...codes].sort((a, b) =>
    (a.Description || systemCodeIdForField(field, a) || '').localeCompare(
      b.Description || systemCodeIdForField(field, b) || ''
    )
  );

  container.innerHTML = `
    <label class="form-label">Default answer</label>
    <select class="form-select form-select-sm" id="sysDefaultSelect">
      <option value="__none__">No default</option>
      <option value="__blank__">— (blank) —</option>
      ${sorted.map(c => {
        const id = escapeHtml(systemCodeIdForField(field, c));
        const label = escapeHtml(c.Description || id);
        return `<option value="${id}"${uiValue === systemCodeIdForField(field, c) ? ' selected' : ''}>${label}</option>`;
      }).join('')}
    </select>
    <small class="text-muted default-answer-hint">Options loaded from API after authenticate.</small>`;

  const select = container.querySelector('#sysDefaultSelect');
  if (uiValue === '__none__' || uiValue === '__blank__') {
    select.value = uiValue;
  }

  select.addEventListener('change', () => {
    const v = select.value;
    if (v === '__none__') onChange(null);
    else if (v === '__blank__') onChange('');
    else onChange(v);
  });
}

function createSystemFieldEditor({ field, onSave, onCancel }) {
  const working = JSON.parse(JSON.stringify(field));
  let defaultValue = systemDefaultUiValue(working);
  let defaultPayload = !Object.prototype.hasOwnProperty.call(working, 'default')
    ? null
    : (working.default === '' || working.default === null ? '' : String(working.default));

  const wrap = document.createElement('div');
  wrap.className = 'editor-panel';
  wrap.innerHTML = `
    <h3>Configure system question</h3>
    <p class="mb-1 fw-semibold">${escapeHtml(field.label)}</p>
    <p class="small text-muted mb-3">
      <i class="fa-solid fa-lock me-1"></i>
      ${escapeHtml(typeLabelForField(field))} — options come from the API. Set visibility, required, and default below.
    </p>
    <div class="mb-3 form-check form-switch">
      <input class="form-check-input" type="checkbox" id="sysEnabled" ${working.enabled !== false ? 'checked' : ''} />
      <label class="form-check-label" for="sysEnabled">Show in inspection form</label>
    </div>
    <div class="mb-3" id="sysDefaultHost"></div>
    <div class="mb-3 form-check" id="sysRequiredWrap">
      <input type="checkbox" class="form-check-input" id="sysRequired" ${working.required ? 'checked' : ''} />
      <label class="form-check-label" for="sysRequired">Required</label>
    </div>
    <div class="d-flex gap-2 flex-wrap">
      <button type="button" class="btn btn-primary" id="sysSave">Save</button>
      <button type="button" class="btn btn-secondary" id="sysCancel">Cancel</button>
    </div>
  `;

  const enabledEl = wrap.querySelector('#sysEnabled');
  const requiredWrap = wrap.querySelector('#sysRequiredWrap');
  const defaultHost = wrap.querySelector('#sysDefaultHost');

  function syncSystemEditorVisibility() {
    const on = enabledEl.checked;
    if (requiredWrap) requiredWrap.style.display = on ? '' : 'none';
    if (defaultHost) defaultHost.style.display = on ? '' : 'none';
  }

  enabledEl.addEventListener('change', syncSystemEditorVisibility);
  syncSystemEditorVisibility();

  mountSystemDefaultPicker(
    defaultHost,
    field,
    defaultValue,
    v => { defaultPayload = v; }
  );

  wrap.querySelector('#sysSave').onclick = () => {
    working.enabled = enabledEl.checked;
    working.required = enabledEl.checked && wrap.querySelector('#sysRequired').checked;
    if (defaultPayload === null) delete working.default;
    else working.default = defaultPayload;
    onSave(working);
  };
  wrap.querySelector('#sysCancel').onclick = onCancel;
  return wrap;
}

function createEditorForm({ field, isNew, onSave, onCancel }) {
  if (!isNew && field.dataSource) {
    return createSystemFieldEditor({ field, onSave, onCancel });
  }
  if (!isNew && !isAdminEditableField(field)) {
    return createReadOnlyFieldPanel({ field, onSave, onCancel });
  }

  const wrap = document.createElement('div');
  wrap.className = 'editor-panel';
  const creating = isNew ?? !field.id;
  const working = JSON.parse(JSON.stringify(field));
  let selectedTypeKey = creating ? null : typeKeyForField(working);
  let options = fieldTypeUsesOptions(working.type) && working.options ? [...working.options] : [];
  let defaultValue = working.default ?? null;
  let gaugeDescription = working.description || '';
  let gaugeReversed = working.gaugeColors === 'red_to_green';

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
    <div class="mb-3" id="edGaugeDescWrap" style="display:none">
      <label class="form-label">Gauge description</label>
      <input type="text" class="form-control" id="edGaugeDesc" placeholder="Helper text shown below the question" value="${escapeHtml(gaugeDescription)}" />
      <div class="form-check mt-2">
        <input class="form-check-input" type="checkbox" id="edGaugeReverse" ${gaugeReversed ? 'checked' : ''} />
        <label class="form-check-label" for="edGaugeReverse">Reverse colors (red → green, low to high)</label>
      </div>
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
  const optionsHint = wrap.querySelector('#edOptionsHint');
  const gaugeDescWrap = wrap.querySelector('#edGaugeDescWrap');
  const gaugeDescInput = wrap.querySelector('#edGaugeDesc');
  const gaugeReverseInput = wrap.querySelector('#edGaugeReverse');
  const defaultHost = wrap.querySelector('#edDefaultHost');
  const saveBtn = wrap.querySelector('#edSave');
  const labelInput = wrap.querySelector('#edLabel');

  function usesOptionEditor(key) {
    return key && (fieldTypeUsesOptions(fieldTypeConfigForKey(key)?.type || '') || key === 'dropdown' || key === 'multi_select');
  }

  function syncOptionsVisibility() {
    const show = usesOptionEditor(selectedTypeKey);
    optionsWrap.style.display = show ? 'block' : 'none';
    gaugeDescWrap.style.display = selectedTypeKey === 'gauge' ? 'block' : 'none';
    if (show && selectedTypeKey) {
      optionsHint.textContent = optionsHintForFieldType(selectedTypeKey);
    }
  }

  function validateDefaultValue() {
    if (selectedTypeKey === 'slider' && options.length) {
      if (!defaultValue || !options.includes(defaultValue)) defaultValue = options[0];
      return;
    }
    if (!defaultValue || selectedTypeKey === 'text' || selectedTypeKey === 'multi_select') return;
    const opts = optionsForTypeKey(selectedTypeKey, options);
    if (!opts.includes(defaultValue)) {
      defaultValue = null;
    }
  }

  function mountOptionsEditor() {
    if (selectedTypeKey === 'traffic_light') {
      renderTrafficLightLabels(optionsHost, options, next => {
        options = next;
        working.options = [...options];
        validateDefaultValue();
        mountDefaultPicker();
        updateSaveState();
      }, updateSaveState);
      return;
    }
    renderOptionChips(optionsHost, options, next => {
      options = next;
      working.options = [...options];
      validateDefaultValue();
      mountDefaultPicker();
      updateSaveState();
    }, updateSaveState, optionChipLimits());
  }

  function mountDefaultPicker() {
    if (selectedTypeKey === 'multi_select') {
      defaultHost.innerHTML = '<small class="text-muted default-answer-hint">Multi-select defaults are not configured in admin yet.</small>';
      defaultHost.style.display = 'block';
      return;
    }
    renderDefaultPicker(defaultHost, {
      typeKey: selectedTypeKey,
      options,
      value: defaultValue,
      onChange: v => { defaultValue = v; }
    });
  }

  function optionChipLimits() {
    return {
      minOptions: selectedTypeKey ? minOptionsForFieldType(selectedTypeKey) : null,
      maxOptions: selectedTypeKey ? maxOptionsForFieldType(selectedTypeKey) : null
    };
  }

  function updateSaveState() {
    const label = labelInput.value.trim();
    const hasType = selectedTypeKey != null;
    let valid = !!label && hasType;
    if (valid && usesOptionEditor(selectedTypeKey)) {
      const min = minOptionsForFieldType(selectedTypeKey);
      valid = options.length >= min;
      const max = maxOptionsForFieldType(selectedTypeKey);
      if (max != null) valid = valid && options.length <= max;
      if (selectedTypeKey === 'traffic_light') {
        valid = valid && options.every(o => String(o).trim());
      }
    }
    saveBtn.disabled = !valid;
  }

  function mountOptionChips() {
    mountOptionsEditor();
  }

  function refreshTypePicker() {
    renderTypePicker(typePicker, selectedTypeKey, key => {
      selectedTypeKey = key;
      applyFieldType(working, key);
      defaultValue = null;
      const def = fieldTypeConfigForKey(key);
      if (usesOptionEditor(key)) {
        if (key === 'traffic_light') {
          options = normalizeTrafficLightOptions(
            !creating && working.options?.length ? working.options : (def?.options || [])
          );
        } else {
          options = !creating && working.options?.length ? [...working.options] : [...(def?.options || [])];
        }
        working.options = [...options];
        if (key === 'slider' && options.length) defaultValue = options[0];
        mountOptionsEditor();
      } else {
        options = [];
      }
      if (key === 'gauge') {
        gaugeDescription = working.description || '';
        gaugeDescInput.value = gaugeDescription;
        gaugeReversed = working.gaugeColors === 'red_to_green';
        gaugeReverseInput.checked = gaugeReversed;
      } else {
        gaugeReversed = false;
      }
      syncOptionsVisibility();
      mountDefaultPicker();
      refreshTypePicker();
      updateSaveState();
    });
  }

  refreshTypePicker();
  if (usesOptionEditor(selectedTypeKey)) {
    if (selectedTypeKey === 'traffic_light') {
      options = normalizeTrafficLightOptions(options);
    }
    if (selectedTypeKey === 'slider' && options.length && !defaultValue) {
      defaultValue = options[0];
    }
    mountOptionsEditor();
  }
  syncOptionsVisibility();
  mountDefaultPicker();
  labelInput.addEventListener('input', updateSaveState);
  gaugeDescInput.addEventListener('input', updateSaveState);
  gaugeReverseInput.addEventListener('change', () => {
    gaugeReversed = gaugeReverseInput.checked;
    updateSaveState();
  });
  updateSaveState();

  saveBtn.onclick = () => {
    if (saveBtn.disabled) return;
    working.label = labelInput.value.trim();
    working.id = working.id || slugifyId(working.label);
    working.required = wrap.querySelector('#edRequired').checked;
    if (usesOptionEditor(selectedTypeKey)) working.options = options.map(o => String(o).trim());
    if (working.type === 'gauge') {
      const desc = gaugeDescInput.value.trim();
      if (desc) working.description = desc;
      else delete working.description;
      if (gaugeReversed) working.gaugeColors = 'red_to_green';
      else delete working.gaugeColors;
    } else {
      delete working.description;
      delete working.gaugeColors;
    }
    if (working.type === 'slider' && options.length) {
      working.default = defaultValue && options.includes(defaultValue) ? defaultValue : options[0];
    } else if (defaultValue) {
      working.default = defaultValue;
    } else {
      delete working.default;
    }
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

function adminSaveStub(statusEl) {
  statusEl.textContent = 'Save & Deploy — coming in Checklist Config v0.1 (changes are local for now)';
  statusEl.className = 'app-status text-success';
  setTimeout(() => {
    statusEl.textContent = 'Ready — edits are local until Save & Deploy is enabled';
    statusEl.className = 'app-status';
  }, 4000);
}

async function adminSaveDeploy({
  org, token, orgDraft, defaultConfig, objectType, fields, sections, layout, checklistsConfig, api, setStatus, saveBtn
}) {
  if (!org || !token) {
    setStatus('Authenticate before saving', 'danger');
    return { success: false };
  }

  syncChecklistStateToOrgDraft(orgDraft, defaultConfig, objectType, { fields, sections, layout }, checklistsConfig);
  const payload = buildOrgSavePayload(
    org,
    orgDraft,
    checklistsConfig,
    { objectType, fields, sections, layout },
    defaultConfig
  );

  saveBtn.disabled = true;
  setStatus('Saving to GitHub...');
  try {
    const res = await api('save_checklist_config', { org, token, config: payload });
    if (!res.success) {
      setStatus(res.error || 'Save failed', 'danger');
      return res;
    }
    setStatus(res.message || `Saved ${org} checklist config — Please wait 1 minute to use checklist`, 'success', 60000);
    return res;
  } catch (err) {
    setStatus(err.message || 'Save failed', 'danger');
    return { success: false, error: err.message };
  } finally {
    saveBtn.disabled = false;
  }
}

function exportOrgConfig({ org, orgDraft, checklistsConfig, liveState, defaultConfig, setStatus }) {
  const payload = buildOrgSavePayload(org, orgDraft, checklistsConfig, liveState, defaultConfig);
  const json = JSON.stringify(payload, null, 2) + '\n';
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeOrg = String(org || 'org').trim().toUpperCase() || 'ORG';
  link.href = url;
  link.download = formatChecklistExportFilename(org);
  link.click();
  URL.revokeObjectURL(url);
  const typeCount = Object.keys(payload.checklists).length;
  const expected = CHECKLIST_OBJECT_TYPES.length;
  const typeList = CHECKLIST_OBJECT_TYPES.map(t => t.key).join(', ');
  const hasLocation = !!payload.checklists.location;
  let message = `Exported ${safeOrg} (${typeCount}/${expected} types: ${typeList})`;
  if (!hasLocation) message += ' — warning: location missing';
  message += ' — Save & Deploy not required';
  setStatus(message, hasLocation ? 'success' : 'warning', 5000);
}

async function importOrgConfigFromFile({ file, org, orgDraft, defaultConfig, setStatus, onApplied }) {
  let raw;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    setStatus('Import failed — invalid JSON file', 'danger');
    return { success: false };
  }

  let imported;
  try {
    imported = normalizeImportedOrgConfig(raw);
  } catch (err) {
    setStatus(err.message || 'Import failed — invalid config file', 'danger');
    return { success: false };
  }

  const targetOrg = String(org || '').trim().toUpperCase();
  const fileOrg = raw.org ? String(raw.org).trim().toUpperCase() : '';
  const typeCount = Object.keys(imported.checklists).length;
  const typeList = Object.keys(imported.checklists).join(', ');

  let message = `Import ${typeCount} object type${typeCount === 1 ? '' : 's'} (${typeList}) into ${targetOrg}?`;
  message += '\n\nThis updates your local draft only — use Save & Deploy to publish.';
  if (fileOrg && fileOrg !== targetOrg) {
    message = `This file is labeled for ${fileOrg} but you are editing ${targetOrg}.\n\n${message}`;
  }
  if (!window.confirm(message)) {
    return { success: false, cancelled: true };
  }

  applyOrgDraftFromImport(orgDraft, imported);
  const nextConfig = mergeChecklistConfigs(defaultConfig, orgDraft);
  onApplied(nextConfig, imported);
  const importedLocation = !!imported.checklists.location;
  let importMsg = `Imported ${typeCount} object type${typeCount === 1 ? '' : 's'} (${typeList})`;
  if (importedLocation) importMsg += ' including location';
  importMsg += ' — Save & Deploy when ready';
  setStatus(importMsg, 'success', 4000);
  return { success: true };
}
