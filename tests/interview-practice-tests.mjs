/* A test suite from Brian, a private planner. It opens the real app with made-up data and does not run from this repository. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { loadApp } from './app-sandbox.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(root, 'interview-practice.js'), 'utf8');
const HTML = readFileSync(join(root, 'index.html'), 'utf8');
const now = new Date().toISOString();
const SALARY = 'QZ-SALARY-made-up-1234';
const AD_TEXT = 'Made-up shelf designer at Example Shelves Ltd. Needs made-up spreadsheet modelling and two years of made-up design.';
const QUESTIONS = ['Tell me about a made-up shelf you designed.', 'How do you use spreadsheets?', 'Why Example Shelves?', 'A made-up gap question?', 'Where do you see yourself?'];
const TIPS = QUESTIONS.map((_, i) => ({ worked: 'Made-up worked ' + i, add: 'Made-up add ' + i }));

function open(src, o = {}) {
  const app = loadApp(null, { dom: true, location: { hostname: '127.0.0.1', protocol: 'http:', origin: 'http://127.0.0.1:8765', href: 'http://127.0.0.1:8765/' } });
  vm.runInContext(`bindLabels = enterDialog = exitDialog = function(){}; window.scrollTo = window.scrollTo || function(){};`, app);
  app.__fetches = 0;
  app.fetch = () => { app.__fetches++; return Promise.reject(new Error('no network in this test')); };
  app.__said = []; app.toast = m => { app.__said.push(String(m)); };
  app.__calls = [];
  const answers = o.answers || [JSON.stringify(QUESTIONS), JSON.stringify(TIPS)];
  app.__answer = (system, content) => { app.__calls.push({ system, content: String(content) }); return answers[Math.min(app.__calls.length - 1, answers.length - 1)]; };
  vm.runInContext(`aiConfigured = () => true; aiRequest = async (s, c) => __answer(s, c);`, app);
  const db = app.__b.getDb();
  db.items = db.items.filter(i => !['job', 'duty', 'skill', 'cert', 'jobad'].includes(i.kind));
  const base = { status: 'open', created: now, updated: now, notes: null, attachments: [], type: 'library' };
  db.items.push(Object.assign({}, base, { id: 'ip-j1', title: 'Made-up analyst at Example Works', kind: 'job', area: 'work', job_role: 'Made-up analyst', job_company: 'Example Works', job_start: '2021-03-01', job_salary: SALARY, salary_steps: [{ id: 's1', what: SALARY }] }));
  db.items.push(Object.assign({}, base, { id: 'ip-s1', title: 'Made-up spreadsheet modelling', kind: 'skill', area: 'work', skill_type: 'tool', skill_level: 3 }));
  const ad = Object.assign({}, base, { id: 'ip-ad', title: 'Made-up shelf designer — Example Shelves Ltd', kind: 'jobad', area: 'work', pipeline_status: 'saved', job_ad_text: AD_TEXT, updated: '2026-10-01T00:00:00.000Z' }, o.ad || {});
  db.items.push(ad);
  let error = null;
  try { vm.runInContext(src, app, { filename: 'interview-practice.js' }); } catch (e) { error = e; }
  const out = () => app.__dom.has('ip_out') ? app.__dom.get('ip_out').innerHTML : '';
  const answer = t => { const el = app.document.getElementById('ip_a'); el.value = t; };
  return { app, db, ad: () => db.items.find(i => i.id === 'ip-ad'), out, answer, I: app.BrianInterview, error };
}
async function fullRound(o) {
  await o.I.start('ip-ad');
  for (let i = 0; i < QUESTIONS.length; i++) { o.answer('Made-up answer ' + i); await o.I.step(1); }
}

const CHECKS = [
  ['IP-1', 'a saved job ad offers "Practise the interview" on its page', async src => {
    const o = open(src);
    const h = o.I ? o.I.blockHTML(o.ad()) : '';
    const page = vm.runInContext('jobAdBlockHTML', o.app)(o.ad());
    return h.includes('Practise the interview') && page.includes('Practise the interview') ? true : (o.error ? String(o.error) : 'missing');
  }],
  ['IP-2', 'his tap makes one AI call with the advert and his record, never his salary, and shows the first question', async src => {
    const o = open(src);
    await o.I.start('ip-ad');
    const c = o.app.__calls[0] || {};
    return o.app.__calls.length === 1 && c.content.includes('Needs made-up spreadsheet modelling') && c.content.includes('Made-up analyst')
      && !c.content.includes(SALARY) && !String(c.system).includes(SALARY) && o.out().includes(QUESTIONS[0]) ? true : JSON.stringify(o.app.__calls).slice(0, 300);
  }],
  ['IP-3', 'after the last answer one more call reads his answers, and the round is kept on the ad with the tips', async src => {
    const o = open(src);
    await fullRound(o);
    const p = o.ad().job_practice || {};
    const c = o.app.__calls[1] || {};
    /* and the ad is stamped as changed, so the round syncs to his other devices */
    return o.app.__calls.length === 2 && String(o.ad().updated) > '2026-10-02' && c.content.includes('Made-up answer 3') && !c.content.includes(SALARY) && (p.questions || []).length === 5
      && p.questions[2].a === 'Made-up answer 2' && p.questions[2].worked === 'Made-up worked 2' && p.questions[4].add === 'Made-up add 4' && o.out().includes('Made-up add 1')
      ? true : JSON.stringify(p).slice(0, 300);
  }],
  ['IP-4', '"Back" keeps the answer he typed', async src => {
    const o = open(src);
    await o.I.start('ip-ad');
    o.answer('Made-up first answer'); await o.I.step(1);
    o.answer('Made-up second answer'); await o.I.step(-1);
    return o.app.document.getElementById('ip_a').value === 'Made-up first answer' || o.out().includes('Made-up first answer') ? true : o.out().slice(0, 300);
  }],
  ['IP-5', 'questions, answers and tips that look like markup are shown as text', async src => {
    const o = open(src, { answers: [JSON.stringify(['<img src=x onerror=alert(1)>', 'b', 'c', 'd', 'e']), JSON.stringify([{ worked: '<script>x</script>', add: 'y' }])] });
    await o.I.start('ip-ad');
    const first = o.out();
    for (let i = 0; i < 5; i++) { o.answer('<b>made-up</b>'); await o.I.step(1); }
    const after = o.out();
    return !first.includes('<img') && first.includes('&lt;img') && !after.includes('<script>') && !after.includes('<b>made-up</b>') ? true : after.slice(0, 300);
  }],
  ['IP-6', 'an ad with no advert text and no match asks him to check it first, with no call', async src => {
    const o = open(src, { ad: { job_ad_text: null, job_match: null } });
    await o.I.start('ip-ad');
    return o.app.__calls.length === 0 && o.app.__said.some(m => /Check this advert first/.test(m)) ? true : o.app.__said.join(' | ');
  }],
  ['IP-7', 'an ad he marked "don\'t keep" is never sent', async src => {
    const o = open(src, { ad: { privacy: 'never' } });
    await o.I.start('ip-ad');
    return o.app.__calls.length === 0 ? true : 'sent';
  }],
  ['IP-8', 'an answer that is not a list of questions keeps nothing and says so', async src => {
    const o = open(src, { answers: ['made-up words, no list'] });
    await o.I.start('ip-ad');
    return !o.ad().job_practice && o.out().includes('No questions came back') ? true : o.out().slice(0, 200);
  }],
  ['IP-9', 'the kept round can be read again from the ad\'s page', async src => {
    const o = open(src);
    await fullRound(o);
    const h = o.I.blockHTML(o.ad());
    o.I.review('ip-ad');
    return h.includes('Read it again') && h.includes('Practise again') && o.out().includes('Made-up worked 0') ? true : h.slice(0, 200);
  }],
  ['IP-10', 'the kept round syncs with the ad and never goes to the Building area', async src => {
    const o = open(src);
    await fullRound(o);
    const ad = o.ad();
    return vm.runInContext('mayLeave', o.app)(ad, 'sync') && vm.runInContext('ownDevicesOnly', o.app)(ad)
      && !JSON.stringify(o.app.buildingExport()).includes('Made-up answer') ? true : 'leaks';
  }],
  ['IP-11', 'nothing here makes a request of its own; the only calls go through the app\'s AI door', async src => {
    const o = open(src);
    await fullRound(o);
    return o.app.__fetches === 0 && !/fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/.test(src) ? true : o.app.__fetches + ' requests';
  }],
  ['IP-12', 'a round with no answer at all asks for one before any feedback call', async src => {
    const o = open(src);
    await o.I.start('ip-ad');
    for (let i = 0; i < 5; i++) { o.answer(''); await o.I.step(1); }
    return o.app.__calls.length === 1 && !o.ad().job_practice ? true : o.app.__calls.length + ' calls';
  }],
  ['IP-16', 'what he typed in the ad\'s own sheet is kept when the practice sheet takes its place', async src => {
    const o = open(src);
    o.app.openEdit('ip-ad');
    const t = o.app.document.getElementById('e_title'); if (!t) return 'no edit sheet';
    t.value = 'Made-up title he just typed';
    await o.I.start('ip-ad');
    return o.ad().title === 'Made-up title he just typed' ? true : o.ad().title;
  }],
  ['IP-17', 'a round left half done is kept on this device and goes on where he stopped', async src => {
    const o = open(src);
    await o.I.start('ip-ad');
    o.answer('Made-up kept answer'); await o.I.step(1);
    const o2 = open(src); o2.app.localStorage = o.app.localStorage;
    vm.runInContext('localStorage = window.localStorage', o2.app);
    const offer = o2.I.blockHTML(o2.ad()).includes('Go on with the practice');
    o2.I.resume('ip-ad'); await o2.I.step(-1);
    return offer && o2.out().includes('Made-up kept answer') ? true : String(offer) + ' ' + o2.out().slice(0, 200);
  }],
  ['IP-18', 'an answer that comes back after he left the sheet keeps the tips on the ad and never takes over another sheet', async src => {
    const o = open(src);
    await o.I.start('ip-ad');
    for (let i = 0; i < 4; i++) { o.answer('Made-up answer ' + i); await o.I.step(1); }
    o.answer('Made-up answer 4');
    o.app.__dom.get('editSheet').innerHTML = '<div id="other">made-up other sheet</div>';
    o.app.__dom.delete && o.app.__dom.delete('ip_out');
    await o.I.retry();
    return !!o.ad().job_practice && !String(o.app.__dom.get('editSheet').innerHTML).includes('Interview practice') ? true : String(o.app.__dom.get('editSheet').innerHTML).slice(0, 200);
  }],
  ['IP-19', 'questions sent as objects are read as their words, and tips that are not objects or that skip a question never land on the wrong answer', async src => {
    const o = open(src, { answers: [JSON.stringify(QUESTIONS.map(q => ({ question: q }))), JSON.stringify([{ n: 2, worked: 'Made-up for two', add: '' }, 'junk', null])] });
    await o.I.start('ip-ad');
    const shown = o.out().includes(QUESTIONS[0]) && !o.out().includes('[object Object]');
    for (let i = 0; i < 5; i++) { o.answer('Made-up answer ' + i); await o.I.step(1); }
    const q = (o.ad().job_practice || {}).questions || [];
    return shown && q.length === 5 && q[1].worked === 'Made-up for two' && q[0].worked === '' ? true : JSON.stringify(q).slice(0, 300);
  }],
  ['IP-20', '"Ask for the feedback again" asks again and keeps his answers', async src => {
    const o = open(src, { answers: [JSON.stringify(QUESTIONS), 'no list here', JSON.stringify(TIPS)] });
    await fullRound(o);
    const failed = o.out().includes('Ask for the feedback again') && o.out().includes('BrianInterview.retry()') && !o.ad().job_practice;
    await o.I.retry();
    const p = o.ad().job_practice || {};
    return failed && o.app.__calls.length === 3 && (p.questions || [])[3] && p.questions[3].a === 'Made-up answer 3' ? true : o.out().slice(0, 200);
  }],
];
const wiring = [
  ['IP-13', 'index.html loads interview-practice.js', () => HTML.includes('<script type="text/brian-later" data-src="interview-practice.js"></script>')],
  ['IP-14', '.gitignore lets the file and this suite into Git', () => { const g = readFileSync(join(root, '.gitignore'), 'utf8').split('\n'); return g.includes('!/interview-practice.js') && g.includes('!/tools/interview-practice-tests.mjs'); }],
  ['IP-15', 'a restore of an older backup keeps the round on the ad (it is one of the job fields)', () => /const JOB_PHONE_FIELDS = \[[^\]]*'job_practice'/.test(HTML)],
];

let pass = 0, fail = 0;
async function run(src) {
  const res = [];
  for (const [id, name, f] of CHECKS) { let r; try { r = await f(src); } catch (e) { r = 'threw ' + e.message; } res.push([id, name, r]); }
  return res;
}
console.log('Interview practice for a saved job ad\n');
for (const [id, name, r] of await run(SRC)) {
  if (r === true) { pass++; console.log('  ok    [' + id + '] ' + name); } else { fail++; console.log('  FAIL  [' + id + '] ' + name + '\n          ' + r); }
}
for (const [id, name, f] of wiring) { if (f()) { pass++; console.log('  ok    [' + id + '] ' + name); } else { fail++; console.log('  FAIL  [' + id + '] ' + name); } }

const BREAKS = [
  ['a copy that sends the whole job record, salary too', s => s.replace("HIS RECORD (roles, skills, certifications; no salary is included by design):\\n${careerProfile()}", "HIS RECORD:\\n${JSON.stringify(db.items.filter(i => i.kind === 'job'))}")],
  ['a copy that sends no advert', s => s.replace('`THE JOB:\\n${ad}\\n\\nHIS RECORD', '`HIS RECORD')],
  ['a copy that keeps nothing on the ad', s => s.replace('    touch(now); save();\n', '')],
  ['a copy that loses his answer on Back', s => s.replace('  if (!run) return false;\n  keepAnswer();\n', '  if (!run) return false;\n')],
  ['a copy that shows a question as markup', s => s.replace('<div class="card"><div class="t">${esc(q.q)}</div></div>', '<div class="card"><div class="t">${q.q}</div></div>')],
  ['a copy that shows a tip as markup', s => s.replace('<b>What worked:</b> ${esc(x.worked)}', '<b>What worked:</b> ${x.worked}')],
  ['a copy that asks without an advert', s => s.replace("  if (!ad){ toast('Check this advert first", "  if (false){ toast('Check this advert first")],
  ['a copy that ignores "don\'t keep"', s => s.replace("  if (typeof aiRefused === 'function' && aiRefused(it)) return false;\n", '')],
  ['a copy that keeps a round from an answer with no questions', s => s.replace("    const qs = (arrayIn(raw) || []).map(q => clip(textOf(q), Q_MAX)).filter(Boolean).slice(0, ROUND);", "    const qs = ((arrayIn(raw) || ['made-up'])).map(q => clip(textOf(q), Q_MAX)).filter(Boolean).slice(0, ROUND);")],
  ['a copy that loses the ad\'s own edits', s => s.replace("  if (typeof keepSheetEdits === 'function') keepSheetEdits(it.id);\n  shownFor = it.id;", "  shownFor = it.id;")],
  ['a copy that keeps no draft of the round', s => s.replace("function draftSave(){ try {", "function draftSave(){ return; try {")],
  ['a copy that draws the tips over another sheet', s => s.replace("    if (box(now.id)) review(now.id, true); else toast('Your interview tips are kept on the ad');", "    review(now.id, true);")],
  ['a copy that shows question objects as they are', s => s.replace("map(q => clip(textOf(q), Q_MAX))", "map(q => clip(q, Q_MAX))")],
  ['a copy that matches tips to answers by place only', s => s.replace("const tipFor = i => list.find(t => Number(t.n) === i + 1) || (list.every(t => t.n == null) ? list[i] : null) || null;", "const tipFor = i => list[i] || null;")],
  ['a copy whose "again" button shows the last question instead', s => s.replace('onclick="BrianInterview.retry()"', 'onclick="BrianInterview.step(0)"')],
  ['a copy that offers no way to read the round again', s => s.replace('<button class="small" onclick="BrianInterview.review(\'${it.id}\')">Read it again</button>', '')],
  ['a copy that asks for feedback on empty answers', s => s.replace("  if (!r.questions.some(x => x.a)){ toast('Answer at least one question first'); return false; }\n", '')],
];
console.log('\nBreaking interview-practice.js on purpose, to see whether the checks notice:');
for (const [name, f] of BREAKS) {
  const broken = f(SRC);
  if (broken === SRC) { fail++; console.log('  FAIL  ' + name + ' — the break did not apply (the code moved; update this break)'); continue; }
  if (process.env.BRIAN_FAST === '1') { pass++; console.log('  fits  ' + name); continue; }
  const by = (await run(broken)).filter(([, , r]) => r !== true).map(([id]) => id);
  if (by.length) { pass++; console.log('  ok    noticed: ' + name + ' (by ' + by.join(', ') + ')'); }
  else { fail++; console.log('  FAIL  not noticed: ' + name); }
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('\nWhat this suite does NOT prove:\n  - how good the real AI\'s questions and tips are\n  - anything on Brian Test or his phone, or the keyboard\'s microphone');
process.exit(fail ? 1 : 0);
