/** Sample UI — configurable signature, photos, and damage/markup sections (not production). */

function sectionSummaryLabel(key, sections, objectType) {
  if (key === 'signature') {
    if (!sections.signature?.enabled) return 'Off';
    return sections.signature.required ? 'On · required' : 'On · optional';
  }
  if (key === 'photos') {
    if (!sections.photos?.enabled) return 'Off';
    return sections.photos.required ? 'On · required' : 'On · optional';
  }
  if (key === 'damagePad') {
    const dp = sections.damagePad;
    if (!dp?.enabled) return 'Off';
    const mode = dp.mode === 'photo' ? 'Camera photo' : 'Stock diagram';
    return `${mode}${dp.required ? ' · required' : ''}`;
  }
  return '';
}

function renderSectionSettingsPanel(host, sections, objectType, onChange) {
  host.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'section-settings-panel';
  panel.innerHTML = `
    <h3 class="section-settings-title"><i class="fa-solid fa-sliders me-1"></i> Form sections</h3>
    <p class="section-settings-note">Per object type — controls what appears below the checklist questions in the inspection app.</p>
    <div class="section-settings-grid" id="sectionSettingsGrid"></div>`;
  host.appendChild(panel);

  const grid = panel.querySelector('#sectionSettingsGrid');

  function row(label, key, bodyHtml) {
    const wrap = document.createElement('div');
    wrap.className = 'section-setting-block';
    wrap.innerHTML = `
      <div class="section-setting-head">
        <div class="form-check form-switch mb-0">
          <input class="form-check-input" type="checkbox" id="sec_${key}_enabled" ${sections[key]?.enabled ? 'checked' : ''} />
          <label class="form-check-label fw-semibold" for="sec_${key}_enabled">${escapeHtml(label)}</label>
        </div>
        <div class="form-check mb-0" id="sec_${key}_requiredWrap">
          <input class="form-check-input" type="checkbox" id="sec_${key}_required" ${sections[key]?.required ? 'checked' : ''} />
          <label class="form-check-label" for="sec_${key}_required">Required</label>
        </div>
      </div>
      <div class="section-setting-body" id="sec_${key}_body">${bodyHtml}</div>`;
    return wrap;
  }

  const damageBody = `
    <label class="form-label small mb-1">Markup mode</label>
    <select class="form-select form-select-sm" id="sec_damage_mode">
      <option value="stock">Stock diagram (container / trailer)</option>
      <option value="photo">Camera photo (mark up captured image)</option>
    </select>
    <div class="mt-2" id="sec_damage_stockWrap">
      <label class="form-label small mb-1">Default diagram</label>
      <select class="form-select form-select-sm" id="sec_damage_defaultImage">
        <option value="container">Container</option>
        <option value="trailer">Trailer</option>
      </select>
    </div>
    <small class="text-muted d-block mt-2">PO / trailer: stock diagram. iLPN: camera photo is typical.</small>`;

  grid.appendChild(row("Inspector's signature", 'signature', '<small class="text-muted">Signature pad below questions.</small>'));
  grid.appendChild(row('Inspection photos', 'photos', '<small class="text-muted">Header camera + thumbnail strip (shown with signature area in app).</small>'));
  grid.appendChild(row('Damage / markup pad', 'damagePad', damageBody));

  function syncVisibility() {
    ['signature', 'photos', 'damagePad'].forEach(key => {
      const enabled = panel.querySelector(`#sec_${key}_enabled`).checked;
      const reqWrap = panel.querySelector(`#sec_${key}_requiredWrap`);
      const body = panel.querySelector(`#sec_${key}_body`);
      if (reqWrap) reqWrap.style.display = enabled ? '' : 'none';
      if (body) body.style.opacity = enabled ? '1' : '0.45';
      if (body) body.style.pointerEvents = enabled ? '' : 'none';
    });
    const damageOn = panel.querySelector('#sec_damagePad_enabled').checked;
    const stockWrap = panel.querySelector('#sec_damage_stockWrap');
    const mode = panel.querySelector('#sec_damage_mode').value;
    if (stockWrap) stockWrap.style.display = damageOn && mode === 'stock' ? '' : 'none';
  }

  function emit() {
    sections.signature.enabled = panel.querySelector('#sec_signature_enabled').checked;
    sections.signature.required = panel.querySelector('#sec_signature_required').checked;
    sections.photos.enabled = panel.querySelector('#sec_photos_enabled').checked;
    sections.photos.required = panel.querySelector('#sec_photos_required').checked;
    sections.damagePad.enabled = panel.querySelector('#sec_damagePad_enabled').checked;
    sections.damagePad.required = panel.querySelector('#sec_damagePad_required').checked;
    sections.damagePad.mode = panel.querySelector('#sec_damage_mode').value;
    sections.damagePad.defaultImage = panel.querySelector('#sec_damage_defaultImage').value;
    if (sections.damagePad.mode === 'photo') {
      delete sections.damagePad.defaultImage;
      delete sections.damagePad.images;
    } else if (!sections.damagePad.images) {
      sections.damagePad.images = ['container', 'trailer'];
      sections.damagePad.defaultImage = sections.damagePad.defaultImage || 'container';
    }
    syncVisibility();
    onChange(sections);
  }

  panel.querySelector('#sec_damage_mode').value = sections.damagePad?.mode === 'photo' ? 'photo' : 'stock';
  panel.querySelector('#sec_damage_defaultImage').value = sections.damagePad?.defaultImage || 'container';
  panel.querySelectorAll('input, select').forEach(el => el.addEventListener('change', emit));
  syncVisibility();
}

function renderSectionListRows(listInner, sections, objectType, onConfigure) {
  listInner.querySelectorAll('.section-config-row').forEach(el => el.remove());
  const frag = document.createDocumentFragment();
  const items = [
    { key: 'signature', label: "Inspector's signature", icon: 'fa-signature' },
    { key: 'photos', label: 'Inspection photos', icon: 'fa-camera' },
    { key: 'damagePad', label: 'Damage / markup pad', icon: 'fa-pen-ruler' }
  ];
  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'question-row section-config-row system-field';
    row.innerHTML = `
      <span class="grip section-grip-muted"><i class="fa-solid fa-lock"></i></span>
      <div class="q-label">${escapeHtml(item.label)} <span class="badge-system">Section</span></div>
      <span class="badge-type section-summary-badge">${escapeHtml(sectionSummaryLabel(item.key, sections, objectType))}</span>
      <div class="q-actions">
        <button type="button" class="btn btn-outline-light btn-icon configure-section-btn" title="Configure"><i class="fa-solid fa-sliders"></i></button>
      </div>`;
    row.querySelector('.configure-section-btn').onclick = e => {
      e.stopPropagation();
      onConfigure(item.key);
    };
    frag.appendChild(row);
  });
  listInner.appendChild(frag);
}

function openSectionEditor(host, sectionKey, sections, objectType, onSave, onCancel) {
  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'editor-panel';
  const titles = {
    signature: "Inspector's signature",
    photos: 'Inspection photos',
    damagePad: 'Damage / markup pad'
  };
  wrap.innerHTML = `<h3>Configure ${escapeHtml(titles[sectionKey] || sectionKey)}</h3><div id="secEditorBody"></div>
    <div class="d-flex gap-2 flex-wrap mt-3">
      <button type="button" class="btn btn-primary" id="secEdSave">Done</button>
      <button type="button" class="btn btn-secondary" id="secEdCancel">Cancel</button>
    </div>`;
  host.appendChild(wrap);

  const working = JSON.parse(JSON.stringify(sections));
  const miniHost = document.createElement('div');
  wrap.querySelector('#secEditorBody').appendChild(miniHost);

  if (sectionKey === 'damagePad') {
    renderSectionSettingsPanel(miniHost, working, objectType, () => {});
    miniHost.querySelectorAll('.section-setting-block').forEach((block, i) => {
      block.style.display = i === 2 ? '' : 'none';
    });
    miniHost.querySelector('.section-settings-title').style.display = 'none';
    miniHost.querySelector('.section-settings-note').style.display = 'none';
  } else {
    const enabled = working[sectionKey].enabled;
    miniHost.innerHTML = `
      <div class="form-check form-switch mb-3">
        <input class="form-check-input" type="checkbox" id="one_enabled" ${enabled ? 'checked' : ''} />
        <label class="form-check-label" for="one_enabled">Show in inspection form</label>
      </div>
      <div class="form-check">
        <input class="form-check-input" type="checkbox" id="one_required" ${working[sectionKey].required ? 'checked' : ''} />
        <label class="form-check-label" for="one_required">Required</label>
      </div>`;
    wrap.querySelector('#secEdSave').onclick = () => {
      if (sectionKey !== 'damagePad') {
        working[sectionKey].enabled = miniHost.querySelector('#one_enabled').checked;
        working[sectionKey].required = miniHost.querySelector('#one_required').checked;
      } else {
        const panel = miniHost.querySelector('.section-settings-panel');
        working.damagePad.enabled = panel.querySelector('#sec_damagePad_enabled').checked;
        working.damagePad.required = panel.querySelector('#sec_damagePad_required').checked;
        working.damagePad.mode = panel.querySelector('#sec_damage_mode').value;
        if (working.damagePad.mode === 'stock') {
          working.damagePad.defaultImage = panel.querySelector('#sec_damage_defaultImage').value;
          working.damagePad.images = ['container', 'trailer'];
        }
      }
      Object.assign(sections, working);
      onSave();
    };
    wrap.querySelector('#secEdCancel').onclick = onCancel;
    return;
  }

  wrap.querySelector('#secEdSave').onclick = () => {
    const panel = miniHost.querySelector('.section-settings-panel');
    working.damagePad.enabled = panel.querySelector('#sec_damagePad_enabled').checked;
    working.damagePad.required = panel.querySelector('#sec_damagePad_required').checked;
    working.damagePad.mode = panel.querySelector('#sec_damage_mode').value;
    if (working.damagePad.mode === 'stock') {
      working.damagePad.defaultImage = panel.querySelector('#sec_damage_defaultImage').value;
      working.damagePad.images = ['container', 'trailer'];
    } else {
      delete working.damagePad.defaultImage;
      delete working.damagePad.images;
    }
    Object.assign(sections, working);
    onSave();
  };
  wrap.querySelector('#secEdCancel').onclick = onCancel;
}

function appendPreviewFormSections(root, sections, objectType) {
  root.querySelectorAll('.preview-form-section').forEach(el => el.remove());

  if (sections.photos?.enabled) {
    const photos = document.createElement('div');
    photos.className = 'preview-form-section preview-photos-hint';
    photos.innerHTML = `
      <div class="preview-photos-chip"><i class="fas fa-camera"></i> Inspection photos${sections.photos.required ? ' <span class="required-asterisk">*</span>' : ''}</div>
      <small class="text-muted">Camera in header · thumbnails appear below signature in app</small>`;
    root.appendChild(photos);
  }

  if (sections.signature?.enabled) {
    const sig = document.createElement('div');
    sig.className = 'preview-form-section preview-signature-section';
    sig.innerHTML = `
      <div class="preview-section-head">
        <label>Inspector's Signature${sections.signature.required ? ' <span class="required-asterisk">*</span>' : ''}</label>
        <span class="preview-mock-btn">Clear</span>
      </div>
      <div class="preview-signature-pad" aria-hidden="true"></div>`;
    root.appendChild(sig);
  }

  if (sections.damagePad?.enabled) {
    const dp = sections.damagePad;
    const title = damagePadTitle(objectType, sections);
    const block = document.createElement('div');
    block.className = 'preview-form-section preview-damage-section';
    if (dp.mode === 'photo' && (objectType === 'ilpn' || objectType === 'olpn')) {
      block.innerHTML = `
        <div class="preview-section-head">
          <label>${escapeHtml(title)}${dp.required ? ' <span class="required-asterisk">*</span>' : ''}</label>
          <span class="preview-mock-btn"><i class="fas fa-camera"></i></span>
        </div>
        <div class="preview-damage-pad preview-damage-empty">
          <i class="fas fa-plus"></i>
          <span>Tap camera to add LPN photo</span>
        </div>
        <small class="text-muted">Mark up captured photo with draw tools</small>`;
    } else if (dp.mode === 'photo') {
      block.innerHTML = `
        <div class="preview-section-head">
          <label>${escapeHtml(title)}${dp.required ? ' <span class="required-asterisk">*</span>' : ''}</label>
          <span class="preview-mock-btn"><i class="fas fa-camera"></i></span>
        </div>
        <div class="preview-damage-pad preview-damage-empty">
          <i class="fas fa-camera"></i>
          <span>Add photo to mark up</span>
        </div>`;
    } else {
      const imgKey = dp.defaultImage || 'container';
      block.innerHTML = `
        <div class="preview-section-head">
          <label>${escapeHtml(title)}${dp.required ? ' <span class="required-asterisk">*</span>' : ''}</label>
          <div class="preview-damage-stock-toggle">
            <span class="preview-seg${imgKey === 'container' ? ' on' : ''}">Container</span>
            <span class="preview-seg${imgKey === 'trailer' ? ' on' : ''}">Trailer</span>
          </div>
        </div>
        <div class="preview-damage-pad preview-damage-stock">
          <img src="/${imgKey === 'trailer' ? 'trailer' : 'container'}.png" alt="" />
        </div>
        <small class="text-muted">Circle or mark areas of damage on the diagram</small>`;
    }
    root.appendChild(block);
  }
}

function renderDevicePreviewWithSections({ fields, sections, objectType, objectLabel, container }) {
  prunePreviewState(fields);
  fields.forEach(f => {
    if (f.id && !(f.id in previewState)) setPreviewFromField(f);
  });

  container.innerHTML = `
    <p class="preview-interactive-hint">Sections reflect configuration — scroll inside device</p>
    <div class="device-frame-wrap">
      <div class="device-frame">
        <div class="device-earpiece"></div>
        <div class="device-screen" id="previewThemeScope">
          <div class="device-app-chrome">
            <span class="device-chrome-icon"><i class="fas fa-camera"></i></span>
            <div class="device-chrome-center">
              <div class="device-chrome-title">Inspection v0.0.15</div>
            </div>
            <span class="device-chrome-icon device-chrome-spacer"></span>
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
  if (!fields.length) {
    root.innerHTML = `<p class="text-muted mb-2 device-empty-msg">No questions configured.</p>`;
  } else {
    fields.forEach(field => {
      const group = document.createElement('div');
      group.className = 'form-group';
      const label = document.createElement('label');
      label.innerHTML = `${escapeHtml(field.label)}${field.required ? ' <span class="required-asterisk">*</span>' : ''}`;
      group.appendChild(label);
      appendPreviewControlForField(group, field);
      root.appendChild(group);
    });
  }
  appendPreviewFormSections(root, sections, objectType);
}

function appendPreviewControlForField(group, field) {
  const current = field.id ? (previewState[field.id] ?? '') : '';
  if (field.type === 'segmented') {
    const segWrap = document.createElement('div');
    segWrap.className = 'checklist-segmented';
    (field.options || []).forEach(option => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'segment-btn' + (current === option ? ' selected' : '');
      btn.textContent = option;
      btn.onclick = () => {
        const next = (previewState[field.id] ?? '') === option ? '' : option;
        previewState[field.id] = next;
        segWrap.querySelectorAll('.segment-btn').forEach(s => {
          s.classList.toggle('selected', s.textContent === next);
        });
      };
      segWrap.appendChild(btn);
    });
    group.appendChild(segWrap);
  } else if (field.type === 'dropdown') {
    const select = document.createElement('select');
    select.className = 'form-select form-select-sm';
    (field.options || []).forEach(option => {
      const opt = document.createElement('option');
      opt.value = option;
      opt.textContent = option;
      if (current === option) opt.selected = true;
      select.appendChild(opt);
    });
    select.onchange = () => { previewState[field.id] = select.value; };
    group.appendChild(select);
  } else {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control form-control-sm';
    input.value = current;
    input.placeholder = field.placeholder || '';
    input.oninput = () => { previewState[field.id] = input.value; };
    group.appendChild(input);
  }
}
