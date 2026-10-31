/* Part of Brian, a private planner. This file is a sample from the job corner and does not run on its own. */
(function(){
"use strict";

const KINDS = ['learn', 'article', 'media', 'note', 'fact'];
const LATER_DAYS = 3;                       /* "Not now" brings it back after this many days */
const KIND_WORD = { learn: 'To learn', article: 'Read later', media: 'Watch or listen', note: 'Note', fact: 'Fact' };
const NOT_SHARED = ['device', 'never'];

const escH = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const jsS = v => escH(String(v == null ? '' : v).replace(/[\\'\r\n\u2028\u2029]/g, c =>
  ({ '\\': '\\\\', "'": "\\'", '\r': '\\r', '\n': '\\n', '\u2028': '\\u2028', '\u2029': '\\u2029' }[c])));
const DAY = /^\d{4}-\d{2}-\d{2}$/;
function addDays(day, n){
  const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ---------- pure parts ---------- */

const isMoney = i => typeof isMoneyItem !== 'function' || isMoneyItem(i);
const personal = i => typeof isPersonalNote !== 'function' || isPersonalNote(i);
/* rules is { isHealthRecord, isWorkRecord } from the app; without them nothing is offered */
function offerable(i, rules){
  if (!i || !i.id || !rules || typeof rules.isHealthRecord !== 'function' || typeof rules.isWorkRecord !== 'function') return false;
  if (!(KINDS.includes(i.kind) || i.ai_card)) return false;
  if (i.status === 'done' || i.status === 'unclear' || i.kind === 'transcript') return false;
  if (NOT_SHARED.includes(i.privacy)) return false;
  if (i.prompt_kind) return false;
  /* a note or fact about the flat or about someone is not a thing to learn */
  if ((i.kind === 'note' || i.kind === 'fact') && personal(i)) return false;
  if (isMoney(i)) return false;
  return !rules.isHealthRecord(i) && !rules.isWorkRecord(i);
}
function stateOf(settings, today){
  const s = (settings || {}).learnDose || {};
  return {
    day: DAY.test(s.day || '') ? s.day : null,
    id: typeof s.id === 'string' ? s.id : null,
    done: s.done === true && s.day === today,
    seen: s.seen && typeof s.seen === 'object' ? s.seen : {},
    later: s.later && typeof s.later === 'object' ? s.later : {},
  };
}
/* the day he last looked at it: tapped Done here, or else the day it was last changed or saved */
function lastLook(i, st){
  const seen = st.seen[i.id];
  if (DAY.test(seen || '')) return seen;
  return String(i.updated || i.created || '').slice(0, 10) || '0000-00-00';
}
/* today's item, or null: none on a day he tapped Done, none when nothing is offerable */
function pick(settings, items, today, rules){
  const st = stateOf(settings, today);
  if (st.day === today && st.done) return null;
  const resting = id => DAY.test(st.later[id] || '') && st.later[id] > today;
  const ok = (items || []).filter(i => offerable(i, rules) && !resting(i.id));
  if (st.day === today && st.id){
    const kept = ok.find(i => i.id === st.id);
    if (kept) return kept;
  }
  /* on the same day, one this row never offered comes before one he already did here */
  const doneHere = i => Object.prototype.hasOwnProperty.call(st.seen, i.id) ? 1 : 0;
  ok.sort((a, b) => lastLook(a, st).localeCompare(lastLook(b, st)) || doneHere(a) - doneHere(b)
    || String(a.created || '').localeCompare(String(b.created || '')) || String(a.id).localeCompare(String(b.id)));
  return ok[0] || null;
}
/* the answers, as new settings: Done rests the row until tomorrow, Not now puts the item aside */
function answer(settings, items, today, rules, how, shownId){
  const st = stateOf(settings, today);
  const it = pick(settings, items, today, rules);
  /* the row on screen may be older than the planner (the item was deleted or finished since):
     then the tap answers nothing, rather than marking another item */
  if (shownId !== undefined && (!it || it.id !== shownId)) return (settings || {}).learnDose || null;
  const live = new Set((items || []).map(i => i && i.id));
  const seen = {}, later = {};
  for (const k of Object.keys(st.seen)) if (live.has(k)) seen[k] = st.seen[k];
  for (const k of Object.keys(st.later)) if (live.has(k) && st.later[k] > today) later[k] = st.later[k];
  if (!it) return { day: today, id: null, done: how === 'done', seen, later };
  if (how === 'done'){ seen[it.id] = today; return { day: today, id: it.id, done: true, seen, later }; }
  later[it.id] = addDays(today, LATER_DAYS);
  return { day: today, id: null, done: false, seen, later };
}


/* the same five small steps for every gap, done in this order; "it" is the gap, named above the step */
const STEPS = [
  'Find one free introduction to it, such as a short video or article, and save it',
  'Spend 20 minutes with that introduction',
  'Try one small exercise with it',
  'Write down three things you now know about it',
  'Use it once on a real example',
];
const PLAN_TITLE = 'Learn: ', PLAN_SOURCE = 'from the learning plan';
/* a learning task the Learning plan made (index.html, makeLearnTask), not yet ticked off */
const isGap = i => !!i && typeof i.id === 'string' && !!i.id && i.kind === 'task' && i.status !== 'done' && !i.deleted
  && String(i.title || '').startsWith(PLAN_TITLE) && String(i.source_text || '').startsWith(PLAN_SOURCE);
const gapName = i => String(i.title || '').slice(PLAN_TITLE.length).trim();
function stepState(settings, today){
  const s = (settings || {}).learnSteps || {};
  const steps = {};
  if (s.steps && typeof s.steps === 'object') for (const k of Object.keys(s.steps)){
    const n = Number(s.steps[k]);
    if (Number.isInteger(n) && n > 0) steps[k] = Math.min(n, STEPS.length);
  }
  const day = DAY.test(s.day || '') ? s.day : null;
  return { day, id: typeof s.id === 'string' ? s.id : null,
    done: day === today && s.done === true, skipped: day === today && s.skipped === true, steps };
}
const stepsDone = (st, id) => st.steps[id] || 0;
/* today's step, or null: { item, step (1 to 5), done (ticked today) }; none on a day he said Not today */
function pickStep(settings, items, today){
  const st = stepState(settings, today);
  if (st.skipped) return null;
  const all = (items || []).filter(isGap);
  if (st.day === today && st.id){
    const kept = all.find(i => i.id === st.id);
    if (kept && st.done) return { item: kept, step: stepsDone(st, kept.id), done: true };
    if (kept && stepsDone(st, kept.id) < STEPS.length) return { item: kept, step: stepsDone(st, kept.id) + 1, done: false };
  }
  if (st.done) return null;
  const open = all.filter(i => stepsDone(st, i.id) < STEPS.length);
  /* the soonest target month first, then the one already under way, then the oldest task */
  const due = i => DAY.test(String(i.deadline || '').slice(0, 10)) ? String(i.deadline).slice(0, 10) : '9999-12-31';
  open.sort((a, b) => due(a).localeCompare(due(b)) || stepsDone(st, b.id) - stepsDone(st, a.id)
    || String(a.created || '').localeCompare(String(b.created || '')) || String(a.id).localeCompare(String(b.id)));
  const it = open[0];
  return it ? { item: it, step: stepsDone(st, it.id) + 1, done: false } : null;
}
/* the answers, as the new settings.learnSteps: Did it counts the step and rests the row until
   tomorrow, Not today rests it without counting anything */
function answerStep(settings, items, today, how, shownId){
  const prev = (settings || {}).learnSteps || null;
  const now = pickStep(settings, items, today);
  /* a row older than the planner (the task was ticked off or deleted since) answers nothing */
  if (!now || now.done || (shownId !== undefined && now.item.id !== shownId)) return prev;
  const st = stepState(settings, today);
  /* a task in the bin keeps its count, so it comes back with its progress if he restores it */
  const bin = typeof db === 'object' && db && Array.isArray(db.trash) ? db.trash : [];
  const live = new Set([].concat(items || [], bin).map(i => i && i.id));
  const steps = {};
  for (const k of Object.keys(st.steps)) if (live.has(k)) steps[k] = st.steps[k];
  if (how === 'did'){ steps[now.item.id] = now.step; return { day: today, id: now.item.id, done: true, skipped: false, steps }; }
  return { day: today, id: null, done: false, skipped: true, steps };
}
/* how far one learning task is: { done, of, next } where next is the next step's words, or null */
function progress(settings, item){
  const st = stepState(settings, null);
  const n = item ? stepsDone(st, item.id) : 0;
  return { done: n, of: STEPS.length, next: n < STEPS.length ? STEPS[n] : null };
}

/* ---------- the app ---------- */

const appToday = () => typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10);
function appRules(){
  return {
    isHealthRecord: typeof isHealthRecord === 'function' ? isHealthRecord : null,
    isWorkRecord: typeof isWorkRecord === 'function' ? isWorkRecord : null,
  };
}
function appReady(){
  try { return typeof db === 'object' && db && Array.isArray(db.items) && !!db.settings; } catch(e){ return false; }
}
function firstLink(it){
  const m = String((it.source_text || '') + ' ' + (it.title || '') + ' ' + (it.url || '')).match(/https?:\/\/[^\s<>"')]+/i);
  return m ? m[0] : null;
}
function summary(it){
  const lines = String(it.notes || '').split('\n').map(s => s.trim()).filter(s => s && !/^(TYPE|WHAT|HOW|SECURITY|HONEST|FITS|---)/i.test(s));
  return (lines[0] || '').replace(/^SUMMARY:\s*/i, '').slice(0, 110);
}
function rowHTML(it){
  const src = firstLink(it);
  const badge = src ? (/instagram/i.test(src) ? 'Instagram' : (/youtu/i.test(src) ? 'YouTube' : 'Link')) : null;
  const sum = summary(it);
  const kind = it.ai_card ? 'AI tool card' : (KIND_WORD[it.kind] || 'Saved');
  return `<div class="card learn-dose" data-today="learn"><div class="row">
    <div class="hit44" style="flex:1;cursor:pointer" onclick="openEdit('${jsS(it.id)}')">
      <div class="t">${escH(it.title)}</div>
      <div class="s">${escH(kind)}${sum ? ' · ' + escH(sum) : ''}</div>
    </div>
    ${badge ? `<a class="tap44" href="${escH(src)}" target="_blank" rel="noopener">${badge} ↗</a>` : ''}
  </div>
  <div class="qa-row" style="margin-top:6px">
    <button class="small primary" onclick="BrianLearnDose.done('${jsS(it.id)}')">Seen it</button>
    <button class="small" onclick="BrianLearnDose.notNow('${jsS(it.id)}')">Not now</button>
  </div></div>`;
}
const dots = (n, of) => `<span role="img" aria-label="${n} of ${of} steps done">${'●'.repeat(n)}${'○'.repeat(of - n)}</span>`;
function tipOf(it){
  return String(it.notes || '').split('\n').map(x => x.trim()).filter(Boolean)[0] || '';
}
function stepHTML(p){
  const it = p.item, name = gapName(it), of = STEPS.length;
  if (p.done) return `<div class="card learn-step" data-today="learn-step"><div class="row">
    <div class="hit44" style="flex:1;cursor:pointer" onclick="openEdit('${jsS(it.id)}')">
      <div class="t">✓ Today's study step is done</div>
      <div class="s">${escH(name)} · ${dots(p.step, of)} ${p.step} of ${of} steps</div>
      <div class="s">${p.step < of ? 'The next step comes tomorrow.' : 'All ' + of + ' steps are done. Tick the task off when you feel ready.'}</div>
    </div></div></div>`;
  const tip = tipOf(it).slice(0, 110);
  return `<div class="card learn-step" data-today="learn-step"><div class="row">
    <div class="hit44" style="flex:1;cursor:pointer" onclick="openEdit('${jsS(it.id)}')">
      <div class="t">${escH(STEPS[p.step - 1])}</div>
      <div class="s">From your learning plan: ${escH(name)} · step ${p.step} of ${of}</div>
      ${tip ? `<div class="s">Tip from your job match: ${escH(tip)}</div>` : ''}
    </div></div>
  <div class="qa-row" style="margin-top:6px">
    <button class="small primary" onclick="BrianLearnDose.stepDid('${jsS(it.id)}')">✓ Did it</button>
    <button class="small" onclick="BrianLearnDose.stepSkip('${jsS(it.id)}')">Not today</button>
  </div></div>`;
}
function todayStepHTML(t){
  const p = pickStep(db.settings, db.items, t);
  const s = db.settings.learnSteps || {};
  /* the day's step is remembered like the row below, so it holds while he opens and edits things */
  if (p && !p.done && (s.day !== t || s.id !== p.item.id)) db.settings.learnSteps = Object.assign({}, s, { day: t, id: p.item.id, done: false, skipped: false });
  return p ? stepHTML(p) : '';
}
function todayHTML(){
  if (!appReady()) return '';
  const t = appToday(), it = pick(db.settings, db.items, t, appRules());
  /* the day's choice is remembered, so the row does not change when he opens or edits an item; it is
     kept with the next save, and until then the same choice is worked out again the same way */
  const s = db.settings.learnDose || {};
  if (it && (s.day !== t || s.id !== it.id)) db.settings.learnDose = Object.assign({}, s, { day: t, id: it.id, done: false });
  const step = todayStepHTML(t), row = it ? rowHTML(it) : '';
  return step || row ? '<div class="section-label">Learn something today</div>' + step + row : '';
}
/* the line under a gap in the Learning plan, for its learning task; empty when the task is gone */
function planHTML(id){
  if (!appReady()) return '';
  const it = db.items.find(i => i && i.id === id);
  if (!it) return '';
  const p = progress(db.settings, it);
  let words;
  if (it.status === 'done') words = 'The learning task is ticked off.';
  else if (p.done >= p.of) words = 'All ' + p.of + ' daily steps are done. Tick the task off when you feel ready.';
  else words = (p.done ? p.done + ' of ' + p.of + ' daily steps done. ' : 'No daily step done yet. ')
    + (isGap(it) ? 'Next on Today: ' + p.next + '.' : '');
  return `<div class="s learn-progress" style="margin-top:4px">${dots(Math.min(p.done, p.of), p.of)} ${escH(words)}</div>`;
}
function stepAct(how, id){
  if (!appReady()) return;
  const next = answerStep(db.settings, db.items, appToday(), how, String(id));
  if (next === (db.settings.learnSteps || null) || !next){ if (typeof render === 'function') render(); return; }
  db.settings.learnSteps = next;
  if (typeof save === 'function') save();
  if (typeof render === 'function') render();
  const last = how === 'did' && next.steps[next.id] >= STEPS.length;
  if (typeof toast === 'function') toast(how !== 'did' ? 'No study step today. The next one comes tomorrow.'
    : last ? 'All ' + STEPS.length + ' steps are done. Tick the task off when you feel ready.' : 'Step done. The next one comes tomorrow.');
}
function act(how, id){
  if (!appReady()) return;
  const next = answer(db.settings, db.items, appToday(), appRules(), how, String(id));
  if (next === db.settings.learnDose || !next){ if (typeof render === 'function') render(); return; }
  db.settings.learnDose = next;
  if (typeof save === 'function') save();
  if (typeof render === 'function') render();
  if (typeof toast === 'function') toast(how === 'done' ? 'Seen it. The next one comes tomorrow.' : 'Put aside for ' + LATER_DAYS + ' days.');
}

window.BrianLearnDose = Object.freeze({
  KINDS, LATER_DAYS, STEPS,
  /* pure */
  offerable, pick, answer, isGap, pickStep, answerStep, progress,
  /* the app */
  todayHTML, planHTML, done: id => act('done', id), notNow: id => act('later', id),
  stepDid: id => stepAct('did', id), stepSkip: id => stepAct('skip', id),
});
})();
