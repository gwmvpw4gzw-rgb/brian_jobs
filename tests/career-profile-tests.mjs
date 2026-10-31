/* A test suite from Brian, a private planner. It opens the real app with made-up data and does not run from this repository. */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { loadApp } from './app-sandbox.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(root, 'career-profile.js'), 'utf8');
const HTML = readFileSync(join(root, 'index.html'), 'utf8');
const tmp = mkdtempSync(join(tmpdir(), 'career-profile-tests-'));
let opened = 0;

const SUMMARY = 'Made-up summary: a careful generalist who likes tidy spreadsheets';
const NEXT = 'Made-up wish: lead a small team within two years';
const NOTE = 'Made-up brainstorm note about a quieter weekly meeting format';

function seedPlanner() {
  const html = readFileSync(join(root, 'sample-data', 'seed.html'), 'utf8');
  const start = html.indexOf('<script>\n(function');
  const code = html.slice(start + 8, html.lastIndexOf('</script>'));
  const store = {};
  const page = vm.createContext({
    location: { hostname: '127.0.0.1', search: '?providers=1', replace(){} },
    window: {}, document: { getElementById: () => ({}) },
    localStorage: { clear(){ for (const k in store) delete store[k]; },
      setItem(k, v){ store[k] = String(v); }, getItem: k => (k in store ? store[k] : null) },
    indexedDB: { deleteDatabase: nm => (nm === 'brian-planner' ? { set onsuccess(f){ f(); } } : {}) },
  });
  vm.runInContext(code, page);
  if (!store['planner.v1']) throw new Error('the seed page wrote no planner; did seed.html change shape?');
  return store;
}
function withoutSeedWork(store) {
  const planner = JSON.parse(store['planner.v1']);
  planner.items = planner.items.filter(i => !['job', 'duty', 'skill', 'cert', 'jobad'].includes(i.kind) && !i.pipeline_status);
  store['planner.v1'] = JSON.stringify(planner);
  return store;
}
const SEED = withoutSeedWork(seedPlanner());
/* A broken copy of the jobs corner that sends something leaves a refused request behind that nobody
   waits for. Since the jobs corner's checks (job HAV) wait on real work, such as the PIN lock's key,
   Node would stop the whole suite on it, and the checks count every request themselves. So a refused
   request is only noted while a broken copy of the jobs corner runs (see the breaks at the end), and
   everywhere else, on the good copy above all, an unhandled refusal still stops the suite. */
const quietRefusal = () => {};
const now = new Date().toISOString();
const WORK = [
  { id: 'cp-j1', title: 'Made-up analyst at Example Works', kind: 'job', type: 'library', area: 'work', job_role: 'Made-up analyst', job_company: 'Example Works', job_start: '2021-03-01' },
  { id: 'cp-j2', title: 'Made-up clerk at Old Example Shop', kind: 'job', type: 'library', area: 'work', job_role: 'Made-up clerk', job_company: 'Old Example Shop', job_start: '2015-01-01', job_end: '2020-12-31' },
  { id: 'cp-s1', title: 'Made-up spreadsheet modelling', kind: 'skill', type: 'library', area: 'work', skill_type: 'tool', skill_level: 3 },
  { id: 'cp-c1', title: 'Made-up first-aid certificate', kind: 'cert', type: 'library', area: 'work', cert_status: 'have' },
  { id: 'cp-c2', title: 'Made-up project certificate', kind: 'cert', type: 'library', area: 'work', cert_status: 'want' },
].map(o => Object.assign({ status: 'open', created: now, updated: now, notes: null, attachments: [] }, o));

function open(source, html, withWork = true) {
  let path = null;
  if (html) { path = join(tmp, 'index-' + (++opened) + '.html'); writeFileSync(path, html); }
  const app = loadApp(path, { dom: true, seed: JSON.parse(JSON.stringify(SEED)),
    location: { hostname: '127.0.0.1', protocol: 'http:', origin: 'http://127.0.0.1:8765', href: 'http://127.0.0.1:8765/' } });
  for (const k of Object.keys(app.__store)) if (/^[A-Z]+$/.test(k)) app.localStorage[k] = app.__store[k];
  vm.runInContext(`bindLabels = enterDialog = exitDialog = function(){}; window.scrollTo = window.scrollTo || function(){};`, app);
  app.__fetches = 0;
  const realFetch = app.fetch;
  /* a refused request is marked as seen, so that a broken copy which never waits for its request cannot stop
     the run: since B143 a backup waits on real crypto, and a refusal left unwatched would end the process */
  app.fetch = (...a) => { app.__fetches++; const p = realFetch ? realFetch(...a) : Promise.reject(new Error('no network'));
    if (p && typeof p.catch === 'function') p.catch(() => {}); return p; };
  if (source !== null) vm.runInContext(source, app, { filename: 'career-profile.js' });
  vm.runInContext(`if (typeof noteServerWork === 'function') noteServerWork({ ok: true, work: 1 });`, app);
  const db = app.__b.getDb();
  db.profile = db.profile || {};
  if (withWork) db.items.push(...WORK.map(o => Object.assign({}, o)));
  return { app, db, C: app.BrianCareer, html: html || HTML, source: source || '' };
}
const text = h => ' ' + h.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ') + ' ';
function screen(o, allFilter) {
  vm.runInContext(`current = 'all'; allFilter = ${JSON.stringify(allFilter)}; areaTopic = null;`, o.app);
  o.app.render();
  const html = o.app.__dom.get('main').innerHTML;
  return { html, text: text(html) };
}
const el = (o, id) => o.app.document.getElementById(id);
/* fills the profile and the brainstorm the way he does, on the screens */
function fill(o) {
  screen(o, 'profile');
  el(o, 'cp_summary').value = SUMMARY; el(o, 'cp_next').value = NEXT;
  o.C.saveProfile();
  screen(o, 'brainstorm');
  el(o, 'bs_new').value = NOTE;
  o.C.addNote();
}
const words = [SUMMARY, NEXT, NOTE, 'quieter weekly meeting', 'tidy spreadsheets', 'lead a small team'];
const leaks = s => words.filter(w => s.includes(w));

const CHECKS = [
  ['CP-1', 'Work & career offers the Career profile and the Work brainstorm, after its other screens', o => {
    const t = screen(o, 'area:work').text;
    const at = ['My job', 'Applications', 'Career profile', 'Work brainstorm'].map(x => t.indexOf(' ' + x + ' '));
    return at.every((n, k) => n > 0 && (k === 0 || n > at[k - 1])) ? true : at.join(',');
  }],
  ['CP-2', 'the profile shows its sections in order, with the job, the past job, the skill and both kinds of certificate', o => {
    const t = screen(o, 'profile').text;
    const parts = [' In your own words ', ' Now Made-up analyst Example Works', ' Before (1) Made-up clerk Old Example Shop',
      ' Skills (1) Made-up spreadsheet modelling', ' Certificates (1) Made-up first-aid certificate Wanted: Made-up project certificate', ' What you want next '];
    const at = parts.map(x => t.indexOf(x));
    return at.every((n, k) => n > 0 && (k === 0 || n > at[k - 1])) ? true : at.join(',') + ' | ' + t.slice(0, 400);
  }],
  ['CP-3', 'with no work records, each section says so in a line', o => {
    o.db.items = o.db.items.filter(i => !String(i.id).startsWith('cp-'));
    const t = screen(o, 'profile').text;
    return ['No current job yet', 'No past jobs yet', 'No skills yet', 'No certificates yet'].every(x => t.includes(x)) ? true : t.slice(0, 400);
  }],
  ['CP-4', 'the two texts are saved in his profile, cut to 1000 characters, and shown again', o => {
    screen(o, 'profile');
    el(o, 'cp_summary').value = '  ' + SUMMARY + ' ' + 'x'.repeat(1200); el(o, 'cp_next').value = NEXT;
    o.C.saveProfile();
    const c = o.db.profile.career;
    const t = screen(o, 'profile').html;
    return c.summary.length === 1000 && c.summary.startsWith(SUMMARY) && c.next === NEXT && t.includes(NEXT) && t.includes(SUMMARY) ? true : JSON.stringify(c).slice(0, 200);
  }],
  ['CP-5', 'a brainstorm note is added, newest first, cut to 500 characters, and an empty one is refused', o => {
    screen(o, 'brainstorm');
    el(o, 'bs_new').value = 'Made-up older note'; o.C.addNote();
    el(o, 'bs_new').value = '   '; const none = o.C.addNote();
    o.db.profile.career.notes[0].at = '2026-01-01T00:00:00Z';
    el(o, 'bs_new').value = NOTE + ' ' + 'y'.repeat(700); o.C.addNote();
    const t = screen(o, 'brainstorm').text;
    const notes = o.db.profile.career.notes;
    return none === null && notes.length === 2 && notes[1].t.length === 500 && t.indexOf(NOTE) > 0 && t.indexOf(NOTE) < t.indexOf('Made-up older note')
      && t.includes(' Notes (2) ') ? true : t.slice(0, 300);
  }],
  ['CP-6', 'the brainstorm holds at most 200 notes', o => {
    for (let k = 0; k < 205; k++) o.C.addNote('Made-up note ' + k);
    return o.db.profile.career.notes.length === 200 ? true : String(o.db.profile.career.notes.length);
  }],
  ['CP-7', 'deleting a note takes two taps', o => {
    const n = o.C.addNote(NOTE);
    const btn = { dataset: {}, textContent: '✕', isConnected: true };
    const first = o.C.deleteNote(n.id, btn), kept = o.db.profile.career.notes.length === 1;
    const second = o.C.deleteNote(n.id, btn);
    return first === false && kept && second === true && o.db.profile.career.notes.length === 0 ? true : `${first} ${kept} ${second}`;
  }],
  ['CP-8', 'the profile and the notes are in what syncs between his own devices, with a new stamp on the profile', o => {
    const before = new Date(Date.now() - 1000).toISOString();
    fill(o); o.app.save();
    const sent = JSON.stringify(o.app.syncPayload(o.db));
    const missing = [SUMMARY, NEXT, NOTE].filter(w => !sent.includes(w));
    return o.db.profile.career.notes.length === 1 && !missing.length && String(o.db.profile._u || '') > before && !('careerProfile' in o.db.settings)
      ? true : 'missing ' + missing.join(', ') + ' stamp ' + o.db.profile._u;
  }],
  ['CP-9', 'nothing from the profile or the notes goes through the Building area\'s door', o => {
    fill(o);
    for (const i of o.db.items) if (!i.privacy) i.privacy = 'building';
    const out = JSON.stringify(o.app.buildingExport());
    return out.length > 50 && !leaks(out).length ? true : 'found ' + leaks(out).join(', ');
  }],
  ['CP-10', 'nothing from the profile or the notes is in the AI\'s sorting prompt or in what an AI request sends', async o => {
    fill(o);
    let sent = '';
    o.db.settings.mode = 'proxy'; o.db.settings.proxyUrl = 'http://made-up.invalid'; o.db.settings.proxyPass = 'made-up';
    o.app.fetch = (u, init) => { sent += String(u) + String((init || {}).body || ''); return Promise.reject(new Error('no network in tests')); };
    try { await o.app.aiRequestFull(o.app.sorterPrompt(), 'Made-up capture: buy milk'); } catch (e) {}
    const p = String(o.app.sorterPrompt()) + JSON.stringify(o.app.openItemsForPrompt()) + sent;
    return sent.length > 100 && !leaks(p).length ? true : 'sent ' + sent.length + ' characters, found ' + leaks(p).join(', ');
  }],
  ['CP-11', 'filling the profile and the brainstorm makes no request and adds no item', o => {
    const n = o.db.items.length;
    fill(o); screen(o, 'profile'); screen(o, 'brainstorm');
    return o.app.__fetches === 0 && o.db.items.length === n ? true : `fetches ${o.app.__fetches}, items ${o.db.items.length - n}`;
  }],
  ['CP-11b', 'career-profile.js names no way to send anything and no way to add an item', o => {
    const banned = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|postMessage|EventSource|addItem\s*\(/.exec(o.source);
    return !banned ? true : 'found ' + banned[0];
  }],
  ['CP-12', 'words in the texts and notes are written as text, never as page code', o => {
    o.C.addNote('<img src=x onerror=alert(1)>');
    o.db.profile.career.summary = '</textarea><img src=y>';
    const a = screen(o, 'brainstorm').html, b = screen(o, 'profile').html;
    return !a.includes('<img') && a.includes('&lt;img') && !b.includes('<img') ? true : 'not escaped';
  }],
  ['CP-13', 'both screens say that this syncs between his phone and his computer, is in his backup file and never goes to the Building area', o => {
    const s = 'What you write here syncs between your phone and your computer through your own Brian server, and is in your backup file without a lock, so keep that file somewhere private. It never goes to the Building area.';
    return screen(o, 'profile').text.includes(s) && screen(o, 'brainstorm').text.includes(s) ? true : 'missing';
  }],
  ['CP-13c', 'the salary field and the message after a backup say that his job hunt is in the backup file without a lock', o => {
    return o.html.includes('<label for="jb_salary">Salary</label><div class="s">It syncs to your computer and is in your backup file without a lock, like all of your job hunt.</div>')
      && o.html.includes("' in it without a lock, so keep the file somewhere private'") ? true : 'missing';
  }],
  ['CP-13b', 'the profile says that its work records sync the same way, and no screen says any of it stays on the phone only (B257, an earlier build)', o => {
    const t = screen(o, 'profile').text, b = screen(o, 'brainstorm').text, w = screen(o, 'area:work').text;
    return t.includes('The jobs, skills and certifications listed below sync the same way.') && !b.includes('listed below')
      && !/on this phone only|lost with the phone/.test(t + b + w) && w.includes('Work and career sync between your phone and your computer') ? true : t.slice(0, 300);
  }],
  ['CP-15', 'a backup file holds the profile and the notes in his profile, and keeps the rest of the settings', async o => {
    fill(o); o.app.save();
    const { packed } = await noPinBackup(o);
    const d = JSON.parse(packed || '{}');
    const c = (d.profile || {}).career || {};
    return packed.length > 1000 && d.settings && !('careerProfile' in d.settings) && c.summary === SUMMARY && (c.notes || []).length === 1 ? true : JSON.stringify(c).slice(0, 200);
  }],
  ['CP-16', 'restoring a backup brings back the profile and the notes it holds', async o => {
    fill(o);
    const backup = JSON.parse(JSON.stringify(o.db));
    o.db.profile.career = { summary: 'Made-up later words', next: '', notes: [] };
    vm.runInContext('pendingImport = ' + JSON.stringify(backup) + ';', o.app);
    await o.app.confirmImport(true);
    const c = (o.app.__b.getDb().profile || {}).career || {};
    return c.summary === SUMMARY && (c.notes || []).length === 1 ? true : JSON.stringify(c).slice(0, 200);
  }],
  ['CP-19', 'the start-up step of an earlier build moves the profile out of the settings into his synced profile once, and labels work records synced, never a health record', o => {
    o.db.settings.careerProfile = { summary: SUMMARY, next: '', year1: 'Made-up older goal', year3: '', notes: [{ id: 'n0', t: NOTE, at: now }], learned: [] };
    delete o.db.profile.career;
    for (const i of o.db.items) if (String(i.id).startsWith('cp-')) i.privacy = 'device';
    o.db.items.push({ id: 'cp-h1', title: 'Made-up health check at work', kind: 'healthrec', type: 'library', area: 'work', status: 'open', created: now, updated: now, privacy: 'device', notes: null, attachments: [] });
    if (o.db.settings.migrations) delete o.db.settings.migrations['work-syncs-1'];
    o.app.runMigrations(vm.runInContext('MIGRATIONS', o.app));
    const c = o.db.profile.career || {};
    const work = o.db.items.filter(i => String(i.id).startsWith('cp-') && i.id !== 'cp-h1');
    const health = o.db.items.find(i => i.id === 'cp-h1');
    const sent = JSON.stringify(o.app.syncPayload(o.db));
    return c.summary === SUMMARY && c.year1 === 'Made-up older goal' && !('careerProfile' in o.db.settings) && work.length === 5
      && work.every(i => i.privacy === 'synced' && sent.includes(i.title)) && health.privacy === 'device' && !sent.includes('Made-up health check')
      ? true : JSON.stringify({ c: c.summary, labels: work.map(i => i.privacy), health: health.privacy });
  }],
  ['CP-19b', 'when his other device already put a career profile into the synced profile, the step joins this phone\'s older words into it instead of dropping them', o => {
    o.db.profile.career = { summary: 'Made-up words from the computer', next: '', notes: [{ id: 'n9', t: 'Made-up computer note', at: now }] };
    o.db.settings.careerProfile = { summary: SUMMARY, next: 'Made-up next step from the phone', notes: [{ id: 'n0', t: NOTE, at: now }] };
    if (o.db.settings.migrations) delete o.db.settings.migrations['work-syncs-1'];
    const stamp = o.db.profile._u;
    o.app.runMigrations(vm.runInContext('MIGRATIONS', o.app));
    const c = o.db.profile.career || {};
    const notes = (c.notes || []).map(n => n.t);
    return c.summary === 'Made-up words from the computer' && c.next === 'Made-up next step from the phone' && notes.includes(NOTE) && notes.includes('Made-up computer note')
      && !('careerProfile' in o.db.settings) && o.db.profile._u !== stamp ? true : JSON.stringify(c).slice(0, 300);
  }],
  ['CP-16b', 'restoring a backup from before an earlier build, without a career profile, keeps this phone\'s own', async o => {
    fill(o);
    const backup = JSON.parse(JSON.stringify(o.db));
    delete backup.profile.career;
    vm.runInContext('pendingImport = ' + JSON.stringify(backup) + ';', o.app);
    await o.app.confirmImport(true);
    const c = (o.app.__b.getDb().profile || {}).career || {};
    return c.summary === SUMMARY ? true : JSON.stringify(c).slice(0, 200);
  }],
  ['CP-16c', 'a restore that runs the step of an earlier build again leaves a job ad he labelled "only on this phone" as he labelled it', async o => {
    const ad = { id: 'cp-ad9', title: 'Made-up ad he keeps on this phone', kind: 'jobad', type: 'library', area: 'work', status: 'open', created: now, updated: now, privacy: 'device', notes: null, attachments: [] };
    o.db.items.push(ad);
    const backup = JSON.parse(JSON.stringify(o.app.__b.getDb()));
    backup.items = backup.items.filter(i => i.id !== ad.id);
    delete backup.settings;
    vm.runInContext('pendingImport = ' + JSON.stringify(backup) + ';', o.app);
    await o.app.confirmImport(true);
    const kept = (o.app.__b.getDb().items || []).find(i => i.id === ad.id);
    return kept && kept.privacy === 'device' && !JSON.stringify(o.app.syncPayload(o.app.__b.getDb())).includes(ad.title) ? true : JSON.stringify(kept && kept.privacy);
  }],
  ['CP-20', 'adding a treat on one device stamps the synced profile, so a career edit made earlier elsewhere does not undo it', o => {
    o.db.profile._u = '2026-10-01T00:00:00.000Z';
    const d = o.app.document;
    for (const [id, v] of [['tr_what', 'Made-up cinema'], ['tr_at', '5']]) { let e = d.getElementById(id); if (!e) { e = d.createElement('input'); e.id = id; d.body.appendChild(e); } e.value = v; }
    o.app.addTreat();
    return (o.db.profile._u || '') > '2026-10-02' && JSON.stringify(o.db.profile.credits || {}).includes('Made-up cinema') ? true : String(o.db.profile._u);
  }],
  ['CP-17', 'words typed but not yet saved or added survive the screen being drawn again', o => {
    screen(o, 'profile');
    el(o, 'cp_summary').value = SUMMARY; o.C.keep(true);
    const a = screen(o, 'profile').text;
    o.C.keepNote(NOTE);
    const b = screen(o, 'brainstorm').html;
    o.C.addNote(NOTE);
    const c = screen(o, 'brainstorm').html;
    /* typed, and the screen drawn again before the moment passes: the words are still there, and then kept */
    o.C.keep(false, 'next', NEXT);
    const d = screen(o, 'profile').html;
    o.C.keep(true);
    return a.includes(SUMMARY) && o.db.profile.career.summary === SUMMARY && b.includes(NOTE) && d.includes(NEXT) && o.db.profile.career.next === NEXT && !/bs_new[^>]*>[^<]+</.test(c) ? true : `${a.includes(SUMMARY)} ${b.includes(NOTE)}`;
  }],
  ['CP-18', 'a note with an odd id from an old backup can still be deleted', o => {
    o.db.profile.career = { summary: '', next: '', notes: [{ id: 'odd id/1', t: NOTE, at: now }] };
    const btn = { dataset: { armed: '1' }, textContent: 'Delete?', isConnected: true };
    o.C.deleteNote('oddid1', btn);
    return o.db.profile.career.notes.length === 0 ? true : 'still there';
  }],
  ['CP-14', 'index.html loads career-profile.js, names both screens and hides their tiles without it', o => {
    const h = o.html;
    const ok = [h.includes('<script type="text/brian-later" data-src="career-profile.js"></script>'),
      h.includes("work: ['myjob', 'skills', 'career', 'pipeline', 'profile', 'brainstorm', 'timeline:work'],"),
      h.includes("profile:    { title: 'Career profile', when: () => !!window.BrianCareer, view: () => window.BrianCareer ? BrianCareer.profileView()"),
      h.includes("brainstorm: { title: 'Work brainstorm', when: () => !!window.BrianCareer, view: () => window.BrianCareer ? BrianCareer.brainstormView()"),
      h.includes("(!(lensOf(l) || {}).when || lensOf(l).when())")];   /* an earlier step: each screen says when it shows */
    return ok.every(Boolean) ? true : ok.join(',');
  }],
];


const YEAR1 = 'Made-up goal: run the made-up reporting desk within a year';
const YEAR3 = 'Made-up goal: head a made-up analytics group in three years';
const SALARY = 'QZS 98765 made-up crowns';
const STEP_AMOUNT = 'QZS 4321 made-up raise';
const AD_TEXT = 'Made-up Ltd is hiring for an Example role. We want a made-up analyst who knows spreadsheet modelling and statistics modelling, with some made-up forecasting.';
const FIT = 'Made-up fit: it points straight at the made-up reporting desk';
const LIKE_WHY = 'Made-up reason: a short walk from the made-up station';
const CV_TEXT = 'Made-up CV: Example role at Made-up Ltd since 2022, made-up forecasting, made-up first-aid certificate. Made-up home address 1 Example Street.';
const FAKE = 'http://made-up-server.invalid';
const ANSWER = (fit = FIT + ' <i>so it does</i>') => JSON.stringify({ role: 'Example role', company: 'Made-up Ltd',
  have: [{ need: 'Spreadsheet modelling', evidence: 'Made-up spreadsheet modelling, level 3' }],
  missing: [{ need: 'Statistics modelling <img src=x onerror=alert(1)>', close_it: 'Made-up course on statistics' }, { need: 'Made-up forecasting', close_it: 'Made-up practice project' }],
  mention: ['Made-up quarterly report'], fit });
/* the fake server: every request is recorded; /sort answers as the AI does, /link as the link reader does */
function fakeServer(o, answer, linkText) {
  const calls = [];
  const s = o.db.settings;
  s.mode = 'proxy'; s.proxyUrl = FAKE; s.proxyPass = 'made-up-pass';
  o.app.fetch = async (url, init = {}) => {
    o.app.__fetches++;
    const u = String(url);
    calls.push({ url: u, body: String(init.body || '') });
    if (u.endsWith('/link')) return linkText == null ? { ok: false, status: 404, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ text: linkText }) };
    if (!u.endsWith('/sort')) throw new Error('unexpected request ' + u);
    const a = typeof answer === 'function' ? answer(calls.length) : answer;
    if (a && a.status) return { ok: false, status: a.status, json: async () => a.json };
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: a }] }) };
  };
  return calls;
}
/* the salary, a raise and the two goals, the way he would have them */
function withGoalsAndSalary(o) {
  const j = o.db.items.find(i => i.id === 'cp-j1');
  j.job_salary = SALARY; j.salary_steps = [{ id: 'st1', what: 'Made-up raise', when: null, amount: STEP_AMOUNT }];
  o.db.profile.career = { summary: SUMMARY, next: NEXT, year1: YEAR1, year3: YEAR3, notes: [{ id: 'n1', t: NOTE, at: now }] };
}
const AD = { id: 'hav-ad1', title: 'Example role at Made-up Ltd', kind: 'jobad', type: 'library', area: 'work', status: 'open', created: now, updated: now,
  notes: null, attachments: [], source_text: AD_TEXT };
function addAd(o, extra = {}) { const a = Object.assign({}, AD, extra); o.db.items.push(a); return a; }
function adSheet(o, id = AD.id) {
  vm.runInContext('openSheet = function(){};', o.app);
  o.app.openEdit(id);
  /* the stand-in page keeps no typed values, so the sheet's fields would read as empty: the checks
     below leave the sheet's own fields alone, which a real phone does by keeping what is shown */
  vm.runInContext('_editingId = null;', o.app);
  const html = o.app.__dom.get('editSheet').innerHTML;
  return { html, text: text(html) };
}
const settle = async () => { for (let k = 0; k < 8; k++) await new Promise(r => setImmediate(r)); };
const sorts = calls => calls.filter(c => c.url.endsWith('/sort'));
/* every way out of Brian that is not a request: the Building area's door, and the AI's sorting prompt
   with the items it carries; each job ad is labelled "can go to building", which must change nothing,
   because a work record never goes to building whatever its label says. since an earlier build a work record
   syncs between his own devices, so what syncs is read apart (synced below). */
function waysOut(o) {
  for (const i of o.db.items) if (i.kind === 'jobad' || i.kind === 'learn') i.privacy = 'building';
  o.app.save();
  /* and the words of every item that may be named outside his own devices: in a report or a walkthrough
     to Claude, or on the lock screen (index.html's ownDevicesOnly) */
  const told = vm.runInContext('ownDevicesOnly', o.app);
  return JSON.stringify(o.app.buildingExport()) + String(o.app.sorterPrompt()) + JSON.stringify(o.app.openItemsForPrompt())
    + JSON.stringify(o.db.items.filter(i => !told(i)));
}
const synced = o => JSON.stringify(o.app.syncPayload(o.db));
async function lockedBackup(o) {
  Object.assign(o.app, { crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob });
  const set = await o.app.setPin('4826');
  if (!set || !set.ok) throw new Error('the PIN could not be set: ' + JSON.stringify(set));
  let packed = '';
  o.app.Blob = class { constructor(p){ packed = String(p && p[0]); this.size = packed.length; } };
  o.app.URL = Object.assign({}, o.app.URL || {}, { createObjectURL: () => 'blob:made-up', revokeObjectURL(){} });
  await o.app.exportData();
  const m = /id="recovery_code"[^>]*>([^<]+)</.exec(o.app.__dom.get('main').innerHTML);
  if (!packed && m) await o.app.keepRecoveryCode();
  let inside = '';
  try { inside = JSON.stringify(await o.app.openDevicePart(JSON.parse(packed).__device, m ? m[1] : '')); } catch (e) { inside = ''; }
  return { packed, inside };
}
async function noPinBackup(o) {
  Object.assign(o.app, { crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob });
  let packed = '';
  o.app.Blob = class { constructor(p){ packed = String(p && p[0]); this.size = packed.length; } };
  o.app.URL = Object.assign({}, o.app.URL || {}, { createObjectURL: () => 'blob:made-up', revokeObjectURL(){} });
  await o.app.exportData();
  const m = /id="recovery_code"[^>]*>([^<]+)</.exec(o.app.__dom.get('main').innerHTML);
  if (!packed && m) await o.app.keepRecoveryCode();
  let inside = '';
  try { inside = JSON.stringify(await o.app.openDevicePart(JSON.parse(packed).__device, m ? m[1] : '')); } catch (e) { inside = ''; }
  return { packed, inside };
}
/* whether a backup file holds a locked phone-only part */
const lockedFile = b => !!(b && b.__device);
/* the jobs corner's own code in index.html, from its heading to the end of the CV reader */
const cornerCode = h => { const a = h.indexOf('/* ---------- THE JOBS CORNER (job HAV'), b = h.indexOf('\nfunction addCvTicked(){'), c = h.indexOf('\n}\n', b);
  return a > 0 && b > a && c > b ? h.slice(a, c) : ''; };
const ON_SWITCH = 'const CV_READING_ON = true;', OFF_SWITCH = 'const CV_READING_ON = false;';
const cvOnCopy = o => { const v = open(o.source || SRC, o.html.includes(OFF_SWITCH) ? o.html.replace(OFF_SWITCH, ON_SWITCH) : o.html);
  Object.assign(v.app, { TextEncoder, TextDecoder }); return v; };
const cvOffCopy = o => { const v = open(o.source || SRC, o.html.includes(ON_SWITCH) ? o.html.replace(ON_SWITCH, OFF_SWITCH) : o.html);
  Object.assign(v.app, { TextEncoder, TextDecoder }); return v; };

const HAV_CHECKS = [
  ['HAV-1', 'the profile shows the two goals after "What you want next", keeps them cut to 1000 characters, and says the one place they go', o => {
    screen(o, 'profile');
    el(o, 'cp_year1').value = '  ' + YEAR1 + ' ' + 'z'.repeat(1100); el(o, 'cp_year3').value = YEAR3;
    o.C.saveProfile();
    const c = o.db.profile.career, t = screen(o, 'profile').text;
    const at = [' What you want next ', ' Where I want to be in one year ', ' Where I want to be in three years ', ' The two goals are the one part of this profile that the AI sees, and only when you ask it to match a job ad or to find jobs for you'].map(x => t.indexOf(x));
    return c.year1.length === 1000 && c.year1.startsWith(YEAR1) && c.year3 === YEAR3 && t.includes(YEAR3)
      && at.every((n, k) => n > 0 && (k === 0 || n > at[k - 1])) ? true : at.join(',') + ' ' + JSON.stringify(c).slice(0, 160);
  }],
  ['HAV-2', 'the goals sync between his own devices and are in his backup file, and are in neither the Building area\'s door nor the sorting prompt', async o => {
    withGoalsAndSalary(o);
    const out = waysOut(o), sent = synced(o);
    const { packed } = await noPinBackup(o);
    const found = [YEAR1, YEAR3].filter(w => out.includes(w));
    const missing = [YEAR1, YEAR3].filter(w => !sent.includes(w) || !packed.includes(w));
    return packed.length > 1000 && !found.length && !missing.length ? true : 'found ' + found.join(', ') + ' missing ' + missing.join(', ');
  }],
  ['HAV-3', 'a job ad\'s own page shows the one button and makes no request when it opens; another kind of item shows no such button', o => {
    addAd(o); fakeServer(o, ANSWER());
    const s = adSheet(o);
    const other = adSheet(o, 'cp-s1');
    const n = s.html.split('What do I have and what am I missing?').length - 1;
    return n === 1 && s.html.includes(`onclick="checkJobAd('hav-ad1')"`) && s.text.includes(' What you have and what you miss ')
      && s.text.includes(' Do you like it? ') && !other.html.includes('What do I have and what am I missing?') && o.app.__fetches === 0 ? true : `${n} ${o.app.__fetches}`;
  }],
  ['HAV-4', 'the button makes exactly one AI request with the ad\'s own text, his roles, skills and goals, and never his salary, a raise, his profile words or his notes', async o => {
    withGoalsAndSalary(o); addAd(o);
    const calls = fakeServer(o, ANSWER());
    adSheet(o);
    await o.app.checkJobAd(AD.id);
    const body = calls.length === 1 ? calls[0].body : '';
    const bad = [SALARY, '98765', STEP_AMOUNT, '4321', SUMMARY, NEXT, NOTE].filter(w => body.includes(w));
    return calls.length === 1 && calls[0].url === FAKE + '/sort' && body.includes('hiring for an Example role') && body.includes('Made-up analyst')
      && body.includes('Made-up spreadsheet modelling') && body.includes(YEAR1) && body.includes(YEAR3) && body.includes('\\"fit\\"') && !bad.length
      ? true : `${calls.length} calls; bad: ${bad.join(', ')}`;
  }],
  ['HAV-5', 'the answer is kept on the ad and shown as text, with how it fits the goals; opening it again makes no call, and Check again makes exactly one', async o => {
    withGoalsAndSalary(o); addAd(o);
    const calls = fakeServer(o, n => n === 1 ? ANSWER() : ANSWER('Made-up second fit'));
    adSheet(o);
    await o.app.checkJobAd(AD.id);
    const ad = o.db.items.find(i => i.id === AD.id);
    const kept = ad.job_match || {};
    const s = adSheet(o);
    const again = await o.app.checkJobAd(AD.id);
    const one = calls.length;
    await o.app.checkJobAd(AD.id, true);
    const s2 = adSheet(o);
    return kept.fit.startsWith(FIT) && s.html.includes('&lt;i&gt;so it does') && !s.html.includes('<i>so it does') && (kept.missing || []).length === 2 && one === 1 && again === false && calls.length === 2
      && s.text.includes(' How it fits your goals ' + FIT) && s.text.includes(' You have Spreadsheet modelling ') && s.text.includes(' Missing or weak ')
      && s.html.includes('&lt;img src=x') && !s.html.includes('<img src=x') && s.html.includes(`checkJobAd('hav-ad1', true)`) && s.text.includes(' Check again ')
      && !s.html.includes('What do I have and what am I missing?') && s2.text.includes('Made-up second fit') && !s2.text.includes(FIT)
      ? true : `${one} ${again} ${calls.length} ${JSON.stringify(kept).slice(0, 120)}`;
  }],
  ['HAV-6', 'an ad captured as a link is read through the link once and kept as text, so Check again makes one AI call and no second read', async o => {
    addAd(o, { source_text: 'https://example.invalid/made-up-job-advert' });
    const calls = fakeServer(o, ANSWER(''), AD_TEXT + ' ' + 'Made-up detail. '.repeat(20));
    adSheet(o);
    await o.app.checkJobAd(AD.id);
    const first = calls.map(c => c.url.replace(FAKE, ''));
    await o.app.checkJobAd(AD.id, true);
    const second = calls.slice(first.length).map(c => c.url.replace(FAKE, ''));
    const ad = o.db.items.find(i => i.id === AD.id);
    return first.join() === '/link,/sort' && second.join() === '/sort' && String(ad.job_ad_text || '').startsWith(AD_TEXT) && !adSheet(o).text.includes(' How it fits your goals ')
      ? true : first.join() + ' | ' + second.join();
  }],
  ['HAV-7', 'the kept match, the advert\'s text and the liked line sync with the ad between his own devices, and are in neither the Building area\'s door nor the sorting prompt', async o => {
    withGoalsAndSalary(o); addAd(o);
    fakeServer(o, ANSWER());
    adSheet(o);
    await o.app.checkJobAd(AD.id);
    el(o, 'jl_hav-ad1').value = LIKE_WHY; o.app.likeJob(AD.id, true);
    const ad = o.db.items.find(i => i.id === AD.id);
    const out = waysOut(o);
    const words = [FIT, 'Made-up course on statistics', 'hiring for an Example role', LIKE_WHY];
    const found = words.filter(w => out.includes(w)), sent = synced(o), missing = words.filter(w => !sent.includes(w));
    return !!ad.job_match && !!ad.job_liked && o.app.privacyOf(ad) === 'synced' && !o.app.mayLeave(ad, 'ai') && out.length > 1000 && !found.length && !missing.length
      ? true : 'found ' + found.join(', ') + ' missing ' + missing.join(', ');
  }],
  ['HAV-8', 'with a PIN set, a backup file holds the job ad with its kept match, its text and its liked line, as it holds every synced record', async o => {
    addAd(o, { job_match: { at: now, role: 'Example role', company: 'Made-up Ltd', have: [], missing: [{ need: 'Made-up forecasting', close_it: 'Made-up practice project' }], mention: [], fit: FIT },
      job_liked: { why: LIKE_WHY, at: now }, job_ad_text: AD_TEXT });
    const { packed } = await lockedBackup(o);
    let backup = {}; try { backup = JSON.parse(packed); } catch (e) {}
    const ad = (backup.items || []).find(i => i.id === AD.id) || {};
    return packed.length > 500 && ad.job_match && ad.job_match.fit === FIT && ad.job_liked && ad.job_liked.why === LIKE_WHY && ad.job_ad_text === AD_TEXT
      ? true : 'the ad in the file: ' + JSON.stringify(ad).slice(0, 160);
  }],
  ['HAV-9', '"I like this" keeps one line on why, cut to 140 characters and shown as text, and Applications can show only the liked ones', o => {
    addAd(o, { pipeline_status: 'saved', pipeline_since: now });
    addAd(o, { id: 'hav-ad2', title: 'Another example role at Made-up Shop', pipeline_status: 'saved', pipeline_since: now });
    fakeServer(o, ANSWER());
    adSheet(o);
    el(o, 'jl_hav-ad1').value = '<b>' + LIKE_WHY + '</b> ' + 'w'.repeat(200);
    o.app.likeJob(AD.id, true);
    const why = (o.db.items.find(i => i.id === AD.id).job_liked || {}).why || '';
    const s = adSheet(o);
    const all = screen(o, 'pipeline');
    o.app.likedOnly(true);
    const only = screen(o, 'pipeline');
    o.app.likedOnly(false);
    const back = screen(o, 'pipeline');
    o.app.likeJob(AD.id, false);
    o.app.likedOnly(true);
    const none = screen(o, 'pipeline');
    o.app.likedOnly(false);
    return why.length === 140 && s.text.includes(' You like this one ') && s.html.includes('&lt;b&gt;') && !s.html.includes('<b>Made-up')
      && all.text.includes('Example role at Made-up Ltd') && all.text.includes('Another example role') && all.text.includes('♥ You like this one: <b>Made-up reason')
      && only.text.includes('Example role at Made-up Ltd') && !only.text.includes('Another example role') && only.text.includes(' Show every job ')
      && back.text.includes('Another example role') && none.text.includes('No job is marked as liked yet') && o.app.__fetches === 0
      ? true : `${why.length} ${only.text.slice(0, 300)}`;
  }],
  ['HAV-10', 'the Learning plan gathers the missing lines of every saved match with repeats put together, adds nothing by itself, and makes a line a learning task for the month he picks', o => {
    addAd(o, { job_match: { at: now, have: [], mention: [], fit: '', missing: [{ need: 'Statistics modelling', close_it: 'Made-up course on statistics' }, { need: 'Made-up forecasting', close_it: '' }] } });
    addAd(o, { id: 'hav-ad2', title: 'Another example role at Made-up Shop', job_match: { at: now, have: [], mention: [], fit: '', missing: [{ need: 'statistics  modelling.', close_it: 'Made-up other advice' }] } });
    addAd(o, { id: 'hav-ad3', title: 'An older example role', notes: 'COMPANY: Made-up Old Ltd\n\nMISSING:\n- Made-up forecasting — Made-up practice project\n- Made-up bookkeeping — Made-up evening class' });
    fakeServer(o, ANSWER());
    const n = o.db.items.length;
    const s = screen(o, 'learnplan');
    const opened = o.db.items.length === n && o.app.__fetches === 0;
    const lines = s.html.split('class="card learn-line"').length - 1;
    const stats = s.text.indexOf(' Statistics modelling Made-up course on statistics Missing in 2 saved job ads: Example role at Made-up Ltd, Another example role at Made-up Shop ');
    const fore = s.text.includes(' Made-up forecasting Made-up practice project Missing in 2 saved job ads: ');
    /* the second month offered, worked out from today's date, never written down */
    const d = new Date(), next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const month = next.getFullYear() + '-' + String(next.getMonth() + 1).padStart(2, '0');
    const last = new Date(Date.UTC(next.getFullYear(), next.getMonth() + 1, 0)).toISOString().slice(0, 10);
    const key = vm.runInContext("learnKey('Statistics modelling')", o.app);
    const k = /data-key="statistics modelling" onclick="makeLearnTask\(this\.dataset\.key, 'lp_m_(\d+)'\)"/.exec(s.html);
    if (!k) return 'no button for the statistics line';
    el(o, 'lp_m_' + k[1]).value = month;
    const made = o.app.makeLearnTask(key, 'lp_m_' + k[1]);
    const twice = o.app.makeLearnTask(key, 'lp_m_' + k[1]);
    o.C.saveProfile();   /* the profile, saved later, keeps the record of what the plan moved */
    const log = (o.db.profile.career || {}).learned || [];
    const after = screen(o, 'learnplan');
    const added = o.db.items.length - n;
    return opened && lines === 3 && stats > 0 && fore && !!made && twice === null && added === 1 && made.kind === 'task' && made.type === 'task' && made.area === 'work' && made.deadline === last
      && made.title === 'Learn: Statistics modelling' && log.length === 1 && log[0].month === month && log[0].item === made.id && log[0].at.slice(0, 10) === new Date().toISOString().slice(0, 10)
      && after.text.includes(' What the plan has moved (1) ') && after.text.includes('"Statistics modelling" became a learning task for') && after.html.includes(`openEdit('${made.id}')`)
      ? true : `${opened} ${lines} ${stats} ${fore} ${added} ${made && made.deadline} ${last} ${log.length}`;
  }],
  ['HAV-11', 'a learning task and the record of what the plan moved sync between his own devices and are in the backup file, and are in neither the Building area\'s door nor the sorting prompt', async o => {
    addAd(o, { job_match: { at: now, have: [], mention: [], fit: '', missing: [{ need: 'Made-up quantum spreadsheets', close_it: '' }] } });
    screen(o, 'learnplan');
    const it = o.app.makeLearnTask(vm.runInContext("learnKey('Made-up quantum spreadsheets')", o.app), 'lp_m_0');
    const out = waysOut(o), sent = synced(o);
    const { packed } = await lockedBackup(o);
    const learned = ((JSON.parse(packed || '{}').profile || {}).career || {}).learned || [];
    return !!it && o.app.privacyOf(it) === 'synced' && !o.app.mayLeave(it, 'ai') && !out.includes('quantum spreadsheets') && sent.includes('Learn: Made-up quantum spreadsheets')
      && sent.includes('"learned"') && packed.includes('Learn: Made-up quantum spreadsheets') && learned.length === 1 && learned[0].item === it.id
      ? true : `${it && o.app.privacyOf(it)} ${out.includes('quantum')} ${sent.includes('quantum')} ${learned.length}`;
  }],
  ['HAV-12a', 'reading a CV ships switched on, and the profile shows its button', o => {
    const p = screen(o, 'profile');
    return o.html.includes(ON_SWITCH) && !o.html.includes(OFF_SWITCH) && p.text.includes('Read my CV') && o.app.cvReaderButtonHTML() !== '' ? true : `${o.html.includes(ON_SWITCH)} ${p.text.includes('Read my CV')}`;
  }],
  ['HAV-12', 'with reading a CV switched off in a test copy, no button shows and no request can be made, even with a CV typed in', async o0 => {
    const o = cvOffCopy(o0);
    const calls = fakeServer(o, '{"jobs":[],"skills":[{"title":"Made-up skill"}],"certs":[]}');
    const p = screen(o, 'profile');
    const opened = o.app.openCvReader();
    el(o, 'cv_text').value = CV_TEXT;
    const read = await o.app.readCv();
    const added = o.app.addCvTicked();
    return o.html.includes(OFF_SWITCH) && !p.text.includes('Read my CV') && !p.html.includes('openCvReader') && o.app.cvReaderButtonHTML() === ''
      && opened === false && read === false && Array.isArray(added) && !added.length && calls.length === 0 && o.app.__fetches === 0 ? true : `${opened} ${read} ${calls.length}`;
  }],
  ['HAV-13', 'switched on in a test copy, a pasted CV makes one AI request, the proposals wait unticked and escaped, only the ticked ones are added, and the CV is not kept', async o0 => {
    const o = cvOnCopy(o0);
    const calls = fakeServer(o, JSON.stringify({ jobs: [{ role: 'Example role', company: 'Made-up Ltd', start: '2022-01-01', end: '', current: true }, { role: 'Made-up analyst', company: 'Example Works' }],
      skills: [{ title: 'Made-up forecasting <img src=x>', level: 4 }, { title: 'Made-up spreadsheet modelling', level: 3 }], certs: [{ title: 'Made-up first-aid certificate', have: true }] }));
    const p = screen(o, 'profile');
    o.app.openCvReader();
    el(o, 'cv_text').value = CV_TEXT;
    const n = o.db.items.length;
    await o.app.readCv();
    const out = o.app.__dom.get('cv_out').innerHTML;
    const none = o.app.addCvTicked();
    const ticks = [...out.matchAll(/<input type="checkbox" id="(cv_[jsc]_\d+)"[^>]*>/g)];
    const disabled = ticks.filter(m => /disabled/.test(m[0])).map(m => m[1]);
    el(o, 'cv_j_0').checked = true; el(o, 'cv_s_0').checked = true;
    const made = o.app.addCvTicked();
    const stored = JSON.stringify(o.db) + JSON.stringify(o.app.__store) + JSON.stringify(o.app.localStorage);
    return p.text.includes(' Read my CV ') && calls.length === 1 && calls[0].body.includes('Made-up home address') && none.length === 0 && ticks.length === 5
      && ticks.every(m => !/checked/.test(m[0])) && disabled.sort().join() === 'cv_c_0,cv_j_1,cv_s_1' && out.includes('&lt;img src=x&gt;') && !out.includes('<img src=x>')
      && made.length === 2 && o.db.items.length - n === 2 && made.every(i => i.area === 'work' && o.app.privacyOf(i) === 'synced' && !o.app.mayLeave(i, 'ai'))
      && made[0].kind === 'job' && made[0].job_role === 'Example role' && !made[0].job_past && made[1].kind === 'skill' && made[1].skill_level === 4
      && el(o, 'cv_text').value === '' && !stored.includes('Made-up home address') && !stored.includes('since 2022, made-up forecasting')
      ? true : `${calls.length} ${ticks.length} ${disabled.join()} ${made.length} ${o.db.items.length - n}`;
  }],
  ['HAV-14', 'switched on in a test copy, a picked PDF goes to the AI once as the file itself, and nothing of it is kept', async o0 => {
    const o = cvOnCopy(o0);
    const calls = fakeServer(o, JSON.stringify({ jobs: [], skills: [{ title: 'Made-up pdf skill', level: 2 }], certs: [] }));
    o.app.FileReader = class { readAsDataURL(b){ this.result = 'data:application/pdf;base64,' + Buffer.from(String(b.__text)).toString('base64'); this.onload && this.onload(); } };
    o.app.openCvReader();
    el(o, 'cv_file').files = [{ type: 'application/pdf', name: 'made-up-cv.pdf', __text: '%PDF made-up cv words' }];
    await o.app.readCv();
    let sent = {}; try { sent = JSON.parse(calls[0].body); } catch (e) {}
    const block = (((sent.messages || [])[0] || {}).content || [])[0] || {};
    const data = Buffer.from('%PDF made-up cv words').toString('base64');
    return calls.length === 1 && block.type === 'document' && block.source && block.source.media_type === 'application/pdf' && block.source.data === data
      && !JSON.stringify(o.db).includes(data) && el(o, 'cv_file').value === '' ? true : `${calls.length} ${JSON.stringify(block).slice(0, 120)}`;
  }],
  ['HAV-15', 'the jobs corner adds no request of its own: it sends only through the existing match and the app\'s one AI door, and the CV call is its only new one', o => {
    const c = cornerCode(o.html);
    const banned = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|proxyUrl|api\.anthropic/.exec(c);
    const ai = (c.match(/\baiRequest(Full)?\s*\(/g) || []).length, match = (c.match(/\bmatchPosting\s*\(/g) || []).length;
    return c.length > 5000 && !banned && ai === 1 && match === 1 && /async function readCv\(\)\{\n  if \(!cvReadingOn\(\)\) return false;/.test(c) ? true : `${c.length} ${banned && banned[0]} ai ${ai} match ${match}`;
  }],
  ['HAV-16', 'when the server stops the AI on purpose, the ad says so in the app\'s own sentence and keeps nothing; an ad marked "Don\'t keep" is never sent', async o => {
    addAd(o);
    const calls = fakeServer(o, { status: 429, json: { error: 'stopped', stopped: 'ai-monthly' } });
    o.app.toast = () => {};
    o.app.console = Object.assign({}, console, { warn(){} });   /* the server's own words go to the console, as on the phone */
    adSheet(o);
    const ok = await o.app.checkJobAd(AD.id);
    const box = o.app.__dom.get('jm_hav-ad1').innerHTML;
    const ad = o.db.items.find(i => i.id === AD.id);
    addAd(o, { id: 'hav-ad9', title: 'A made-up passing ad', privacy: 'never' });
    const n = calls.length;
    const sent = await o.app.checkJobAd('hav-ad9');
    return ok === false && !ad.job_match && box.includes('This month’s AI spending limit is reached') && box.includes('What do I have and what am I missing?')
      && sent === false && calls.length === n ? true : `${ok} ${box.slice(0, 200)} ${calls.length - n}`;
  }],
  ['HAV-17', 'a job ad saved from "Match a posting" keeps the answer on itself, so its own page shows it without a new call', async o => {
    withGoalsAndSalary(o);
    const calls = fakeServer(o, ANSWER());
    vm.runInContext('openSheet = function(){};', o.app);
    o.app.openMatch(); el(o, 'mt_in').value = AD_TEXT;
    await o.app.runMatch();
    const before = new Set(o.db.items.map(i => i.id));
    o.app.saveMatch();
    const ad = o.db.items.find(i => !before.has(i.id));
    const s = ad ? adSheet(o, ad.id) : { text: '' };
    return !!ad && calls.length === 1 && ad.job_match && ad.job_match.fit.startsWith(FIT) && s.text.includes(' How it fits your goals ') && s.text.includes(' Check again ')
      && String(ad.job_ad_text || '').startsWith(AD_TEXT) ? true : `${!!ad} ${calls.length}`;
  }],
  ['HAV-18', 'without a PIN, a checked and liked job ad and the goals are in the backup file with the synced planner, and a restore brings the ad back whole', async o => {
    withGoalsAndSalary(o); addAd(o, { job_ad_text: AD_TEXT + ' Made-up kept advert detail.' });
    fakeServer(o, ANSWER());
    adSheet(o);
    await o.app.checkJobAd(AD.id);
    el(o, 'jl_hav-ad1').value = LIKE_WHY; o.app.likeJob(AD.id, true);
    const had = o.db.items.find(i => i.id === AD.id);
    const checked = !!(had && had.job_match && had.job_match.fit.startsWith(FIT) && had.job_ad_text && had.job_liked);
    const { packed, inside } = await noPinBackup(o);
    let backup = {}; try { backup = JSON.parse(packed); } catch (e) {}
    const inReadable = (backup.items || []).find(i => i.id === AD.id);
    const goals = ((backup.profile || {}).career || {});
    o.db.items = o.db.items.filter(i => i.id !== AD.id);
    const readable = Object.assign({}, backup); delete readable.__device;
    vm.runInContext('pendingImport = ' + JSON.stringify(readable) + ';', o.app);
    await o.app.confirmImport(true);
    const back = (o.app.__b.getDb().items || []).find(i => i.id === AD.id) || {};
    return checked && !!inReadable && goals.year1 === YEAR1 && goals.year3 === YEAR3 && !inside.includes('"' + AD.id + '"')
      && back.job_match && back.job_match.fit.startsWith(FIT) && back.job_liked && String(back.job_ad_text || '').includes('kept advert detail')
      ? true : `checked ${checked} in readable ${!!inReadable} goals ${goals.year1} back ${JSON.stringify(back).slice(0, 120)}`;
  }],
  ['HAV-18b', 'an ordinary note that still carries the jobs corner\'s fields keeps them in the backup file', async o => {
    o.db.items.push({ id: 'hav-moved', title: 'Made-up note that was once an ad', kind: 'note', type: 'library', area: 'ideas', status: 'open',
      created: now, updated: now, notes: null, attachments: [], job_match: { fit: 'Made-up moved fit sentence', missing: [] },
      job_ad_text: 'Made-up moved advert words', job_liked: { why: 'Made-up moved liked line', at: now } });
    o.app.save();
    const { packed } = await noPinBackup(o);
    let backup = {}; try { backup = JSON.parse(packed); } catch (e) {}
    const moved = (backup.items || []).find(i => i.id === 'hav-moved') || {};
    return (moved.job_match || {}).fit === 'Made-up moved fit sentence' && moved.job_ad_text === 'Made-up moved advert words' && (moved.job_liked || {}).why === 'Made-up moved liked line'
      ? true : JSON.stringify(moved).slice(0, 160);
  }],
  ['HAV-19', 'an ad saved before the jobs corner is matched on its link, from its capture or from the notes\' SOURCE line, never on his notes, and with no link or text the ad asks for the advert to be pasted', async o => {
    const OLD = 'Made-up old summary of a match. '.repeat(8);
    const notes = 'COMPANY: Made-up Ltd\n\nYOU HAVE:\n- ' + OLD + '\n\nPAY: ' + SALARY + '\n\nSOURCE: https://example.invalid/old-advert';
    addAd(o, { id: 'hav-old1', source_text: 'https://example.invalid/old-advert', notes });
    addAd(o, { id: 'hav-old2', source_text: null, notes });
    addAd(o, { id: 'hav-old3', source_text: 'matched from pasted text', notes: 'COMPANY: Made-up Ltd\n\nPAY: ' + SALARY + '\n\n' + OLD });
    const LINKED = AD_TEXT + ' Made-up linked detail. '.repeat(20);
    const calls = fakeServer(o, ANSWER(), LINKED);
    const runs = [];
    for (const id of ['hav-old1', 'hav-old2']) {
      adSheet(o, id);
      const n = calls.length;
      await o.app.checkJobAd(id);
      const mine = calls.slice(n);
      runs.push(mine.map(c => c.url.replace(FAKE, '')).join() === '/link,/sort' && mine[0].body.includes('example.invalid/old-advert')
        && mine[1].body.includes('Made-up linked detail') && !mine[1].body.includes('old summary') && !mine[1].body.includes('98765'));
    }
    adSheet(o, 'hav-old3');
    const n3 = calls.length;
    const none = await o.app.checkJobAd('hav-old3');
    const box = o.app.__dom.get('jm_hav-old3').innerHTML;
    const asked = none === false && calls.length === n3 && box.includes('id="ja_hav-old3"') && box.includes(`checkJobAd('hav-old3', true, true)`);
    el(o, 'ja_hav-old3').value = AD_TEXT;
    await o.app.checkJobAd('hav-old3', true, true);
    const pasted = calls.slice(n3);
    const ad3 = o.db.items.find(i => i.id === 'hav-old3');
    const ok3 = pasted.length === 1 && pasted[0].url === FAKE + '/sort' && pasted[0].body.includes('hiring for an Example role') && !pasted[0].body.includes('old summary')
      && !pasted[0].body.includes('98765') && !!ad3.job_match && String(ad3.job_ad_text || '').startsWith(AD_TEXT);
    return runs.every(Boolean) && asked && ok3 ? true : `link runs ${runs.join()}; asked ${asked}; pasted ${ok3} ${pasted.length}`;
  }],
  ['HAV-20', 'a learning task stays a task when its sheet is edited and saved, and never turns into a Library entry', o => {
    addAd(o, { job_match: { at: now, have: [], mention: [], fit: '', missing: [{ need: 'Made-up ledger reading', close_it: '' }] } });
    screen(o, 'learnplan');
    const it = o.app.makeLearnTask(vm.runInContext("learnKey('Made-up ledger reading')", o.app), 'lp_m_0');
    if (!it) return 'no learning task was made';
    vm.runInContext('openSheet = function(){};', o.app);
    o.app.openEdit(it.id);
    /* the stand-in page keeps no values of its own, so the fields hold what the sheet shows on a phone */
    for (const [id, v] of [['e_title', it.title], ['e_area', 'work'], ['e_deadline', it.deadline], ['e_status', 'open']]) if (el(o, id)) el(o, id).value = v;
    o.app.saveEdit(it.id);
    const after = o.db.items.find(i => i.id === it.id) || {};
    return after.kind === 'task' && after.type === 'task' && after.area === 'work' && after.title === 'Learn: Made-up ledger reading' && o.app.privacyOf(after) === 'synced'
      ? true : `${after.kind} ${after.type} ${after.area} ${after.title}`;
  }],
];
/* each break of the jobs corner, which the checks above must notice */
const HAV_BREAKS = [
  ['a copy that does not keep the one-year goal', 'js', s => s.replace('  if (y1 !== null) c.year1 = clip(y1, MAX_TEXT);\n', '')],
  ['a copy that does not cut the goals', 'js', s => s.replace('if (y1 !== null) c.year1 = clip(y1, MAX_TEXT);', 'if (y1 !== null) c.year1 = y1;')],
  ['a copy whose profile drops the record of what the plan moved', 'js', s => s.replace('notes: c.notes.slice(), learned: c.learned.slice() };', 'notes: c.notes.slice(), learned: [] };')],
  ['an index.html whose match leaves the goals out', 'html', s => s.replace("        + (goals ? '\\n\\nMY GOALS:\\n' + goals : ''), 1500);", '        , 1500);')],
  ['an index.html whose record carries the salary', 'html', s => s.replace("(cur.job_note ? ' — achieved: ' + cur.job_note : ''));", "(cur.job_note ? ' — achieved: ' + cur.job_note : '') + (cur.job_salary ? ' — salary ' + cur.job_salary : ''));")],
  ['an index.html whose record carries the raises', 'html', s => s.replace("  if (cur) lines.push('CURRENT ROLE: '", "  if (cur) lines.push('MILESTONES: ' + salarySteps(cur).map(x => x.amount).join(', '));\n  if (cur) lines.push('CURRENT ROLE: '")],
  ['an index.html whose sorting prompt carries the goals', 'html', s => s.replace('function sorterPrompt(){\n', 'function sorterPrompt(){\n  if (careerGoals()) return careerGoals() + _sorterPromptReal();\n  return _sorterPromptReal();\n}\nfunction _sorterPromptReal(){\n')],
  ['an index.html without the job ad block on the sheet', 'html', s => s.replace("  { key: 'jobad', area: 'work', html: it => it.kind === 'jobad' ? jobAdBlockHTML(it) : '' },\n", '')],
  ['an index.html whose ad page calls the AI every time it is asked', 'html', s => s.replace('  if (it.job_match && !again) return false;\n', '')],
  ['an index.html that does not keep the answer on the ad', 'html', s => s.replace('      now.job_match = keptMatch(r.match);\n', '')],
  ['an index.html that shows the fit unescaped', 'html', s => s.replace('<div class="card"><div class="s">${esc(m.fit)}</div></div>', '<div class="card"><div class="s">${m.fit}</div></div>')],
  ['an index.html that shows a kept missing line unescaped', 'html', s => s.replace("    `<div class=\"card\"><div class=\"t\">${esc(x.need)}</div><div class=\"s\">${esc(x.close_it)}</div></div>`).join('') : `<div class=\"empty\">Nothing obvious missing</div>`);", "    `<div class=\"card\"><div class=\"t\">${x.need}</div><div class=\"s\">${esc(x.close_it)}</div></div>`).join('') : `<div class=\"empty\">Nothing obvious missing</div>`);")],
  ['an index.html that reads the link again on every check', 'html', s => s.replace('      if (r.match.srcUrl && !now.job_ad_text && r.match.text) now.job_ad_text = String(r.match.text).slice(0, MATCH_CAP);\n', '')],
  ['an index.html that copies the kept match into an ordinary note, which a report may quote', 'html', s => s.replace('      now.job_match = keptMatch(r.match);\n', "      now.job_match = keptMatch(r.match);\n      addItem({ title: 'Match for ' + now.title, kind: 'note', type: 'library', area: 'ideas', notes: now.job_match.fit + ' ' + now.job_match.missing.map(x => x.close_it).join(' ') + ' ' + raw, no_dedupe: true });\n")],
  ['an index.html that copies the liked line into an ordinary note, which a report may quote', 'html', s => s.replace("  it.job_liked = on ? { why: why || null, at: new Date().toISOString() } : null;\n", "  it.job_liked = on ? { why: why || null, at: new Date().toISOString() } : null;\n  if (on) addItem({ title: 'Liked: ' + why, kind: 'note', type: 'library', area: 'ideas', no_dedupe: true });\n")],
  ['an index.html whose backup leaves the profile out, goals and all', 'html', s => s.replace('  out.__privacy = backupPrivacy(whole);\n', '  out.__privacy = backupPrivacy(whole);\n  if (out.profile) delete out.profile.career;\n')],
  ['an index.html whose work records stay on the phone again, as before an earlier build', 'html', s => s.replace("!(['meal', 'product', 'recipe', 'habit'].includes(i.kind) && !i.body_part)));", "!(['meal', 'product', 'recipe', 'habit'].includes(i.kind) && !i.body_part)) || String(i.area || '').trim().toLowerCase() === 'work' || ['job', 'duty', 'skill', 'cert', 'jobad'].includes(i.kind) || !!i.pipeline_status || String(i.topic || '').trim().toLowerCase() === 'job hunt');")],
  ['an index.html whose general AI may read work records', 'html', s => s.replace("  if (route === 'ai' && isWorkRecord(i)) return false;\n", '')],
  ['an index.html that ignores "Only the liked ones"', 'html', s => s.replace('const liked = i => !_likedOnly || !!i.job_liked;', 'const liked = i => true;')],
  ['an index.html that does not cut the liked line', 'html', s => s.replace("const why = on ? jobClip(el ? el.value : '', JOB_LIKE_MAX) : '';", "const why = on ? String(el ? el.value : '') : '';")],
  ['an index.html that shows the liked line unescaped in Applications', 'html', s => s.replace("${i.job_liked.why ? ': ' + esc(i.job_liked.why) : ''}", "${i.job_liked.why ? ': ' + i.job_liked.why : ''}")],
  ['an index.html whose learning plan does not put repeats together', 'html', s => s.replace("const learnKey = t => deacc(t).replace(/[^a-z0-9+#]+/g, ' ').trim();", 'const learnKey = t => String(t || \'\').trim();')],
  ['an index.html whose learning plan forgets the ads saved before', 'html', s => s.replace("    if (m) for (const line of m[1].split('\\n'))", '    if (false) for (const line of m[1].split(\'\\n\'))')],
  ['an index.html whose learning plan makes tasks by itself', 'html', s => s.replace('    const done = learnMoved(l.key);\n', "    const done = learnMoved(l.key) || (makeLearnTask(l.key, '') && learnMoved(l.key));\n")],
  ['an index.html whose learning plan keeps no record', 'html', s => s.replace("  c.learned = (Array.isArray(c.learned) ? c.learned : []).concat({ at: new Date().toISOString(), key, need: l.need, month, item: it.id }).slice(-LEARN_LOG_MAX);\n", '')],
  ['an index.html whose learning task lands a month early', 'html', s => s.replace('Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)', 'Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1, 0)')],
  ['an index.html that makes the learning task twice', 'html', s => s.replace("  if (learnMoved(key)){ toast('That line is already a learning task'); return null; }\n", '')],
  ['an index.html that files the learning task outside Work, so the general AI reads it', 'html', s => s.replace("kind: 'task', type: 'task', area: 'work', deadline: end,", "kind: 'task', type: 'task', area: 'learning', deadline: end,")],
  ['an index.html whose learning task has the Library kind "learn", so editing it makes it a Library entry', 'html', s => s.replace("kind: 'task', type: 'task', area: 'work', deadline: end,", "kind: 'learn', type: 'task', area: 'work', deadline: end,")],
  ['an index.html whose backup takes the jobs corner\'s fields off again', 'html', s => s.replace('  out.__privacy = backupPrivacy(whole);\n', '  out.__privacy = backupPrivacy(whole);\n  for (const i of [].concat(out.items || [], out.trash || [])) if (i) for (const k of JOB_PHONE_FIELDS) delete i[k];\n')],
  ['an index.html that matches an ad on his notes when it has no link', 'html', s => s.replace("  if (src && src !== JOB_PASTED_MARK) return [it.title, src].filter(Boolean).join('\\n\\n');\n  return '';", "  return [it.title, src === JOB_PASTED_MARK ? '' : src, it.notes].filter(Boolean).join('\\n\\n');")],
  ['an index.html that ignores the SOURCE line of an ad saved before', 'html', s => s.replace('  if (fromNotes) return fromNotes;\n', '')],
  ['an index.html that matches old ads as before the review, on their summary', 'html', s => s.replace('  const fromSrc = src.length < 300 ? urlsIn(src)[0] : null;\n  if (fromSrc) return fromSrc;\n', "  const fromSrc = urlsIn([src, it.title, it.notes].filter(Boolean).join(' '))[0] || null;\n  if (fromSrc && src.length < 300 && String(it.notes || '').length < 200) return fromSrc;\n  if (fromSrc) return [it.title, src, it.notes].filter(Boolean).join('\\n\\n');\n")],
  ['an index.html that ships reading a CV switched off again', 'html', s => s.replace('const CV_READING_ON = true;', 'const CV_READING_ON = false;')],
  ['an index.html whose CV reading ignores the switch', 'html', s => s.replace('async function readCv(){\n  if (!cvReadingOn()) return false;\n', 'async function readCv(){\n')],
  ['an index.html whose CV button ignores the switch', 'html', s => s.replace("function cvReaderButtonHTML(){\n  if (!cvReadingOn()) return '';\n", 'function cvReaderButtonHTML(){\n')],
  ['an index.html that adds every proposal from a CV without ticks', 'html', s => s.replace('return !!(el && el.checked && !el.disabled); };', 'return true; };')],
  ['an index.html that keeps the CV on the phone', 'html', s => s.replace("    const raw = await aiRequest(CV_SYSTEM, content, 2000);\n", "    const raw = await aiRequest(CV_SYSTEM, content, 2000);\n    db.settings.lastCv = text;\n")],
  ['an index.html that shows a proposed skill unescaped', 'html', s => s.replace("(s, n) => row('cv_s_' + n, esc(s.title),", "(s, n) => row('cv_s_' + n, s.title,")],
  ['an index.html that sends a PDF as a photo', 'html', s => s.replace("content = [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }", "content = [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }")],
  ['an index.html whose jobs corner asks the server by itself', 'html', s => s.replace('  touch(it); save();\n  if (_editingId === id && document.getElementById(\'e_title\')) openEdit(id);', "  touch(it); save();\n  try { fetch(syncBase() + '/liked', { method: 'POST', headers: syncHeaders(), body: JSON.stringify({ why }) }).catch(() => {}); } catch(e){}\n  if (_editingId === id && document.getElementById('e_title')) openEdit(id);")],
  ['an index.html whose ad page hides why the AI stopped', 'html', s => s.replace("    return { said: `<div class=\"empty\">The match did not work this time, and nothing was saved. ${esc(saidWhy(e, 'Try again, or paste the plain text.'))}</div>` };", "    return { said: `<div class=\"empty\">The match did not work this time, and nothing was saved.</div>` };")],
  ['an index.html whose ad page sends an ad marked "Don\'t keep"', 'html', s => s.replace('  if (aiRefused(it)) return false;\n  if (!aiConfigured()){ toast(\'Set up AI in Settings first\'); return false; }\n  if (_jobAdBusy)', "  if (!aiConfigured()){ toast('Set up AI in Settings first'); return false; }\n  if (_jobAdBusy)")],
  ['an index.html whose saved match is not kept on the ad', 'html', s => s.replace("    job_match: keptMatch(m), job_ad_text: m.text ? String(m.text).slice(0, MATCH_CAP) : null });", '    });')],
];
CHECKS.push(...HAV_CHECKS);

/* each break is run against the checks of its own part: the first breaks against the profile's and
   the brainstorm's checks, the jobs corner's breaks against the jobs corner's checks */
async function runAll(make, part) {
  const res = new Map();
  for (const [id, , fn] of CHECKS) {
    if (part && (part === 'hav') !== id.startsWith('HAV-')) continue;
    let r; try { r = await fn(make()); } catch (e) { r = 'threw ' + e.message; }
    res.set(id, r);
  }
  return res;
}

let pass = 0, fail = 0;
console.log('Career profile tests: the Career profile and the Work brainstorm (career-profile.js)');
const good = await runAll(() => open(SRC));
const goodPass = new Set();
for (const [id, name] of CHECKS) {
  const r = good.get(id);
  if (r === true) { pass++; goodPass.add(id); console.log(`  ok    [${id}] ${name}`); }
  else { fail++; console.log(`  FAIL  [${id}] ${name}\n        ${r}`); }
}
/* without the file, Work & career shows exactly the screens it showed before */
{
  const plain = HTML.replace('<script type="text/brian-later" data-src="career-profile.js"></script>\n', '');
  const t = screen(open(null, plain), 'area:work').text;
  const ok = !t.includes('Career profile') && !t.includes('Work brainstorm') && t.includes(' Applications ');
  if (ok) { pass++; console.log('  ok    [CP-0] without career-profile.js, Work & career shows no tile for the two screens'); }
  else { fail++; console.log('  FAIL  [CP-0] without career-profile.js, Work & career shows no tile for the two screens'); }
}
import { FAST, skipBreaks, staleBreaks } from './break-verdict.mjs';   

const BREAKS = [
  ['a copy that forgets the past jobs', 'js', s => s.replace("const past = (typeof pastJobs === 'function' ? pastJobs() : null) || [];", 'const past = [];')],
  ['a copy that counts a wanted certificate as one he has', 'js', s => s.replace("const have = certs.filter(c => c.cert_status !== 'want')", 'const have = certs.filter(c => true)')],
  ['a copy that drops "What you want next"', 'js', s => s.replace("if (b !== null) c.next = clip(b, MAX_TEXT);", '')],
  ['a copy that does not cut the texts', 'js', s => s.replace("if (a !== null) c.summary = clip(a, MAX_TEXT);", 'if (a !== null) c.summary = a;')],
  ['a copy that keeps an empty note', 'js', s => s.replace("if (!t) { if (typeof toast === 'function') toast('Type the note first'); return null; }", '')],
  ['a copy that shows the oldest note first', 'js', s => s.replace("String(b.at || '').localeCompare(String(a.at || ''))", "String(a.at || '').localeCompare(String(b.at || ''))")],
  ['a copy with no limit on notes', 'js', s => s.replace('if (c.notes.length >= MAX_NOTES)', 'if (false)')],
  ['a copy that deletes on the first tap', 'js', s => s.replace('if (btn && !btn.dataset.armed){', 'if (false){')],
  ['a copy that also files each note as a work item', 'js', s => s.replace('  c.notes.push(n);\n', "  c.notes.push(n);\n  if (typeof addItem === 'function') addItem({ title: t, kind: 'note', area: 'work' });\n")],
  ['a copy that files each note as an ordinary item, which syncs', 'js', s => s.replace('  c.notes.push(n);\n', "  c.notes.push(n);\n  try { db.items.push({ id: n.id, title: t, kind: 'task', type: 'task', area: 'ideas', status: 'open', privacy: 'building', date: new Date().toISOString().slice(0, 10), updated: new Date().toISOString() }); } catch(e){}\n")],
  ['a copy that forgets to escape notes', 'js', s => s.replace('white-space:pre-wrap">${escH(n.t)}</div>', 'white-space:pre-wrap">${n.t}</div>')],
  ['a copy that forgets to escape the summary', 'js', s => s.replace("${escH('summary' in typing ? typing.summary : st.summary)}", "${'summary' in typing ? typing.summary : st.summary}")],
  ['a copy that sends the profile somewhere', 'js', s => s.replace("  done('Career profile saved');", "  try { fetch('https://example.test/profile', { method: 'POST', body: c.summary }); } catch(e){}\n  done('Career profile saved');")],
  ['a copy that stops saying where it is kept', 'js', s => s.replace("const ON_PHONE = 'What you write here syncs between your phone and your computer through your own Brian server, and is in your backup file without a lock, so keep that file somewhere private. It never goes to the Building area.';", "const ON_PHONE = 'This stays on this phone.';")],
  ['a copy that keeps the profile in the settings again, which never sync', 'js', s => s.replace('if (!db.profile || typeof db.profile !== \'object\') db.profile = {}; return db.profile; }', 'return db.settings; }')],
  ['a copy that does not stamp the profile when it saves', 'js', s => s.replace("  s._u = new Date().toISOString();\n  return s.career;", '  return s.career;')],
  ['a copy whose sections come in another order', 'js', s => s.replace('    h += `<div class="section-label">Skills (${skills.length})</div>`;', '    h = `<div class="section-label">Skills (${skills.length})</div>` + h;')],
  ['a copy that sends the profile by a name the source check does not know', 'js', s => s.replace("  done('Career profile saved');", "  try { globalThis['fe' + 'tch']('https://example.test/profile', { method: 'POST', body: c.summary }); } catch(e){}\n  done('Career profile saved');")],
  ['a copy that keeps typing only when Save is tapped', 'js', s => s.replace("if (now) run(); else keepTimer = setTimeout(run, 600);", '')],
  ['a copy that draws the stored words over what he is typing', 'js', s => s.replace("${escH('next' in typing ? typing.next : st.next)}", '${escH(st.next)}')],
  ['a copy that forgets a note being typed', 'js', s => s.replace('>${escH(draftNote)}</textarea>', '></textarea>')],
  ['a copy that deletes only notes with tidy ids', 'js', s => s.replace('c.notes.filter(n => jsq(n.id) !== jsq(id))', 'c.notes.filter(n => n.id !== id)')],
  ['an index.html whose sync leaves the profile out', 'html', s => s.replace('topics: d.topics, profile: d.profile || {},', 'topics: d.topics, profile: {},')],
  ['an index.html whose backup leaves the profile out', 'html', s => s.replace('  out.__privacy = backupPrivacy(whole);\n', '  out.__privacy = backupPrivacy(whole);\n  if (out.profile) delete out.profile.career;\n')],
  ['an index.html without the start-up step of an earlier build', 'html', s => s.replace("  { name: 'work-syncs-1', run(){ return workSyncs() > 0; } },\n", '')],
  ['a treat that does not stamp the synced profile (from a review)', 'html', s => s.replace("  db.profile.credits.since = creditsSince();\n  db.profile._u = new Date().toISOString(); save();", "  db.profile.credits.since = creditsSince();\n  save();")],
  ['a restore that relabels his own "only on this phone" job ad as synced (from a review)', 'html', s => s.replace("    if (workLabelsKept && workLabelsKept.has(it.id)) continue;\n", '')],
  ['a start-up step that drops this phone\'s career words when the synced profile already has some (from a review)', 'html', s => s.replace("    } else if (careerJoin(db.profile.career, old)) db.profile._u = new Date().toISOString();\n", "    }\n")],
  ['a restore of an older backup that loses this phone\'s career profile (from a review)', 'html', s => s.replace("        db.profile = Object.assign(db.profile || {}, { career: mine });", "        void mine;")],
  ['an index.html whose start-up step of an earlier build also unlocks health records', 'html', s => s.replace("if (!it || it.privacy !== 'device' || !isWorkRecord(it) || isHealthRecord(it)) continue;", "if (!it || it.privacy !== 'device' || !isWorkRecord(it)) continue;")],
  ['an index.html whose AI request also sends the profile', 'html', s => s.replace("system, messages:[{role:'user', content}] });", "system, messages:[{role:'user', content}], extra: (db.profile || {}).career });")],
  ['an index.html without the two screens in Work & career', 'html', s => s.replace("'pipeline', 'profile', 'brainstorm', 'timeline:work'", "'pipeline', 'timeline:work'")],
  ['an index.html that shows the tiles without the file', 'html', s => s.replace(/(profile|brainstorm)(: +\{ title: '[^']+'), when: \(\) => !!window\.BrianCareer,/g, '$1$2,')],
  ['an index.html whose backup message no longer says the job hunt is in it without a lock', 'html', s => s.replace(" in it without a lock, so keep the file somewhere private'", " in it'")],
  ['an index.html that does not load career-profile.js', 'html', s => s.replace('<script type="text/brian-later" data-src="career-profile.js"></script>\n', '')],
];
const ALL_BREAKS = BREAKS.map(b => b.concat('cp')).concat(HAV_BREAKS.map(b => b.concat('hav')));
if (FAST) {
  fail += staleBreaks(ALL_BREAKS.map(([name, where, brk]) => { const base = where === 'js' ? SRC : HTML; return [name, brk(base) !== base]; }));
  rmSync(tmp, { recursive: true, force: true }); skipBreaks(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
}
console.log('Broken copies, each of which must be noticed:');
const caughtBy = new Set();
for (const [name, where, brk, part] of ALL_BREAKS) {
  const base = where === 'js' ? SRC : HTML;
  const broken = brk(base);
  if (broken === base) { fail++; console.log('  FAIL  ' + name + ' (the break did not apply, so the copy is not broken)'); continue; }
  const loads = where === 'html' ? broken.includes('data-src="career-profile.js"') : true;
  if (part === 'hav') process.on('unhandledRejection', quietRefusal);
  const r = await runAll(() => where === 'js' ? open(broken) : open(loads ? SRC : null, broken), part);
  /* a refusal left behind by this broken copy is let through before the note is switched off again */
  if (part === 'hav') { await settle(); await new Promise(res => setTimeout(res, 50)); process.off('unhandledRejection', quietRefusal); }
  /* the tile guard is only visible without the file, so that break is also tried that way */
  if (name === 'an index.html that shows the tiles without the file') {
    const t = screen(open(null, broken), 'area:work').text;
    if (t.includes('Career profile')) r.set('CP-0', 'tiles shown without the file');
  }
  const by = [...r].filter(([id, v]) => (goodPass.has(id) || id === 'CP-0') && v !== true).map(([id]) => id);
  for (const id of by) caughtBy.add(id);
  if (by.length) { pass++; console.log(`  ok    noticed: ${name} (by ${by.join(', ')})`); }
  else { fail++; console.log('  FAIL  not noticed: ' + name); }
}
const unproven = [...goodPass].filter(id => !caughtBy.has(id));
if (unproven.length) { fail++; console.log('  FAIL  no break makes these checks fail: ' + unproven.join(', ')); }
else { pass++; console.log('  ok    every check fails on at least one broken copy'); }

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
