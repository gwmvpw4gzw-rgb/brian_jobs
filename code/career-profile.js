/* Part of Brian, a private planner. This file is a sample from the job corner and does not run on its own. */
(function(){
"use strict";

const MAX_TEXT = 1000, MAX_NOTE = 500, MAX_NOTES = 200;
const escH = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const jsq = v => String(v == null ? '' : v).replace(/[^A-Za-z0-9_-]/g, '');
const clip = (s, n) => String(s == null ? '' : s).replace(/\r/g, '').trim().slice(0, n);

function settings(){ try { if (typeof db === 'undefined' || !db) return null; if (!db.profile || typeof db.profile !== 'object') db.profile = {}; return db.profile; } catch(e){ return null; } }
/* the stored part, with its defaults; never throws */
const TEXTS = ['summary', 'next', 'year1', 'year3'];
const str = v => typeof v === 'string' ? v : '';
function stateOf(s){
  const c = (s && s.career && typeof s.career === 'object') ? s.career : {};
  return { summary: str(c.summary), next: str(c.next), year1: str(c.year1), year3: str(c.year3),
    notes: Array.isArray(c.notes) ? c.notes.filter(n => n && typeof n.t === 'string' && n.id) : [],
    learned: Array.isArray(c.learned) ? c.learned.filter(r => r && typeof r === 'object') : [] };
}
function store(){
  const s = settings(); if (!s) return null;
  const c = stateOf(s);
  const had = s.career && typeof s.career === 'object' ? s.career : {};
  s.career = { ...had, summary: c.summary, next: c.next, year1: c.year1, year3: c.year3, notes: c.notes.slice(), learned: c.learned.slice() };
  /* the profile is merged as one record by its stamp, so a change here must carry a new one */
  s._u = new Date().toISOString();
  return s.career;
}
function done(msg){ if (typeof save === 'function') save(); if (typeof render === 'function') render(); if (msg && typeof toast === 'function') toast(msg); }

const ON_PHONE = 'What you write here syncs between your phone and your computer through your own Brian server, and is in your backup file without a lock, so keep that file somewhere private. It never goes to the Building area.';
const RECORDS_KEPT = 'The jobs, skills and certifications listed below sync the same way.';
const GOALS_GO = 'The two goals are the one part of this profile that the AI sees, and only when you ask it to match a job ad or to find jobs for you, so that it can say how a job fits them. The search may use their words.';
let draftNote = '', keepTimer = null;
const typing = {};   /* the profile's words typed and not yet kept, so a redraw or Back in the next moment loses nothing */

/* ---------- the Career profile screen ---------- */
function profileView(){
  try {
    const st = stateOf(settings());
    /* the app's own readers of Work & career (index.html, pieces 2.8 and 5.5) */
    const cur = typeof currentJob === 'function' ? currentJob() : null;
    const past = (typeof pastJobs === 'function' ? pastJobs() : null) || [];
    const skills = (typeof allSkills === 'function' ? allSkills() : null) || [];
    const certs = (typeof allCerts === 'function' ? allCerts() : null) || [];
    const years = j => typeof jobYears === 'function' ? jobYears(j) : '';
    const level = n => typeof levelLabel === 'function' ? levelLabel(n) : '';
    const link = (k, label) => `<button class="small" onclick="openLens('${k}','profile')">${label}</button>`;
    let h = `<div class="s" style="margin:8px 0">${ON_PHONE} ${RECORDS_KEPT}</div>`;
    h += `<div class="section-label">In your own words</div>`
      + `<textarea id="cp_summary" aria-label="In your own words" oninput="BrianCareer.keep(false, 'summary', this.value)" style="min-height:70px" maxlength="${MAX_TEXT}" placeholder="Who you are at work, in a few sentences">${escH('summary' in typing ? typing.summary : st.summary)}</textarea>`;
    h += `<div class="section-label">Now</div>`;
    h += cur ? `<div class="card" style="cursor:pointer" onclick="openLens('myjob','profile')"><div class="t">${escH(cur.job_role || cur.title)}</div>`
        + `<div class="s">${[escH(cur.job_company || ''), escH(years(cur) || '')].filter(Boolean).join(' — ')}</div></div>`
      : `<div class="empty">No current job yet</div><div class="qa-row">${link('myjob', 'Add it in My job')}</div>`;
    h += `<div class="section-label">Before (${past.length})</div>`;
    h += past.length ? past.map(j => `<div class="card" style="padding:7px 10px"><div class="t" style="font-size:var(--fs-2)">${escH(j.job_role || j.title)}</div>`
        + `<div class="s">${[escH(j.job_company || ''), escH(years(j) || '')].filter(Boolean).join(' — ')}</div></div>`).join('')
      : `<div class="empty">No past jobs yet</div>`;
    h += `<div class="qa-row">${link('career', 'Career history')}</div>`;
    h += `<div class="section-label">Skills (${skills.length})</div>`;
    h += skills.length ? `<div class="s">${skills.map(s => escH(s.title) + (level(s.skill_level) ? ' (' + escH(level(s.skill_level)) + ')' : '')).join(', ')}</div>`
      : `<div class="empty">No skills yet</div>`;
    const have = certs.filter(c => c.cert_status !== 'want'), want = certs.filter(c => c.cert_status === 'want');
    h += `<div class="section-label">Certificates (${have.length})</div>`;
    h += have.length ? `<div class="s">${have.map(c => escH(c.title)).join(', ')}</div>` : `<div class="empty">No certificates yet</div>`;
    if (want.length) h += `<div class="s" style="margin-top:4px">Wanted: ${want.map(c => escH(c.title)).join(', ')}</div>`;
    h += `<div class="qa-row">${link('skills', 'Skills & certifications')}</div>`;
    h += `<div class="section-label">What you want next</div>`
      + `<textarea id="cp_next" aria-label="What you want next" oninput="BrianCareer.keep(false, 'next', this.value)" style="min-height:60px" maxlength="${MAX_TEXT}" placeholder="The next role, a skill to learn, a change you want">${escH('next' in typing ? typing.next : st.next)}</textarea>`;
    h += `<div class="section-label">Where I want to be in one year</div>`
      + `<textarea id="cp_year1" aria-label="Where I want to be in one year" oninput="BrianCareer.keep(false, 'year1', this.value)" style="min-height:56px" maxlength="${MAX_TEXT}" placeholder="The role, the work or the skill you want a year from now">${escH('year1' in typing ? typing.year1 : st.year1)}</textarea>`;
    h += `<div class="section-label">Where I want to be in three years</div>`
      + `<textarea id="cp_year3" aria-label="Where I want to be in three years" oninput="BrianCareer.keep(false, 'year3', this.value)" style="min-height:56px" maxlength="${MAX_TEXT}" placeholder="Where you want your work to have taken you in three years">${escH('year3' in typing ? typing.year3 : st.year3)}</textarea>`;
    h += `<div class="s" style="margin-top:4px">${GOALS_GO}</div>`;
    h += `<div class="qa-row" style="margin-top:6px"><button class="small primary" onclick="BrianCareer.saveProfile()">Save</button>`
      + `<button class="small" onclick="openLens('learnplan','profile')">Learning plan</button></div>`;
    if (typeof cvReaderButtonHTML === 'function') h += cvReaderButtonHTML();
    return h;
  } catch(e){ return `<div class="empty">The career profile could not be shown just now. Go back and open it again.</div>`; }
}
function readTexts(c){
  const v = id => { try { const el = document.getElementById(id); return el ? el.value : null; } catch(e){ return null; } };
  const a = v('cp_summary'), b = v('cp_next'), y1 = v('cp_year1'), y3 = v('cp_year3');
  if (a !== null) c.summary = clip(a, MAX_TEXT);
  if (b !== null) c.next = clip(b, MAX_TEXT);
  if (y1 !== null) c.year1 = clip(y1, MAX_TEXT);
  if (y3 !== null) c.year3 = clip(y3, MAX_TEXT);
}
function saveProfile(){
  const c = store(); if (!c) return;
  if (keepTimer) { clearTimeout(keepTimer); keepTimer = null; }
  for (const k of TEXTS) delete typing[k];
  readTexts(c);
  done('Career profile saved');
}
/* while he types: kept a moment after he stops, with no redraw, so the screen never jumps */
function keep(now, field, value){
  if (TEXTS.includes(field)) typing[field] = String(value == null ? '' : value);
  if (keepTimer) { clearTimeout(keepTimer); keepTimer = null; }
  const run = () => { keepTimer = null; const c = store(); if (!c) return;
    if (!TEXTS.some(k => k in typing)) readTexts(c);
    for (const k of TEXTS) if (k in typing) { c[k] = clip(typing[k], MAX_TEXT); delete typing[k]; }
    if (typeof save === 'function') save(); };
  if (now) run(); else keepTimer = setTimeout(run, 600);
}

/* ---------- the Work brainstorm screen ---------- */
function brainstormView(){
  try {
    const st = stateOf(settings());
    let h = `<div class="s" style="margin:8px 0">Ideas about work, one note at a time. Keep names of people and companies out. ${ON_PHONE}</div>`;
    h += `<textarea id="bs_new" aria-label="New brainstorm note" oninput="BrianCareer.keepNote(this.value)" style="min-height:56px" maxlength="${MAX_NOTE}" placeholder="An idea, a question, a next step">${escH(draftNote)}</textarea>`
      + `<div class="qa-row" style="margin-top:4px"><button class="small primary" onclick="BrianCareer.addNote()">Add note</button></div>`;
    const notes = st.notes.slice().sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    h += `<div class="section-label">Notes (${notes.length})</div>`;
    h += notes.length ? notes.map(n => `<div class="card brainstorm-note"><div class="row"><div style="flex:1;white-space:pre-wrap">${escH(n.t)}</div>`
        + `<button class="small ghost" aria-label="Delete this note" onclick="BrianCareer.deleteNote('${jsq(n.id)}', this)">✕</button></div></div>`).join('')
      : `<div class="empty">No notes yet</div>`;
    return h;
  } catch(e){ return `<div class="empty">The brainstorm could not be shown just now. Go back and open it again.</div>`; }
}
function addNote(text){
  const c = store(); if (!c) return null;
  let t = text;
  if (t == null) { try { const el = document.getElementById('bs_new'); t = el ? el.value : ''; } catch(e){ t = ''; } }
  t = clip(t, MAX_NOTE);
  if (!t) { if (typeof toast === 'function') toast('Type the note first'); return null; }
  if (c.notes.length >= MAX_NOTES) { if (typeof toast === 'function') toast('The brainstorm holds ' + MAX_NOTES + ' notes; delete one first'); return null; }
  draftNote = '';
  const n = { id: 'bs' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), t, at: new Date().toISOString() };
  c.notes.push(n);
  done('Note kept');
  return n;
}
/* a first tap arms the button, a second tap deletes, as elsewhere in Brian */
function deleteNote(id, btn){
  if (btn && !btn.dataset.armed){
    btn.dataset.armed = '1'; btn.textContent = 'Delete?';
    try { btn.setAttribute('aria-label', 'Tap again to delete this note'); } catch(e){}
    setTimeout(() => { try { if (btn.isConnected){ btn.dataset.armed = ''; btn.textContent = '✕'; btn.setAttribute('aria-label', 'Delete this note'); } } catch(e){} }, 3000);
    return false;
  }
  const c = store(); if (!c) return false;
  const before = c.notes.length;
  c.notes = c.notes.filter(n => jsq(n.id) !== jsq(id));
  if (c.notes.length !== before) done('Note deleted');
  return c.notes.length !== before;
}

/* the words of a note not yet added, kept in memory only, so a redraw does not lose them */
function keepNote(v){ draftNote = String(v == null ? '' : v).slice(0, MAX_NOTE); }

window.BrianCareer = Object.freeze({ MAX_TEXT, MAX_NOTE, MAX_NOTES, stateOf, store, profileView, saveProfile, keep, brainstormView, addNote, keepNote, deleteNote });
})();
