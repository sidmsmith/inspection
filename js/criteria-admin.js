/** Manage Criteria modal (rule list + boolean rule builder) and Copy Criteria modal — checklist-admin. */

const ccState = {
  objectType: null,
  criteriaList: null, // live reference into checklistsConfig.checklists[objectType].criteria
  selectedId: null,
  fieldCatalog: null,
  onChange: null
};

function ccFindEntry(id) {
  return (ccState.criteriaList || []).find(c => c.id === id) || null;
}

function ccEmitChange() {
  ccState.onChange?.(ccState.criteriaList);
}

async function openManageCriteriaModal({ objectType, criteriaList, onChange, modal }) {
  ccState.objectType = objectType;
  ccState.criteriaList = criteriaList;
  ccState.onChange = onChange;
  ccState.fieldCatalog = await loadCriteriaFieldCatalog(objectType);

  const firstNonDefault = criteriaList.find(c => !c.isDefault);
  ccState.selectedId = (firstNonDefault || criteriaList[criteriaList.length - 1] || {}).id || null;

  ccRenderRuleList();
  ccRenderRuleBuilder();

  const confirmBtn = document.getElementById('criteriaModalConfirmBtn');
  if (confirmBtn) confirmBtn.onclick = () => modal.hide();
}

function ccRenderRuleList() {
  const host = document.getElementById('criteriaRuleListHost');
  if (!host) return;
  const list = ccState.criteriaList;

  host.innerHTML = list.map((c, idx) => {
    const isDefault = !!c.isDefault;
    const selected = c.id === ccState.selectedId;
    return `
      <div class="criteria-rule-row${selected ? ' selected' : ''}${isDefault ? ' default-row' : ''}" data-idx="${idx}" data-id="${escapeHtml(c.id)}">
        ${isDefault ? '<span class="grip" style="visibility:hidden"><i class="fa-solid fa-grip-vertical"></i></span>' : '<span class="grip" title="Drag to reorder"><i class="fa-solid fa-grip-vertical"></i></span>'}
        <span class="criteria-rule-name">${escapeHtml(c.name || (isDefault ? 'Default' : 'New Rule'))}</span>
        ${isDefault ? '' : '<button type="button" class="criteria-row-action-btn del-btn" title="Delete rule" aria-label="Delete rule"><i class="fa-solid fa-trash"></i></button>'}
      </div>`;
  }).join('');

  const addRow = document.createElement('div');
  addRow.className = 'criteria-add-rule-row';
  addRow.innerHTML = '<button type="button" class="add-question-inline-btn" title="Add rule" aria-label="Add rule"><i class="fa-solid fa-plus"></i></button>';
  addRow.querySelector('button').onclick = ccAddRule;
  host.appendChild(addRow);

  host.querySelectorAll('.criteria-rule-row').forEach(row => {
    const id = row.dataset.id;
    row.onclick = e => {
      if (e.target.closest('.grip') || e.target.closest('.del-btn') || e.target.closest('.criteria-rule-name-input')) return;
      ccState.selectedId = id;
      ccRenderRuleList();
      ccRenderRuleBuilder();
    };
    const nameEl = row.querySelector('.criteria-rule-name');
    if (nameEl && !row.classList.contains('default-row')) {
      nameEl.onclick = e => {
        e.stopPropagation();
        ccStartRenameRule(row, id);
      };
    }
    const delBtn = row.querySelector('.del-btn');
    if (delBtn) {
      delBtn.onclick = e => {
        e.stopPropagation();
        ccDeleteRule(id);
      };
    }
  });

  bindCriteriaRuleDragReorder(host, {
    criteriaList: list,
    onReorder: next => {
      ccState.criteriaList.length = 0;
      ccState.criteriaList.push(...next);
      ccRenderRuleList();
      ccEmitChange();
    }
  });
}

function bindCriteriaRuleDragReorder(listEl, { criteriaList, onReorder }) {
  if (!listEl) return;
  let dragFrom = null;
  const maxIndex = Math.max(criteriaList.length - 2, 0);

  const rows = [...listEl.querySelectorAll('.criteria-rule-row')];
  rows.forEach(row => {
    if (row.classList.contains('default-row')) return;
    const grip = row.querySelector('.grip');
    if (!grip) return;
    grip.draggable = true;
    grip.addEventListener('dragstart', e => {
      dragFrom = +row.dataset.idx;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragFrom));
      e.stopPropagation();
    });
    grip.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      rows.forEach(r => r.classList.remove('drag-over'));
      dragFrom = null;
    });
  });

  rows.forEach(row => {
    if (row.classList.contains('default-row')) return;
    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', e => {
      if (!row.contains(e.relatedTarget)) row.classList.remove('drag-over');
    });
    row.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      row.classList.remove('drag-over');
      const to = +row.dataset.idx;
      if (dragFrom == null || dragFrom === to) return;
      const next = [...criteriaList];
      const [moved] = next.splice(dragFrom, 1);
      next.splice(Math.min(to, maxIndex), 0, moved);
      onReorder(next);
    });
  });
}

function ccStartRenameRule(row, id) {
  const entry = ccFindEntry(id);
  if (!entry) return;
  const nameEl = row.querySelector('.criteria-rule-name');
  if (!nameEl) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'criteria-rule-name-input';
  input.value = entry.name || '';
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  const commit = () => {
    entry.name = input.value.trim() || 'New Rule';
    ccRenderRuleList();
    ccEmitChange();
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); ccRenderRuleList(); }
  });
}

function ccAddRule() {
  const entry = {
    id: newCriteriaId(),
    name: 'New Rule',
    isDefault: false,
    rule: { conditions: [] },
    fields: [],
    sections: {},
    layout: []
  };
  const defaultIdx = ccState.criteriaList.findIndex(c => c.isDefault);
  const insertAt = defaultIdx >= 0 ? defaultIdx : ccState.criteriaList.length;
  ccState.criteriaList.splice(insertAt, 0, entry);
  ccState.selectedId = entry.id;
  ccRenderRuleList();
  ccRenderRuleBuilder();
  ccEmitChange();
}

function ccDeleteRule(id) {
  const entry = ccFindEntry(id);
  if (!entry || entry.isDefault) return;
  if (!window.confirm(`Delete rule "${entry.name || 'New Rule'}"? This cannot be undone.`)) return;
  const idx = ccState.criteriaList.findIndex(c => c.id === id);
  if (idx < 0) return;
  ccState.criteriaList.splice(idx, 1);
  if (ccState.selectedId === id) {
    const fallback = ccState.criteriaList.find(c => !c.isDefault) || ccState.criteriaList[ccState.criteriaList.length - 1];
    ccState.selectedId = fallback ? fallback.id : null;
  }
  ccRenderRuleList();
  ccRenderRuleBuilder();
  ccEmitChange();
}

function ccFieldOptionsHtml(selectedSource, selectedField) {
  const groups = ccState.fieldCatalog?.groups || [];
  return groups.map(g => `
    <optgroup label="${escapeHtml(g.label)}">
      ${g.fields.map(f => {
        const value = `${g.key}::${f.field}`;
        const isSelected = g.source === selectedSource && f.field === selectedField;
        return `<option value="${escapeHtml(value)}" data-source="${escapeHtml(g.source)}"${isSelected ? ' selected' : ''}>${escapeHtml(f.label)}</option>`;
      }).join('')}
    </optgroup>`).join('');
}

function ccOperatorOptionsHtml(selected) {
  return CRITERIA_OPERATORS.map(o =>
    `<option value="${o.key}"${o.key === selected ? ' selected' : ''}>${escapeHtml(o.label)}</option>`
  ).join('');
}

function ccRenderRuleBuilder() {
  const host = document.getElementById('criteriaRuleBuilderHost');
  if (!host) return;
  const entry = ccFindEntry(ccState.selectedId);

  if (!entry) {
    host.innerHTML = '<p class="criteria-rule-builder-empty">Select a rule on the left, or add a new one.</p>';
    return;
  }

  if (entry.isDefault) {
    host.innerHTML = '<p class="criteria-default-note">Default is the catch-all — it matches when no other rule does. It has no conditions and always stays last.</p>';
    return;
  }

  if (!entry.rule) entry.rule = { conditions: [] };
  if (!Array.isArray(entry.rule.conditions)) entry.rule.conditions = [];

  const rowsHtml = entry.rule.conditions.map((cond, idx) => {
    const conjunctionHtml = idx === 0
      ? '<span class="criteria-conjunction-spacer"></span>'
      : `<select class="criteria-conjunction-select" data-idx="${idx}" data-role="conjunction">
          <option value="AND"${cond.conjunction !== 'OR' ? ' selected' : ''}>AND</option>
          <option value="OR"${cond.conjunction === 'OR' ? ' selected' : ''}>OR</option>
        </select>`;
    const takesValue = criteriaOperatorTakesValue(cond.operator);
    return `
      <div class="criteria-condition-row" data-idx="${idx}">
        ${conjunctionHtml}
        <select class="criteria-field-select" data-idx="${idx}" data-role="field">${ccFieldOptionsHtml(cond.source, cond.field)}</select>
        <select class="criteria-operator-select" data-idx="${idx}" data-role="operator">${ccOperatorOptionsHtml(cond.operator)}</select>
        <input type="text" class="criteria-value-input" data-idx="${idx}" data-role="value" value="${escapeHtml(cond.value ?? '')}" placeholder="Value" ${takesValue ? '' : 'disabled'} />
        <button type="button" class="criteria-row-action-btn" data-idx="${idx}" data-role="add" title="Add condition below" aria-label="Add condition below"><i class="fa-solid fa-plus"></i></button>
        <button type="button" class="criteria-row-action-btn criteria-remove-condition" data-idx="${idx}" data-role="remove" title="Remove condition" aria-label="Remove condition"><i class="fa-solid fa-xmark"></i></button>
      </div>`;
  }).join('');

  const emptyHtml = entry.rule.conditions.length
    ? ''
    : '<div class="criteria-add-rule-row"><button type="button" class="add-question-inline-btn" id="criteriaAddFirstCondition" title="Add condition" aria-label="Add condition"><i class="fa-solid fa-plus"></i></button></div>';

  const preview = ruleToMawmSyntax(entry.rule);

  host.innerHTML = `
    <div class="criteria-condition-rows">${rowsHtml}</div>
    ${emptyHtml}
    ${preview ? `<div class="criteria-mawm-preview">${escapeHtml(preview)}</div>` : ''}
    <div class="criteria-builder-confirm-row">
      <button type="button" class="btn btn-success" id="criteriaModalConfirmBtn">Confirm</button>
    </div>
  `;

  const firstAddBtn = host.querySelector('#criteriaAddFirstCondition');
  if (firstAddBtn) firstAddBtn.onclick = () => ccAddCondition(entry, -1);

  host.querySelectorAll('[data-role="field"]').forEach(sel => {
    sel.onchange = () => {
      const idx = +sel.dataset.idx;
      const opt = sel.selectedOptions[0];
      entry.rule.conditions[idx].source = opt?.dataset.source || 'header';
      entry.rule.conditions[idx].field = sel.value.split('::')[1] || '';
      entry.rule.conditions[idx].label = opt?.textContent || '';
      ccRenderRuleBuilder();
      ccEmitChange();
    };
  });
  host.querySelectorAll('[data-role="operator"]').forEach(sel => {
    sel.onchange = () => {
      const idx = +sel.dataset.idx;
      entry.rule.conditions[idx].operator = sel.value;
      if (!criteriaOperatorTakesValue(sel.value)) entry.rule.conditions[idx].value = '';
      ccRenderRuleBuilder();
      ccEmitChange();
    };
  });
  host.querySelectorAll('[data-role="value"]').forEach(input => {
    input.oninput = () => {
      const idx = +input.dataset.idx;
      entry.rule.conditions[idx].value = input.value;
      const preview2 = host.querySelector('.criteria-mawm-preview');
      if (preview2) preview2.textContent = ruleToMawmSyntax(entry.rule);
      ccEmitChange();
    };
  });
  host.querySelectorAll('[data-role="conjunction"]').forEach(sel => {
    sel.onchange = () => {
      const idx = +sel.dataset.idx;
      entry.rule.conditions[idx].conjunction = sel.value;
      const preview2 = host.querySelector('.criteria-mawm-preview');
      if (preview2) preview2.textContent = ruleToMawmSyntax(entry.rule);
      ccEmitChange();
    };
  });
  host.querySelectorAll('[data-role="add"]').forEach(btn => {
    btn.onclick = () => ccAddCondition(entry, +btn.dataset.idx);
  });
  host.querySelectorAll('[data-role="remove"]').forEach(btn => {
    btn.onclick = () => {
      entry.rule.conditions.splice(+btn.dataset.idx, 1);
      ccRenderRuleBuilder();
      ccEmitChange();
    };
  });

  const confirmBtn = host.querySelector('#criteriaModalConfirmBtn');
  if (confirmBtn) {
    confirmBtn.onclick = () => {
      const modalEl = document.getElementById('manageCriteriaModal');
      bootstrap.Modal.getInstance(modalEl)?.hide();
    };
  }
}

function ccAddCondition(entry, afterIdx) {
  const firstGroup = ccState.fieldCatalog?.groups?.[0];
  const firstField = firstGroup?.fields?.[0];
  const condition = {
    id: newCriteriaConditionId(),
    source: firstGroup?.source || 'header',
    field: firstField?.field || '',
    label: firstField?.label || '',
    operator: 'eq',
    value: '',
    conjunction: 'AND'
  };
  const insertAt = afterIdx < 0 ? entry.rule.conditions.length : afterIdx + 1;
  entry.rule.conditions.splice(insertAt, 0, condition);
  ccRenderRuleBuilder();
  ccEmitChange();
}

/** Copy Criteria modal — copies fields/sections/layout (not the rule) from a source criteria onto the target. */
function openCopyCriteriaModal({ criteriaList, targetId, onApply }) {
  const select = document.getElementById('copyCriteriaSource');
  if (!select) return;
  select.innerHTML = criteriaList.map(c =>
    `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name || (c.isDefault ? 'Default' : 'New Rule'))}</option>`
  ).join('');
  const firstOther = criteriaList.find(c => c.id !== targetId) || criteriaList[0];
  if (firstOther) select.value = firstOther.id;

  const confirmBtn = document.getElementById('copyCriteriaConfirmBtn');
  if (confirmBtn) {
    confirmBtn.onclick = () => {
      const sourceId = select.value;
      const source = criteriaList.find(c => c.id === sourceId);
      if (!source) return;
      onApply(source);
    };
  }
}
