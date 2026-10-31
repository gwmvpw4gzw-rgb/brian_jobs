/* A test suite from Brian, a private planner. It opens the real app with made-up data and does not run from this repository. */
process.env.TZ = 'Europe/Prague';   /* the home time zone; Node reads this change at once */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { loadApp } from './app-sandbox.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = join(root, 'index.html');
const LD = readFileSync(join(root, 'learn-dose.js'), 'utf8');

let pass = 0, fail = 0;
const check = (id, name, cond, detail) => {
  if (cond) { pass++; console.log('  ok    ' + id + ' ' + name); }
  else { fail++; console.log('  FAIL  ' + id + ' ' + name + (detail ? '\n        ' + detail : '')); }
};
const text = h => ' ' + String(h).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ') + ' ';

/* the made-up planner that sample-data/seed.html writes, so the app opens on its screens rather than on the
   passcode screen of a phone that was never set up */
function seedPlanner(){
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
const SEED = seedPlanner();

/* the app with learn-dose.js beside it (unless withFile is false), a clock that can be moved to another
   day, and a toast that is recorded */
function open(withFile = true){
  const app = loadApp(HTML, { dom: true, seed: JSON.parse(JSON.stringify(SEED)),
    location: { hostname: '127.0.0.1', protocol: 'http:', origin: 'http://127.0.0.1:8765', href: 'http://127.0.0.1:8765/' } });
  for (const k of Object.keys(app.__store)) if (/^[A-Z]+$/.test(k)) app.localStorage[k] = app.__store[k];
  const RealDate = vm.runInContext('Date', app);
  const at = iso => { const ms = Date.parse(iso);
    app.Date = class extends RealDate { constructor(...a){ if (a.length) super(...a); else super(ms); } static now(){ return ms; } }; };
  at('2026-10-20T07:00:00Z');   /* 09:00 on a Tuesday in the home time zone */
  vm.runInContext(`bindLabels = enterDialog = exitDialog = function(){}; window.scrollTo = window.scrollTo || function(){};`, app);
  if (withFile) vm.runInContext(LD, app, { filename: 'learn-dose.js' });
  const toasts = [];
  app.toast = m => toasts.push(String(m));
  const db = app.__b.getDb();
  const screen = (cur, filter) => {
    vm.runInContext(`current = ${JSON.stringify(cur)}; allFilter = ${JSON.stringify(filter || 'home')}; areaTopic = null;`, app);
    app.render();
    const html = app.__dom.get('main').innerHTML;
    return { html, text: text(html) };
  };
  return { app, db, at, toasts, screen, L: app.BrianLearnDose, run: code => vm.runInContext(code, app) };
}
const now = '2026-10-19T10:00:00.000Z';
const ad = (id, missing) => ({ id, title: 'Made-up role ' + id + ' at Example Ltd', kind: 'jobad', type: 'library', area: 'work', status: 'open',
  created: now, updated: now, notes: null, attachments: [], job_match: { at: now, have: [], mention: [], fit: '', missing } });
/* makes a gap a learning task for the given month the way he does it, from the Learning plan's own button */
function makeTask(o, need, month){
  o.screen('all', 'learnplan');
  const key = o.run(`learnKey(${JSON.stringify(need)})`);
  o.app.document.getElementById('lp_pick').value = month;
  return o.app.makeLearnTask(key, 'lp_pick');
}
const stepCard = s => (s.html.match(/<div class="card learn-step" data-today="learn-step">[\s\S]*?<\/div><\/div>(?:\s*<div class="qa-row"[\s\S]*?<\/div><\/div>)?/) || [''])[0];
const months = o => o.run('learnMonths()').map(m => m[0]);

console.log('A small study step each day from the Learning plan\n');

try {
  const o = open();
  o.db.items.push(ad('a1', [{ need: 'Made-up <b>statistics</b> modelling', close_it: 'Made-up free course on statistics' },
    { need: 'Made-up forecasting', close_it: '' }]));
  const [m0, m1] = months(o);
  const late = makeTask(o, 'Made-up forecasting', m1);
  const soon = makeTask(o, 'Made-up <b>statistics</b> modelling', m0);
  /* things that are not open learning tasks of the plan, and must never be offered as a step */
  const NOT = [
    { id: 'ls-n1', title: 'Learn: made-up thing typed by hand', kind: 'task', type: 'task', area: 'work', status: 'open', created: now, updated: now },
    { id: 'ls-n2', title: 'Made-up work task', kind: 'task', type: 'task', area: 'work', status: 'open', created: now, updated: now, source_text: 'from the learning plan, missing in 1 saved job ad' },
    { id: 'ls-n3', title: 'Learn: made-up finished gap', kind: 'task', type: 'task', area: 'work', status: 'done', created: now, updated: now, source_text: 'from the learning plan, missing in 1 saved job ad' },
  ];
  o.db.items.push(...NOT.map(x => Object.assign({}, x)));
  check('LS-0', 'the Learning plan made two learning tasks, work records that sync and never reach the general AI', !!soon && !!late && o.app.privacyOf(soon) === 'synced' && !o.app.mayLeave(soon, 'ai'));

  let s = o.screen('today'), c = stepCard(s);
  check('LS-1', 'Today offers one small step for the learning task with the soonest target month, step 1 of 5, under "Learn something today"',
    s.html.split('data-today="learn-step"').length === 2 && c.includes('Find one free introduction to it')
      && text(c).includes('From your learning plan: Made-up <b>statistics</b> modelling · step 1 of 5')
      && s.html.indexOf('Learn something today') >= 0 && s.html.indexOf('Learn something today') < s.html.indexOf('data-today="learn-step"'),
    text(c));
  check('LS-2', 'the gap\'s name and tip are shown as words, never as markup, with "Did it" and "Not today" for that task',
    !c.includes('<b>statistics') && text(c).includes('Tip from your job match: Made-up free course on statistics')
      && c.includes(`BrianLearnDose.stepDid('${soon.id}')">✓ Did it</button>`) && c.includes(`BrianLearnDose.stepSkip('${soon.id}')">Not today</button>`)
      && c.includes(`openEdit('${soon.id}')`), c.slice(0, 600));
  check('LS-3', 'a task typed by hand, an ordinary work task and a learning task already ticked off are never offered',
    NOT.every(n => !o.L.isGap(n)) && !NOT.some(n => s.html.includes(n.id)));
  check('LS-4', '"Learn something today" is shown once, also when the Library row is there too',
    s.html.split('Learn something today').length === 2 && s.html.includes('data-today="learn"') && s.html.indexOf('data-today="learn-step"') < s.html.indexOf('data-today="learn"'));

  const payload0 = JSON.stringify(o.app.syncPayload());
  const stamps0 = JSON.stringify(o.db.items.map(i => [i.id, i.updated, i.status]));
  o.L.stepDid(soon.id);
  s = o.screen('today'); c = stepCard(s);
  const kept = JSON.stringify(o.db.settings.learnSteps || {});
  check('LS-5', '"Did it" counts the step, shows today\'s step ticked with 1 of 5, and says the next one comes tomorrow',
    (o.db.settings.learnSteps || {}).steps && o.db.settings.learnSteps.steps[soon.id] === 1 && text(c).includes('✓ Today\'s study step is done')
      && text(c).includes('1 of 5 steps') && text(c).includes('The next step comes tomorrow.') && !c.includes('stepDid(')
      && o.toasts.at(-1) === 'Step done. The next one comes tomorrow.', text(c) + ' | ' + o.toasts.join(' / '));
  check('LS-6', 'nothing leaves the phone and no task is changed: what syncs is the same, and the step record holds ids and counts, never a gap\'s words',
    JSON.stringify(o.app.syncPayload()) === payload0 && JSON.stringify(o.db.items.map(i => [i.id, i.updated, i.status])) === stamps0
      && !kept.includes('statistics') && !kept.includes('forecasting') && !JSON.stringify(o.app.syncPayload()).includes('learnSteps'));
  o.L.stepDid(soon.id);
  check('LS-7', 'a second tap the same day counts nothing', JSON.stringify(o.db.settings.learnSteps) === kept);
  check('LS-8', 'learn-dose.js asks nothing of the network, the AI or the server',
    !/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|callAI|aiCall|aiRequest|proxyUrl|bridge/i.test(LD.replace(/\/\*[\s\S]*?\*\//g, '')));

  let plan = o.screen('all', 'learnplan');
  check('LS-9', 'the Learning plan shows the progress on each gap: 1 of 5 for the one under way, none yet for the other, with the next step',
    plan.text.includes('●○○○○ 1 of 5 daily steps done. Next on Today: Spend 20 minutes with that introduction.')
      && plan.text.includes('○○○○○ No daily step done yet. Next on Today: Find one free introduction to it')
      && plan.html.includes('aria-label="1 of 5 steps done"') && plan.text.includes('then Today offers one small step for it each day'),
    plan.text.slice(0, 900));

  o.at('2026-10-21T07:00:00Z');
  c = stepCard(o.screen('today'));
  check('LS-10', 'the next day, by the phone\'s own date, step 2 of the same task comes', c.includes('Spend 20 minutes with that introduction') && text(c).includes('step 2 of 5'), text(c));
  o.L.stepSkip(soon.id);
  s = o.screen('today');
  check('LS-11', '"Not today" rests the row for the day and counts nothing', !s.html.includes('data-today="learn-step"')
    && o.db.settings.learnSteps.steps[soon.id] === 1 && o.toasts.at(-1) === 'No study step today. The next one comes tomorrow.');
  o.at('2026-10-22T07:00:00Z');
  check('LS-12', 'and the day after, the same step 2 comes back', text(stepCard(o.screen('today'))).includes('step 2 of 5'));

  for (const [k, day] of ['22', '23', '24', '25'].entries()){
    o.at(`2026-10-${day}T07:00:00Z`);
    o.screen('today');
    o.L.stepDid(soon.id);
    if (k === 3) c = stepCard(o.screen('today'));
  }
  check('LS-13', 'after the fifth step the row says all five are done and to tick the task off, and the task is still not ticked off by itself',
    o.db.settings.learnSteps.steps[soon.id] === 5 && text(c).includes('All 5 steps are done. Tick the task off when you feel ready.')
      && o.db.items.find(i => i.id === soon.id).status !== 'done' && o.toasts.at(-1) === 'All 5 steps are done. Tick the task off when you feel ready.', text(c) + ' | ' + o.toasts.at(-1));
  plan = o.screen('all', 'learnplan');
  check('LS-14', 'the Learning plan shows all five daily steps done for that gap', plan.text.includes('●●●●● All 5 daily steps are done. Tick the task off when you feel ready.'), plan.text.slice(0, 900));
  o.at('2026-10-26T08:00:00Z');
  c = stepCard(o.screen('today'));
  check('LS-15', 'once one gap has had all five steps, the next gap\'s first step comes', text(c).includes('Made-up forecasting · step 1 of 5'), text(c));

  /* he ticks the task off while its step is on screen; the old row's tap then counts nothing */
  const before = JSON.stringify(o.db.settings.learnSteps);
  o.db.items.find(i => i.id === late.id).status = 'done';
  o.L.stepDid(late.id);
  s = o.screen('today'); plan = o.screen('all', 'learnplan');
  check('LS-16', 'a learning task ticked off meanwhile is no longer offered, a tap on its old row counts nothing, and the plan says it is ticked off',
    JSON.stringify(o.db.settings.learnSteps) === before && !s.html.includes('data-today="learn-step"') && plan.text.includes('The learning task is ticked off.'));
} catch (e) { check('ERR', 'a block of checks stopped: ' + (e && e.stack || e), false); }

try {
  const o = open(false);
  o.db.items.push(ad('a2', [{ need: 'Made-up bookkeeping', close_it: '' }]));
  const t = makeTask(o, 'Made-up bookkeeping', months(o)[0]);
  const plan = o.screen('all', 'learnplan'), s = o.screen('today');
  check('LS-17', 'without learn-dose.js the Learning plan still opens with its task, and Today shows no step', !!t && plan.text.includes('A learning task for')
    && !plan.html.includes('learn-progress') && !s.html.includes('data-today="learn-step"'));
} catch (e) { check('ERR', 'a block of checks stopped: ' + (e && e.stack || e), false); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
