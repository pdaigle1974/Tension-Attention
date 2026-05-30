'use strict';

// ── Constantes ────────────────────────────────────────────────────────────────

const DEFAULT_PATIENT = {
  nom: '***NOM***', ddn: '(DDN supprimée)', nam: '(NAM supprimé)', expNam: '(exp supprimée)',
  dossier: '(dossier supprimé)', sexe: 'M', medecin: '',
  adresse: '(adresse supprimée)', ville: '(ville supprimée)', codePostal: '(CP supprimé)',
  cell: '(tél supprimé)', telM: '', telT: '',
  courriel: '', medicaments: '',
};

const K_READINGS = 'ta_readings';
const K_PATIENT  = 'ta_patient';
const K_APIKEY   = 'ta_apikey';

// ── État global ───────────────────────────────────────────────────────────────

let currentPage  = 'home';
let exportPeriod = 'all';
let editingId    = null;

// ── Stockage ──────────────────────────────────────────────────────────────────

function loadReadings() {
  try { return JSON.parse(localStorage.getItem(K_READINGS) || '[]'); } catch { return []; }
}
function saveReadings(r) { localStorage.setItem(K_READINGS, JSON.stringify(r)); }

function loadPatient() {
  try {
    const s = JSON.parse(localStorage.getItem(K_PATIENT) || 'null');
    return { ...DEFAULT_PATIENT, ...(s || {}) };
  } catch { return { ...DEFAULT_PATIENT }; }
}
function savePatient(p) { localStorage.setItem(K_PATIENT, JSON.stringify(p)); }

function loadApiKey() { return localStorage.getItem(K_APIKEY) || ''; }
function saveApiKey(k) { localStorage.setItem(K_APIKEY, k); }

// ── Utilitaires ───────────────────────────────────────────────────────────────

function easternNow() {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date());
    const get = t => parts.find(p => p.type === t)?.value ?? '';
    const hour = get('hour') === '24' ? '00' : get('hour');
    return {
      date:  `${get('year')}-${get('month')}-${get('day')}`,
      heure: `${hour}:${get('minute')}`,
    };
  } catch {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return {
      date:  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      heure: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    };
  }
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function colorClass(sys, dia) {
  if (sys <= 130 && dia <= 80) return 'green';
  if (sys <= 140 && dia <= 90) return 'yellow';
  return 'red';
}

function fmtDate(d) {
  if (!d) return '';
  const [y, m, j] = d.split('-');
  return `${j}/${m}/${y}`;
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toast(msg) {
  document.querySelector('.toast')?.remove();
  const el = Object.assign(document.createElement('div'), { className: 'toast', textContent: msg });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2700);
}

function showSpinner(label = 'Lecture en cours…') {
  const el = document.createElement('div');
  el.className = 'spinner-overlay'; el.id = 'spinner';
  el.innerHTML = `<div class="spinner"></div><div class="spinner-label">${label}</div>`;
  document.body.appendChild(el);
}
function hideSpinner() { document.getElementById('spinner')?.remove(); }

// ── OCR ───────────────────────────────────────────────────────────────────────

async function compressImage(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          const r2 = new FileReader();
          r2.onload = ev => resolve(ev.target.result.split(',')[1]);
          r2.readAsDataURL(blob);
        }, 'image/jpeg', 0.78);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function runOCR(file) {
  const image = await compressImage(file);
  const res = await fetch('/api/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, mediaType: 'image/jpeg', apiKey: loadApiKey() }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur serveur');
  }
  return res.json();
}

// ── Routeur ───────────────────────────────────────────────────────────────────

function navigate(page, opts = {}) {
  currentPage = page;
  editingId   = opts.editId || null;

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === page));

  const titles = { home: 'Tension Attention', history: 'Historique',
    add: opts.editId ? 'Modifier la lecture' : 'Nouvelle lecture',
    export: 'Exporter PDF', settings: 'Paramètres' };
  document.getElementById('page-title').textContent = titles[page] || '';

  const el = document.getElementById('app-content');
  el.scrollTop = 0;

  ({ home: renderHome, history: renderHistory, add: renderAdd,
     export: renderExport, settings: renderSettings })[page]?.(el, opts);
}

// ── Carte de lecture ──────────────────────────────────────────────────────────

function readingCard(r) {
  const cls = colorClass(r.sys, r.dia);
  const sub = [fmtDate(r.date) + ' à ' + r.heure, r.etat].filter(Boolean).join(' · ');
  return `
    <div class="reading-card ${cls}">
      <div class="dot ${cls}"></div>
      <div class="reading-main">
        <div class="reading-vals">${r.sys}/${r.dia} <span style="font-size:.85rem;font-weight:500;color:var(--muted)">♥ ${r.pouls}</span></div>
        <div class="reading-sub">${esc(sub)}</div>
      </div>
      <div class="reading-btns">
        <button class="btn-icon btn-edit" data-id="${r.id}" title="Modifier">✏️</button>
        <button class="btn-icon btn-del"  data-id="${r.id}" title="Supprimer">🗑️</button>
      </div>
    </div>`;
}

function attachCardEvents(el) {
  el.querySelectorAll('.btn-del').forEach(b => b.addEventListener('click', () => deleteReading(b.dataset.id)));
  el.querySelectorAll('.btn-edit').forEach(b => b.addEventListener('click', () => navigate('add', { editId: b.dataset.id })));
}

// ── Vues ──────────────────────────────────────────────────────────────────────

function renderHome(el) {
  const readings = loadReadings().slice(-10).reverse();
  const noKey = !loadApiKey();

  el.innerHTML = `
    ${noKey ? `<div class="banner banner-warn">⚠️ Clé API non configurée — l'OCR photo est désactivé. <strong>Paramètres</strong> pour configurer.</div>` : ''}
    <button class="btn btn-primary btn-full" id="btn-add" style="margin-bottom:1.25rem">📷 Ajouter une lecture</button>
    ${readings.length === 0
      ? `<div class="empty"><div class="empty-icon">💉</div><p>Aucune lecture.<br>Ajoutez votre première mesure.</p></div>`
      : `<div class="sec">Lectures récentes</div>${readings.map(readingCard).join('')}`}
  `;
  el.querySelector('#btn-add').addEventListener('click', () => navigate('add'));
  attachCardEvents(el);
}

function renderHistory(el) {
  const readings = loadReadings().slice().reverse();
  el.innerHTML = `
    <div class="legend">
      <div class="legend-item"><div class="legend-dot" style="background:var(--green)"></div>Normal ≤ 130/80</div>
      <div class="legend-item"><div class="legend-dot" style="background:#d97706"></div>Élevé ≤ 140/90</div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--red)"></div>Très élevé</div>
    </div>
    ${readings.length === 0
      ? `<div class="empty"><div class="empty-icon">📋</div><p>Aucune lecture enregistrée.</p></div>`
      : readings.map(readingCard).join('')}
  `;
  attachCardEvents(el);
}

function renderAdd(el, opts = {}) {
  const { editId, prefill } = opts;
  const existing = editId ? loadReadings().find(r => r.id === editId) : null;
  const dt   = existing ? { date: existing.date, heure: existing.heure } : easternNow();
  const sys   = existing?.sys   ?? prefill?.sys   ?? '';
  const dia   = existing?.dia   ?? prefill?.dia   ?? '';
  const pouls = existing?.pouls ?? prefill?.pouls ?? '';
  const etat  = existing?.etat  ?? '';
  const meds  = existing?.medicaments ?? '';

  el.innerHTML = `
    ${!editId ? `
      <div class="method-grid">
        <button class="method-btn" id="btn-photo"><span class="method-icon">📷</span>Prendre une photo</button>
        <button class="method-btn" id="btn-manual"><span class="method-icon">⌨️</span>Saisie manuelle</button>
      </div>` : ''}
    ${prefill ? `<div class="banner banner-ok">✓ Valeurs extraites — vérifiez avant d'enregistrer</div>` : ''}
    <div class="card">
      <div class="row-2">
        <div class="form-group"><label class="form-label">Date</label>
          <input class="form-input" type="date" id="f-date" value="${dt.date}" /></div>
        <div class="form-group"><label class="form-label">Heure</label>
          <input class="form-input" type="time" id="f-heure" value="${dt.heure}" /></div>
      </div>
      <div class="sec">Mesures</div>
      <div class="row-3">
        <div class="form-group"><label class="form-label">SYS</label>
          <input class="form-input num" type="number" inputmode="numeric" id="f-sys" value="${sys}" placeholder="–" min="50" max="300" /></div>
        <div class="form-group"><label class="form-label">DIA</label>
          <input class="form-input num" type="number" inputmode="numeric" id="f-dia" value="${dia}" placeholder="–" min="30" max="200" /></div>
        <div class="form-group"><label class="form-label">Pouls</label>
          <input class="form-input num" type="number" inputmode="numeric" id="f-pouls" value="${pouls}" placeholder="–" min="30" max="250" /></div>
      </div>
      <div class="form-group"><label class="form-label">État</label>
        <input class="form-input" type="text" id="f-etat" value="${esc(etat)}" placeholder="Ex : Après le souper, stressé…" /></div>
      <div class="form-group"><label class="form-label">Médicaments</label>
        <input class="form-input" type="text" id="f-meds" value="${esc(meds)}" placeholder="Ex : Ramipril 5 mg" /></div>
    </div>
    <button class="btn btn-primary btn-full" id="btn-save" style="margin-top:.25rem">
      💾 ${editId ? 'Sauvegarder les modifications' : 'Enregistrer'}
    </button>
    ${editId ? `<button class="btn btn-secondary btn-full" id="btn-cancel" style="margin-top:.5rem">Annuler</button>` : ''}
  `;

  if (!editId) {
    el.querySelector('#btn-photo').addEventListener('click', () => document.getElementById('camera-input').click());
    el.querySelector('#btn-manual').addEventListener('click', () => el.querySelector('#f-sys').focus());
  }
  el.querySelector('#btn-save').addEventListener('click', () => saveReading(editId));
  el.querySelector('#btn-cancel')?.addEventListener('click', () => navigate('history'));
}

function renderExport(el) {
  const readings = loadReadings();
  el.innerHTML = `
    <div class="card">
      <div class="sec" style="margin-top:0">Période</div>
      <div class="period-grid">
        ${['all','30','14','7','custom'].map(p => `
          <button class="period-btn ${exportPeriod === p ? 'active' : ''}" data-p="${p}">
            ${{ all:'Tout', 30:'30 jours', 14:'14 jours', 7:'7 jours', custom:'Personnalisé' }[p]}
          </button>`).join('')}
      </div>
      <div id="custom-range" style="display:${exportPeriod === 'custom' ? 'block' : 'none'}">
        <div class="row-2" style="margin-bottom:.75rem">
          <div class="form-group" style="margin:0"><label class="form-label">Du</label>
            <input class="form-input" type="date" id="f-from" /></div>
          <div class="form-group" style="margin:0"><label class="form-label">Au</label>
            <input class="form-input" type="date" id="f-to" value="${easternNow().date}" /></div>
        </div>
      </div>
      <p style="font-size:.875rem;color:var(--muted);margin-bottom:1rem">
        ${filteredReadings(readings).length} lecture(s) dans cette période
      </p>
      <button class="btn btn-primary btn-full" id="btn-pdf">📄 Générer et partager le PDF</button>
    </div>
    <div class="card">
      <div class="legend">
        <div class="legend-item"><div class="legend-dot" style="background:var(--green)"></div>Normal ≤ 130/80</div>
        <div class="legend-item"><div class="legend-dot" style="background:#d97706"></div>Élevé ≤ 140/90</div>
        <div class="legend-item"><div class="legend-dot" style="background:var(--red)"></div>Très élevé</div>
      </div>
    </div>
  `;
  el.querySelectorAll('.period-btn').forEach(b => b.addEventListener('click', () => {
    exportPeriod = b.dataset.p;
    renderExport(el);
  }));
  el.querySelector('#btn-pdf').addEventListener('click', () => generatePDF(readings));
}

function renderSettings(el) {
  const p = loadPatient();
  const apiKey = loadApiKey();
  const field = (lbl, id, val) => `
    <div class="settings-row">
      <label class="form-label" style="margin-bottom:.25rem">${lbl}</label>
      <input class="form-input" type="text" id="${id}" value="${esc(val || '')}" />
    </div>`;

  el.innerHTML = `
    <div class="settings-block">
      <div class="settings-title">Clé API Anthropic (OCR photo)</div>
      <div class="settings-row">
        <input class="form-input" type="password" id="s-key" value="${esc(apiKey)}" placeholder="sk-ant-…" autocomplete="off" />
        <p style="font-size:.75rem;color:var(--muted);margin-top:.5rem">
          Obtenez une clé sur console.anthropic.com — elle est stockée uniquement sur cet appareil.
        </p>
      </div>
    </div>
    <div class="settings-block">
      <div class="settings-title">Informations patient</div>
      ${field('Nom', 's-nom', p.nom)}
      ${field('Date de naissance', 's-ddn', p.ddn)}
      ${field('N.A.M.', 's-nam', p.nam)}
      ${field('Expiration N.A.M.', 's-expNam', p.expNam)}
      ${field('# Dossier', 's-dossier', p.dossier)}
      ${field('Sexe', 's-sexe', p.sexe)}
      ${field('Médecin', 's-med', p.medecin)}
      ${field('Adresse', 's-adr', p.adresse)}
      ${field('Ville', 's-ville', p.ville)}
      ${field('Code postal', 's-cp', p.codePostal)}
      ${field('Cellulaire', 's-cell', p.cell)}
      ${field('Tél. maison', 's-telM', p.telM)}
      ${field('Tél. travail', 's-telT', p.telT)}
      ${field('Courriel', 's-mail', p.courriel)}
    </div>
    <div class="settings-block">
      <div class="settings-title">Médicaments (section fixe du formulaire)</div>
      <div class="settings-row">
        <textarea class="form-input" id="s-meds" rows="3" placeholder="Ex : Ramipril 5 mg 1×/jour">${esc(p.medicaments)}</textarea>
      </div>
    </div>
    <button class="btn btn-primary btn-full" id="btn-save-s" style="margin-bottom:1rem">💾 Sauvegarder</button>
  `;

  el.querySelector('#btn-save-s').addEventListener('click', () => {
    saveApiKey(el.querySelector('#s-key').value.trim());
    savePatient({
      nom:        el.querySelector('#s-nom').value.trim(),
      ddn:        el.querySelector('#s-ddn').value.trim(),
      nam:        el.querySelector('#s-nam').value.trim(),
      expNam:     el.querySelector('#s-expNam').value.trim(),
      dossier:    el.querySelector('#s-dossier').value.trim(),
      sexe:       el.querySelector('#s-sexe').value.trim(),
      medecin:    el.querySelector('#s-med').value.trim(),
      adresse:    el.querySelector('#s-adr').value.trim(),
      ville:      el.querySelector('#s-ville').value.trim(),
      codePostal: el.querySelector('#s-cp').value.trim(),
      cell:       el.querySelector('#s-cell').value.trim(),
      telM:       el.querySelector('#s-telM').value.trim(),
      telT:       el.querySelector('#s-telT').value.trim(),
      courriel:   el.querySelector('#s-mail').value.trim(),
      medicaments: el.querySelector('#s-meds').value.trim(),
    });
    toast('Paramètres sauvegardés ✓');
  });
}

// ── Actions ───────────────────────────────────────────────────────────────────

function saveReading(editId) {
  const sys   = parseInt(document.getElementById('f-sys').value);
  const dia   = parseInt(document.getElementById('f-dia').value);
  const pouls = parseInt(document.getElementById('f-pouls').value);
  if (isNaN(sys) || isNaN(dia) || isNaN(pouls)) {
    toast('Veuillez entrer SYS, DIA et Pouls');
    return;
  }
  const r = {
    id:          editId || uid(),
    date:        document.getElementById('f-date').value,
    heure:       document.getElementById('f-heure').value,
    sys, dia, pouls,
    etat:        document.getElementById('f-etat').value.trim(),
    medicaments: document.getElementById('f-meds').value.trim(),
  };
  let readings = loadReadings();
  readings = editId ? readings.map(x => x.id === editId ? r : x) : [...readings, r];
  saveReadings(readings);
  toast(editId ? 'Lecture modifiée ✓' : 'Lecture enregistrée ✓');
  navigate('home');
}

function deleteReading(id) {
  if (!confirm('Supprimer cette lecture ?')) return;
  saveReadings(loadReadings().filter(r => r.id !== id));
  navigate(currentPage);
}

// ── Caméra → OCR ─────────────────────────────────────────────────────────────

document.getElementById('camera-input').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';

  if (!loadApiKey()) {
    toast('Clé API manquante — allez dans Paramètres');
    navigate('add');
    return;
  }

  showSpinner('Lecture en cours…');
  try {
    const vals = await runOCR(file);
    hideSpinner();
    if (vals.sys || vals.dia || vals.pouls) {
      navigate('add', { prefill: { sys: vals.sys ?? '', dia: vals.dia ?? '', pouls: vals.pouls ?? '' } });
    } else {
      toast('Impossible de lire les valeurs — saisie manuelle');
      navigate('add');
    }
  } catch {
    hideSpinner();
    toast('Erreur OCR — saisie manuelle');
    navigate('add');
  }
});

// ── PDF ───────────────────────────────────────────────────────────────────────

function filteredReadings(all) {
  if (exportPeriod === 'all') return all;
  if (exportPeriod === 'custom') {
    const from = document.getElementById('f-from')?.value;
    const to   = document.getElementById('f-to')?.value;
    return all.filter(r => (!from || r.date >= from) && (!to || r.date <= to));
  }
  const cut = new Date();
  cut.setDate(cut.getDate() - parseInt(exportPeriod));
  const cutStr = cut.toISOString().slice(0, 10);
  return all.filter(r => r.date >= cutStr);
}

async function generatePDF(allReadings) {
  const readings = filteredReadings(allReadings);
  if (readings.length === 0) { toast('Aucune lecture pour cette période'); return; }

  const p = loadPatient();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const M = 12;

  // Titre
  doc.setFont('helvetica', 'bold').setFontSize(13);
  doc.text('SUIVI DE TENSION ARTÉRIELLE À DOMICILE', W / 2, 16, { align: 'center' });

  // En-tête patient
  doc.setFontSize(8.5);
  let y = 25;
  const left = [
    ['Nom :', p.nom],
    ['Date de naissance :', p.ddn],
    ['N.A.M. :', p.nam + (p.expNam ? '   Exp. : ' + p.expNam : '')],
    ['# Dossier :', p.dossier],
    ['Sexe :', p.sexe],
  ];
  const right = [
    ['Médecin :', p.medecin],
    ['Adresse :', [p.adresse, p.ville, p.codePostal].filter(Boolean).join(', ')],
    ['Cell. :', p.cell],
    ['Tél. (M) :', p.telM],
    ['Tél. (T) :', p.telT],
    ['Courriel :', p.courriel],
  ];
  left.forEach(([lbl, val]) => {
    doc.setFont('helvetica', 'bold').text(lbl, M, y);
    doc.setFont('helvetica', 'normal').text(val || '—', M + 40, y);
    y += 5.5;
  });
  y = 25;
  right.forEach(([lbl, val]) => {
    doc.setFont('helvetica', 'bold').text(lbl, W / 2 + 4, y);
    doc.setFont('helvetica', 'normal').text((val || '—').trim(), W / 2 + 30, y);
    y += 5.5;
  });
  y = 62;

  if (p.medicaments) {
    doc.setFont('helvetica', 'bold').text('Médicaments :', M, y);
    doc.setFont('helvetica', 'normal').text(p.medicaments, M + 32, y);
    y += 6;
  }
  doc.setFont('helvetica', 'bold').text('Cible visée : 130/80 mmHg', M, y);
  y += 8;

  // Tableau
  const colorMap = { green: [220, 252, 231], yellow: [254, 243, 199], red: [254, 226, 226] };

  doc.autoTable({
    startY: y,
    head: [['Date', 'Heure', 'SYS (mmHg)', 'DIA (mmHg)', 'Pouls (batt./min)', 'État', 'Médicaments']],
    body: readings.map(r => [fmtDate(r.date), r.heure, r.sys, r.dia, r.pouls, r.etat || '', r.medicaments || '']),
    margin: { left: M, right: M },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold', fontSize: 8.5, halign: 'center' },
    bodyStyles: { fontSize: 8.5, halign: 'center' },
    columnStyles: { 5: { halign: 'left' }, 6: { halign: 'left' } },
    willDrawCell(data) {
      if (data.section !== 'body') return;
      const r = readings[data.row.index];
      if (!r) return;
      const [R, G, B] = colorMap[colorClass(r.sys, r.dia)];
      doc.setFillColor(R, G, B);
    },
    didDrawPage(data) {
      const n = doc.internal.getNumberOfPages();
      doc.setFontSize(7.5).setFont('helvetica', 'normal');
      doc.text(
        `Page ${data.pageNumber} / ${n}   —   Généré le ${new Date().toLocaleDateString('fr-CA')}`,
        W / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' },
      );
    },
  });

  const blob = doc.output('blob');
  const name = `tension_${easternNow().date}.pdf`;
  const file = new File([blob], name, { type: 'application/pdf' });

  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Suivi de tension artérielle' }); }
    catch (e) { if (e.name !== 'AbortError') toast('Partage annulé'); }
  } else {
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: name }).click();
    URL.revokeObjectURL(url);
    toast('PDF téléchargé');
  }
}

// ── Initialisation ────────────────────────────────────────────────────────────

document.querySelectorAll('.nav-btn').forEach(b =>
  b.addEventListener('click', () => navigate(b.dataset.page)));

const firstLaunch = !loadApiKey() && loadReadings().length === 0;
navigate(firstLaunch ? 'settings' : 'home');
