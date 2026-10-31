/* A test suite from Brian, a private planner. It opens the real app with made-up data and does not run from this repository. */
import { readFileSync, writeFileSync, copyFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { runCopy, noticed, missedWhy, FAST, skipBreaks, staleBreaks } from './break-verdict.mjs';
import { loadApp } from './app-sandbox.mjs';

const here = fileURLToPath(import.meta.url);
const root = join(dirname(here), '..');
const workerPath = process.argv[2] ? resolve(process.argv[2]) : join(root, 'proxy', 'worker.js');
const appPath = process.env.JOB_FINDER_APP ? resolve(process.env.JOB_FINDER_APP) : null;
const selfCheck = !process.argv[2] && !appPath;

let pass = 0, fail = 0;
const out = [];
const check = (id, name, cond, detail) => {
  if (cond) { pass++; out.push('  ok    [' + id + '] ' + name); }
  else { fail++; out.push('  FAIL  [' + id + '] ' + name + (detail ? '\n          ' + detail : '')); }
};
async function section(title, body) {
  out.push('\n' + title);
  try { await body(); }
  catch (e) { fail++; out.push('  FAIL  this section could not run to the end — ' + ((e && e.stack) || e)); }
}

/* ---------- the server over a stand-in store, with Anthropic stood in ---------- */
let freshCount = 0;
const freshWorker = async () => (await import(pathToFileURL(workerPath).href + '?copy' + (++freshCount))).default;
function makeKV(opts = {}) {
  const store = new Map();
  return { store, writes: [],
    async get(k) { if (opts.gate && k.startsWith('jobs-find:day:')) await opts.gate; if (opts.slow) for (let n = 0; n < 5; n++) await new Promise(r => setImmediate(r)); if (opts.broken && k.startsWith('jobs-find:day:')) throw new Error('made-up store fault'); return store.has(k) ? store.get(k) : null; },
    async put(k, v) { if (opts.slow) await new Promise(r => setImmediate(r)); this.writes.push(k); store.set(k, v); },
    async delete(k) { store.delete(k); } };
}
const PASS = 'made-up-jobs-passcode';
const envWith = (extra = {}, kv) => Object.assign({ APP_PASSCODE: PASS, ANTHROPIC_API_KEY: 'made-up-key', QUEUE: kv || makeKV() }, extra);
const day = () => new Date().toISOString().slice(0, 10);

const SRC1 = 'https://jobs.example.invalid/made-up-analyst-1';
const SRC2 = 'https://jobs.example.invalid/made-up-planner-2';
const SRC3 = 'https://careers.example.invalid/made-up-lead-3';
const MADE_UP_LINK = 'https://invented.example.invalid/not-from-the-search';
const answerJobs = (jobs, extraSources = []) => ({
  id: 'msg_madeup', type: 'message', role: 'assistant', stop_reason: 'end_turn',
  content: [
    { type: 'text', text: 'Searching for made-up jobs.' },
    { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'made-up analyst jobs' } },
    { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [SRC1, SRC2, SRC3, ...extraSources].map(url => ({ type: 'web_search_result', url, title: 'Made-up advert', encrypted_content: 'x' })) },
    { type: 'text', text: JSON.stringify({ jobs }) },
  ],
  usage: { input_tokens: 21000, output_tokens: 700, server_tool_use: { web_search_requests: 1 } },
});
const GOOD_JOBS = [
  { role: 'Made-up data analyst', company: 'Example Works', place: 'Made-up City', url: SRC1, why: 'It fits your made-up goal of leading analysis.' },
  { role: 'Made-up planner <img src=x onerror=alert(1)>', company: 'Example Shop', place: 'Remote', url: SRC2, why: 'Uses your made-up spreadsheet skill.' },
  { role: 'Made-up invented job', company: 'Nowhere Ltd', place: '', url: MADE_UP_LINK, why: 'Invented.' },
  { role: 'Made-up lead', company: 'Example Group', place: 'Made-up Town', url: SRC3, why: 'A step towards your three-year goal.' },
  { role: 'Made-up repeat', company: 'Example Works', place: '', url: SRC1, why: 'Same link again.' },
];
const anthropicCalls = [];
let anthropicAnswer = () => new Response(JSON.stringify(answerJobs(GOOD_JOBS)), { status: 200 });
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url instanceof Request ? url.url : url);
  anthropicCalls.push({ url: u, headers: Object.assign({}, init.headers || {}), body: init.body });
  if (u !== 'https://api.anthropic.com/v1/messages') throw new Error('unexpected outside call: ' + u.slice(0, 60));
  return anthropicAnswer();
};
const ASK = { goals: 'WHERE I WANT TO BE IN ONE YEAR: Made-up goal: lead a small analysis team', skills: ['Made-up spreadsheet modelling — Good'], where: 'Made-up City' };
const find = (w, env, opts = {}) => w.fetch(new Request('https://server.invalid/jobs/find', {
  method: opts.method || 'POST',
  headers: Object.assign({ 'cf-connecting-ip': '203.0.113.' + (opts.ip || 7), 'content-type': 'application/json' },
    opts.auth === null ? {} : { authorization: opts.auth || ('Bearer ' + PASS) }),
  body: (opts.method || 'POST') === 'GET' ? undefined : JSON.stringify(opts.body === undefined ? ASK : opts.body),
}), env, opts.ctx || { waitUntil() {} });
const asJson = async r => { try { return JSON.parse(await r.text()); } catch (e) { return null; } };

await section('THE SERVER: the job search door, its prompt, its caps and its money', async () => {
  /* JF-1, JF-2 */
  {
    const w = await freshWorker(); const env = envWith(); const before = anthropicCalls.length;
    const r = await find(w, env, { body: Object.assign({}, ASK, { model: 'claude-opus-made-up', max_tokens: 99999, system: 'Made-up injected system', tools: [{ type: 'made-up' }], messages: [{ role: 'user', content: 'Made-up injected' }] }) });
    const j = await asJson(r);
    const c = anthropicCalls[before] || {};
    let sent = {}; try { sent = JSON.parse(c.body); } catch (e) {}
    const tools = sent.tools || [];
    check('JF-1', 'a search is answered 200 and makes exactly one AI call', r.status === 200 && anthropicCalls.length === before + 1, r.status + ' calls ' + (anthropicCalls.length - before));
    check('JF-1', 'with one tool, web search, allowed once', tools.length === 1 && tools[0].type === 'web_search_20250305' && tools[0].max_uses === 1, JSON.stringify(tools));
    check('JF-1', 'on the server\'s own model, prompt and token count, whatever the phone sent',
      sent.model === 'claude-sonnet-5-5' && sent.max_tokens === 4000 && /You find current job adverts/.test(sent.system || '') && !JSON.stringify(sent).includes('injected') && !JSON.stringify(sent).includes('opus'),
      JSON.stringify(sent).slice(0, 200));
    const ask = (((sent.messages || [])[0]) || {}).content || '';
    check('JF-1', 'the question holds the goals, the skills and the place, and nothing else',
      sent.messages && sent.messages.length === 1 && ask === 'MY GOALS:\n' + ASK.goals + '\n\nMY SKILLS:\n- ' + ASK.skills[0] + '\n\nWHERE: Made-up City', JSON.stringify(ask));
    const urls = (j && j.jobs || []).map(x => x.url);
    check('JF-2', 'only adverts whose link the search returned come back, each once', urls.join() === [SRC1, SRC2, SRC3].join() && !JSON.stringify(j).includes('invented.example'), JSON.stringify(urls));
    check('JF-2', 'the answer carries the jobs and how many searches are left, and nothing of the search results', j && j.left === 2 && !JSON.stringify(j).includes('encrypted_content') && !JSON.stringify(j).includes('usage'), JSON.stringify(j).slice(0, 200));
    anthropicAnswer = () => new Response(JSON.stringify(answerJobs(Array.from({ length: 9 }, (_, n) => ({ role: 'Made-up role ' + n + ' ' + 'x'.repeat(300), company: 'Example', url: 'https://jobs.example.invalid/many-' + n, why: 'y'.repeat(900) })),
      Array.from({ length: 9 }, (_, n) => 'https://jobs.example.invalid/many-' + n))), { status: 200 });
    const r2 = await find(w, env); const j2 = await asJson(r2);
    anthropicAnswer = () => new Response(JSON.stringify(answerJobs(GOOD_JOBS)), { status: 200 });
    check('JF-2', 'at most five come back, each line cut to size', j2 && j2.jobs.length === 5 && j2.jobs.every(x => x.role.length <= 120 && x.why.length <= 300), JSON.stringify(j2 && j2.jobs.map(x => x.role.length + '/' + x.why.length)));
  }
  /* JF-3 */
  {
    const w = await freshWorker(); const env = envWith(); const before = anthropicCalls.length;
    const st = [];
    for (let n = 0; n < 4; n++) { const r = await find(w, env); st.push(r.status + ':' + ((await asJson(r)) || {}).left); }
    check('JF-3', 'three searches a day go, and the fourth gets 429 with no call', st.slice(0, 3).join() === '200:2,200:1,200:0' && st[3].startsWith('429') && anthropicCalls.length === before + 3, st.join(','));
    const r4 = await find(w, env); const j4 = await asJson(r4);
    check('JF-3', 'the refusal names the daily job cap, so the phone can say it', j4 && j4.stopped === 'jobs-daily' && j4.left === 0, JSON.stringify(j4));
    const other = await freshWorker();
    const r5 = await find(other, env);
    check('JF-3', 'another running copy of the server refuses too', r5.status === 429 && anthropicCalls.length === before + 3, String(r5.status));
    check('JF-3', 'the count is kept in the store under the UTC day', env.QUEUE.store.get('jobs-find:day:' + day()) === '3', JSON.stringify([...env.QUEUE.store.entries()].filter(([k]) => k.startsWith('jobs'))));
  }
  /* JF-4 */
  {
    const w = await freshWorker(); const env = envWith({}, makeKV({ broken: true })); const before = anthropicCalls.length;
    const r = await find(w, env);
    check('JF-4', 'a store that cannot be read allows no search', r.status === 503 && anthropicCalls.length === before, String(r.status));
  }
  /* JF-5 */
  {
    const w = await freshWorker(); const env = envWith(); const before = anthropicCalls.length;
    anthropicAnswer = () => new Response('{"error":"made-up overload"}', { status: 529 });
    const r = await find(w, env);
    anthropicAnswer = () => { throw new Error('made-up network fault'); };
    const r2 = await find(w, env);
    anthropicAnswer = () => new Response(JSON.stringify(answerJobs(GOOD_JOBS)), { status: 200 });
    check('JF-5', 'a refused or unreachable AI gets 502 and gives the search back', r.status === 502 && r2.status === 502 && anthropicCalls.length === before + 2
      && (env.QUEUE.store.get('jobs-find:day:' + day()) || '0') === '0', r.status + ' ' + r2.status + ' ' + env.QUEUE.store.get('jobs-find:day:' + day()));
    const r3 = await find(w, env); const j3 = await asJson(r3);
    check('JF-5', 'so all three are still there afterwards', r3.status === 200 && j3.left === 2, r3.status + ' ' + JSON.stringify(j3).slice(0, 80));
  }
  /* JF-6 */
  {
    const w = await freshWorker(); const env = envWith({ AI_DAILY_USD: '0.02' }); const before = anthropicCalls.length;
    const r1 = await find(w, env);
    const r = await find(w, env); const j = await asJson(r);
    check('JF-6', 'once a search has spent a two-cent day, the next is refused as the day\'s limit, with no call and no search used',
      r1.status === 200 && r.status === 429 && j && j.stopped === 'ai-daily' && anthropicCalls.length === before + 1 && env.QUEUE.store.get('jobs-find:day:' + day()) === '1',
      r1.status + ' ' + r.status + ' ' + JSON.stringify(j) + ' ' + env.QUEUE.store.get('jobs-find:day:' + day()));
    /* two taps at the same moment: the first holds its guess (about 8 cents) against a 5-cent day before it calls */
    const w2 = await freshWorker(); const env2 = envWith({ AI_DAILY_USD: '0.05' }); const before2 = anthropicCalls.length;
    let open; const gate = new Promise(res => { open = res; });
    anthropicAnswer = async () => { await gate; return new Response(JSON.stringify(answerJobs(GOOD_JOBS)), { status: 200 }); };
    const both = [find(w2, env2), find(w2, env2)];
    for (let k = 0; k < 20; k++) await new Promise(res => setImmediate(res));
    open();
    const st = (await Promise.all(both)).map(x => x.status).sort();
    anthropicAnswer = () => new Response(JSON.stringify(answerJobs(GOOD_JOBS)), { status: 200 });
    check('JF-6', 'two searches at the same moment are held against the ceiling before either calls, so only one goes',
      st.join() === '200,429' && anthropicCalls.length === before2 + 1 && env2.QUEUE.store.get('jobs-find:day:' + day()) === '1', st.join() + ' calls ' + (anthropicCalls.length - before2) + ' count ' + env2.QUEUE.store.get('jobs-find:day:' + day()));
    /* two taps that both pass the first ceiling check before either takes its search: the second is stopped when
       it holds its share and gives its search back (the review of an earlier build showed how to line this up) */
    {
      let openStore; const storeGate = new Promise(res => { openStore = res; });
      const w4 = await freshWorker(); const env4 = envWith({ AI_DAILY_USD: '0.05' }, makeKV({ gate: storeGate })); const before4 = anthropicCalls.length;
      const two = [find(w4, env4), find(w4, env4)];
      for (let k = 0; k < 50; k++) await new Promise(res => setImmediate(res));
      openStore();
      const st4 = (await Promise.all(two)).map(x => x.status).sort();
      check('JF-6', 'a search stopped by the ceiling after it was taken gives it back', st4.join() === '200,429' && anthropicCalls.length === before4 + 1
        && env4.QUEUE.store.get('jobs-find:day:' + day()) === '1', st4.join() + ' count ' + env4.QUEUE.store.get('jobs-find:day:' + day()));
    }
    /* four taps at the same moment on a generous ceiling, over a store as slow as a real one: the day's count is taken one at a time */
    const w3 = await freshWorker(); const env3 = envWith({}, makeKV({ slow: true })); const before3 = anthropicCalls.length;
    const st3 = (await Promise.all([0, 1, 2, 3].map(() => find(w3, env3)))).map(x => x.status).sort();
    check('JF-3', 'four searches at the same moment let exactly three through', st3.join() === '200,200,200,429' && anthropicCalls.length === before3 + 3, st3.join());
  }
  /* JF-7 */
  {
    const w = await freshWorker(); const env = envWith({ AI_OFF: 'on' }); const before = anthropicCalls.length;
    const r = await find(w, env); const j = await asJson(r);
    check('JF-7', 'with the AI switched off a search gets 503 and makes no call', r.status === 503 && j && j.stopped === 'ai-off' && anthropicCalls.length === before, r.status + ' ' + JSON.stringify(j));
    const w2 = await freshWorker(); const env2 = envWith();
    const r2 = await find(w2, env2, { auth: 'Bearer not-the-passcode', ip: 41 });
    const r3 = await find(w2, env2, { auth: null, ip: 42 });
    check('JF-7', 'a wrong or missing passcode gets 401 and makes no call', r2.status === 401 && r3.status === 401 && anthropicCalls.length === before, r2.status + ' ' + r3.status);
  }
  /* JF-8 */
  {
    const w = await freshWorker(); const env = envWith(); const before = anthropicCalls.length;
    const st = [];
    for (const body of [{}, { goals: '', skills: [] }, { skills: 'Made-up not a list' }, [ASK], null, { goals: 42, skills: [7] }])
      st.push((await find(w, env, { body })).status);
    const get = await find(w, env, { method: 'GET' });
    check('JF-8', 'a request without goals or skills, or of another shape or method, is refused with nothing held or called',
      st.every(s => s === 400) && get.status === 405 && anthropicCalls.length === before && !env.QUEUE.store.get('jobs-find:day:' + day()), st.join(',') + ' GET ' + get.status);
  }
  /* JF-9 */
  {
    const said = [];
    const keep = console.log; console.log = (...a) => said.push(a.join(' '));
    const w = await freshWorker(); const env = envWith({ AI_DAILY_USD: '0.11' });
    /* each search here is answered with 21,000 tokens read and 700 written, about 4.9 cents in tokens and 1 cent
       for the web search: two spend 11.8 cents and stop an 11-cent day, and would spend only 9.8 if searches were free */
    const st = [];
    try { for (let n = 0; n < 3; n++) st.push((await find(w, env)).status); } finally { console.log = keep; }
    check('JF-9', 'each search is counted at its tokens plus a cent for its web search, so an 11-cent day takes two and refuses the third',
      st.join() === '200,200,429', st.join());
    check('JF-8', 'nothing on the door writes to the log', !said.some(l => /made-up|jobs/i.test(l)), said.join(' | ').slice(0, 200));
  }
  {
    const w = await freshWorker(); const env = envWith({ AI_OFF: 'on' }); const before = anthropicCalls.length;
    for (let n = 0; n < 20; n++) await find(w, env);
    check('JF-10', 'twenty searches with the AI switched off write nothing to the store and make no call', env.QUEUE.writes.length === 0 && anthropicCalls.length === before, JSON.stringify(env.QUEUE.writes));
    const w2 = await freshWorker(); const env2 = envWith(); const before2 = anthropicCalls.length;
    anthropicAnswer = () => new Response('{"error":"made-up overload"}', { status: 529 });
    const st = [];
    for (let n = 0; n < 30; n++) st.push((await find(w2, env2)).status);
    anthropicAnswer = () => new Response(JSON.stringify(answerJobs(GOOD_JOBS)), { status: 200 });
    const jobWrites = env2.QUEUE.writes.filter(k => k.startsWith('jobs-find'));
    check('JF-10', 'while the AI fails, at most ten requests an hour reach the AI, and the rest are refused before any write',
      st.filter(x => x === 502).length === 10 && st.slice(10).every(x => x === 429) && anthropicCalls.length === before2 + 10 && jobWrites.length <= 21,
      st.join(',') + ' calls ' + (anthropicCalls.length - before2) + ' writes ' + jobWrites.length);
    check('JF-10', 'and none of the day\'s three searches is used by them', (env2.QUEUE.store.get('jobs-find:day:' + day()) || '0') === '0', env2.QUEUE.store.get('jobs-find:day:' + day()));
  }
  {
    const kv = makeKV(); const realGet = kv.get.bind(kv);
    kv.get = async k => (k.startsWith('jobs-find:day:') ? null : realGet(k));
    const w = await freshWorker(); const env = envWith({}, kv); const before = anthropicCalls.length;
    const st = [];
    for (let n = 0; n < 5; n++) st.push((await find(w, env)).status);
    check('JF-11', 'a store that keeps showing no searches still lets only three through in one copy of the server',
      st.join() === '200,200,200,429,429' && anthropicCalls.length === before + 3, st.join());
  }
  {
    const w = await freshWorker(); const env = envWith(); const before = anthropicCalls.length;
    anthropicAnswer = () => new Response(JSON.stringify(Object.assign(answerJobs(GOOD_JOBS), { stop_reason: 'max_tokens' })), { status: 200 });
    const r = await find(w, env); const j = await asJson(r);
    anthropicAnswer = () => new Response(JSON.stringify(answerJobs(GOOD_JOBS)), { status: 200 });
    check('JF-12', 'an answer cut off at its token ceiling is said to be cut off, shows no half list, and its search stays used',
      r.status === 200 && j && j.cut === true && j.jobs.length === 0 && j.left === 2 && anthropicCalls.length === before + 1, r.status + ' ' + JSON.stringify(j));
  }
  {
    const LONG = 'https://jobs.example.invalid/long?' + 'x'.repeat(300), PAREN = 'https://jobs.example.invalid/made-up(role)', QUOTE = "https://jobs.example.invalid/made-up'role";
    const w = await freshWorker(); const env = envWith();
    anthropicAnswer = () => new Response(JSON.stringify(answerJobs([LONG, PAREN, QUOTE, SRC1].map(url => ({ role: 'Made-up link check', company: 'Example', url, why: 'Made-up.' })), [LONG, PAREN, QUOTE])), { status: 200 });
    const j = await asJson(await find(w, env));
    anthropicAnswer = () => new Response(JSON.stringify(answerJobs(GOOD_JOBS)), { status: 200 });
    check('JF-13', 'a link of 300 characters or more, or with a bracket or a quote in it, is not passed on, even when the search returned it',
      j && j.jobs.map(x => x.url).join() === SRC1, JSON.stringify(j && j.jobs.map(x => x.url.slice(0, 50))));
  }
});

/* ---------- the phone ---------- */
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
  const planner = JSON.parse(store['planner.v1']);
  planner.items = planner.items.filter(i => !['job', 'duty', 'skill', 'cert', 'jobad'].includes(i.kind) && !i.pipeline_status);
  store['planner.v1'] = JSON.stringify(planner);
  return store;
}
const SEED = seedPlanner();
const now = new Date().toISOString();
const SALARY = 'Made-up pay 98765';
const YEAR1 = 'Made-up goal: lead a small analysis team';
const YEAR3 = 'Made-up goal: run a made-up planning office';
const WORK = [
  { id: 'jf-j1', title: 'Made-up analyst at Example Works', kind: 'job', type: 'library', area: 'work', job_role: 'Made-up analyst', job_company: 'Example Works Employer', job_start: '2021-03-01', job_salary: SALARY, job_note: 'Made-up achievement: cut reporting time' },
  { id: 'jf-s1', title: 'Made-up spreadsheet modelling', kind: 'skill', type: 'library', area: 'work', skill_type: 'tool', skill_level: 3, skill_note: 'Made-up private skill note' },
  { id: 'jf-s2', title: 'Made-up forbidden skill', kind: 'skill', type: 'library', area: 'work', skill_type: 'tool', skill_level: 2, privacy: 'never' },
  { id: 'jf-c1', title: 'Made-up first-aid certificate', kind: 'cert', type: 'library', area: 'work', cert_status: 'have' },
  { id: 'jf-h1', title: 'Made-up sealed vitamin word', kind: 'note', type: 'library', area: 'ideas', privacy: 'never' },
].map(o => Object.assign({ status: 'open', created: now, updated: now, notes: null, attachments: [] }, o));
const FAKE = 'https://brian.example.invalid';
let opened = 0;
const tmpPhone = mkdtempSync(join(tmpdir(), 'job-finder-tests-'));
function phone(server) {
  const app = loadApp(appPath, { dom: true, seed: JSON.parse(JSON.stringify(SEED)),
    location: { hostname: '127.0.0.1', protocol: 'http:', origin: 'http://127.0.0.1:8765', href: 'http://127.0.0.1:8765/' } });
  vm.runInContext(`bindLabels = enterDialog = exitDialog = function(){}; window.scrollTo = window.scrollTo || function(){}; openSheet = function(){};`, app);
  const said = [];
  app.toast = m => said.push(String(m));
  const db = app.__b.getDb();
  db.items.push(...WORK.map(o => Object.assign({}, o)));
  db.profile = Object.assign(db.profile || {}, { career: { summary: 'Made-up profile summary', next: 'Made-up next wish', year1: YEAR1, year3: YEAR3, notes: [{ id: 'n1', t: 'Made-up brainstorm note', at: now }] } });
  Object.assign(db.settings, { mode: 'proxy', proxyUrl: FAKE, proxyPass: 'made-up-pass' });
  const calls = [];
  app.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, body: String(init.body || '') });
    const a = await server(u.replace(FAKE, ''), init.body ? JSON.parse(init.body) : null);
    return { ok: a.status >= 200 && a.status < 300, status: a.status, json: async () => a.body };
  };
  /* the stand-in page keeps each element apart, so the sheet is read with the answer box the search fills */
  const box = id => (app.__dom.get(id) || {}).innerHTML || '';
  return { app, db, calls, said, el: id => app.document.getElementById(id), sheet: () => box('editSheet') + box('jf_out') };
}
const JOBS_BACK = { jobs: [
  { role: 'Made-up data analyst', company: 'Example Works', place: 'Made-up City', url: SRC1, why: 'It fits your made-up goal.' },
  { role: 'Made-up planner <img src=x onerror=alert(1)>', company: 'Example Shop', place: 'Remote', url: SRC2, why: 'Uses your made-up skill.' },
], left: 2 };
const LINKED = 'Made-up advert text: hiring a made-up data analyst who knows spreadsheets. '.repeat(6);
const MATCH = JSON.stringify({ role: 'Made-up data analyst', company: 'Example Works', have: [{ need: 'Spreadsheets', evidence: 'Made-up spreadsheet modelling' }], missing: [{ need: 'Made-up statistics', close_it: 'A made-up course' }], mention: [], fit: 'Made-up fit sentence.' });
const standIn = (finds = () => ({ status: 200, body: JOBS_BACK })) => (path, body) => {
  if (path === '/jobs/find') return finds(body);
  if (path === '/link') return { status: 200, body: { text: LINKED } };
  if (path === '/sort') return { status: 200, body: { content: [{ type: 'text', text: MATCH }] } };
  throw new Error('unexpected request ' + path);
};
const text = h => ' ' + String(h).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ') + ' ';

await section('THE PHONE: what leaves, what is shown, what is kept', async () => {
  /* JF-20 */
  {
    const p = phone(standIn());
    vm.runInContext(`current = 'all'; allFilter = 'pipeline'; areaTopic = null;`, p.app);
    p.app.render();
    const t = text(p.app.__dom.get('main').innerHTML);
    const a = t.indexOf(' Find jobs for me '), b = t.indexOf(' Match a posting ');
    check('JF-20', 'Applications shows "Find jobs for me" before "Match a posting"', a > 0 && b > a, a + ' ' + b);
  }
  /* JF-21, JF-22 */
  {
    const p = phone(standIn());
    p.app.openJobsFinder();
    const before = p.sheet();
    p.el('jf_where').value = 'Made-up City';
    const ok = await p.app.findJobs();
    const sent = p.calls.filter(c => c.url === FAKE + '/jobs/find');
    let body = {}; try { body = JSON.parse(sent[0].body); } catch (e) {}
    check('JF-21', 'one request goes, to the server\'s job search door', ok === true && p.calls.length === 1 && sent.length === 1, p.calls.map(c => c.url).join());
    check('JF-21', 'it holds exactly the goals, the skills and the place', Object.keys(body).sort().join() === 'goals,skills,where'
      && body.goals.includes(YEAR1) && body.goals.includes(YEAR3) && body.where === 'Made-up City'
      && JSON.stringify(body.skills) === JSON.stringify(['Made-up spreadsheet modelling — ' + vm.runInContext('levelLabel(3)', p.app)]), JSON.stringify(body));
    const leaks = [SALARY, '98765', 'Example Works Employer', 'Made-up analyst', 'achievement', 'first-aid', 'Made-up private skill note', 'Made-up forbidden skill',
      'profile summary', 'next wish', 'brainstorm note'].filter(w => sent[0].body.includes(w));
    check('JF-21', 'never the salary, the roles or employers, an achievement, a certificate, a skill note, a skill marked Don\'t keep, or the profile\'s other texts', !leaks.length, leaks.join(', '));
    check('JF-21', 'the sheet says what is sent before anything is', /Your two goals from the Career profile and 1 skill with their level/.test(text(before)) && /Never your name, salary, job history, notes or CV, except what you wrote in your goals yourself/.test(before), text(before).slice(0, 300));
    const sh = p.sheet();
    check('JF-22', 'the adverts are shown, a role\'s markup escaped, with a link to each', sh.includes('Made-up data analyst') && sh.includes('&lt;img src=x') && !sh.includes('<img src=x')
      && sh.includes('href="' + SRC1 + '"') && sh.includes('rel="noopener noreferrer"'), sh.slice(0, 300));
    const f = p.db.settings.jobsFound;
    check('JF-22', 'the answer is kept on the phone with the place it was for', f && f.jobs.length === 2 && f.where === 'Made-up City' && f.left === 2, JSON.stringify(f).slice(0, 200));
    const n = p.calls.length;
    p.app.openJobsFinder();
    check('JF-22', 'opening the sheet again shows it with no new request', p.calls.length === n && p.sheet().includes('Made-up data analyst') && /2 left today/.test(p.sheet()), String(p.calls.length - n));
    /* a sealed item's words */
    p.db.profile.career.year1 = YEAR1 + ' and Made-up sealed vitamin word';
    await p.app.findJobs();
    const last = p.calls[p.calls.length - 1].body;
    check('JF-21', 'the words of an item that may not reach the AI are sealed', !last.includes('Made-up sealed vitamin word') && last.includes('[kept on this device]'), last.slice(0, 200));
    p.db.profile.career = {}; p.db.items = p.db.items.filter(i => i.kind !== 'skill');
    const m = p.calls.length;
    const none = await p.app.findJobs();
    check('JF-21', 'with no goals and no skills nothing is sent and the sheet says what to add', none === false && p.calls.length === m && /Add your goals in the Career profile/.test(p.sheet()), p.sheet().slice(0, 200));
  }
  /* JF-23 */
  {
    const p = phone(standIn());
    p.app.openJobsFinder();
    await p.app.findJobs();
    const before = p.db.items.length;
    p.app.jobFoundLike(0);
    p.app.jobFoundLike(0);
    const ads = p.db.items.filter(i => i.kind === 'jobad' && i.source_text === SRC1);
    const ad = ads[0] || {};
    check('JF-23', '"I like this" keeps the advert in Applications once, saved, liked, and as a work record that syncs and never reaches the general AI',
      p.db.items.length === before + 1 && ads.length === 1 && ad.pipeline_status === 'saved' && !!ad.job_liked && p.app.privacyOf(ad) === 'synced' && !p.app.mayLeave(ad, 'ai') && ad.area === 'work'
        && ad.title === 'Made-up data analyst — Example Works', JSON.stringify(ad).slice(0, 300));
    check('JF-23', 'nothing else is added and no request is made by it', p.calls.length === 1 && !p.sheet().match(/jobFoundLike\(0\)/), String(p.calls.length));
  }
  /* JF-24 */
  {
    const p = phone(standIn());
    p.app.openJobsFinder();
    await p.app.findJobs();
    const ok = await p.app.jobFoundMatch(1);
    const ad = p.db.items.find(i => i.kind === 'jobad' && i.source_text === SRC2) || {};
    const paths = p.calls.map(c => c.url.replace(FAKE, ''));
    check('JF-24', '"What do I have and miss?" keeps it as a job ad and runs the match on its link, once',
      ok === true && paths.join() === '/jobs/find,/link,/sort' && p.calls[1].body.includes(SRC2) && !!ad.job_match && ad.job_match.fit === 'Made-up fit sentence.'
        && p.app.privacyOf(ad) === 'synced' && !p.app.mayLeave(ad, 'ai'), paths.join() + ' ' + JSON.stringify(ad.job_match || null).slice(0, 120));
    const n = p.db.items.length;
    await p.app.jobFoundMatch(1);
    check('JF-24', 'a second tap keeps no second ad and makes no new call', p.db.items.length === n && p.calls.length === 3, (p.db.items.length - n) + ' ' + p.calls.length);
  }
  /* JF-25 */
  {
    const p = phone(standIn());
    p.app.openJobsFinder();
    await p.app.findJobs();
    p.app.save();
    const sync = JSON.stringify(p.app.syncPayload(p.db)) + JSON.stringify(p.app.buildingExport());
    Object.assign(p.app, { crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob });
    let packed = '';
    p.app.Blob = class { constructor(x){ packed = String(x && x[0]); this.size = packed.length; } };
    p.app.URL = Object.assign({}, p.app.URL || {}, { createObjectURL: () => 'blob:made-up', revokeObjectURL(){} });
    await p.app.exportData();
    if (!packed && /id="recovery_code"/.test(p.app.__dom.get('main').innerHTML)) await p.app.keepRecoveryCode();
    const found = ['jobsFound', 'Made-up data analyst', SRC1].filter(w => sync.includes(w) || packed.includes(w));
    check('JF-25', 'the kept suggestions are in no sync, no Building area door and no backup file', !!packed && !found.length, (packed ? '' : 'no file; ') + found.join(', '));
    const file = JSON.parse(packed);
    file.settings = Object.assign({}, file.settings, { jobsFound: { at: now, where: 'Made-up file place', jobs: [] } });
    p.app.__b.setPending(file);
    p.app.viewSettings();
    vm.runInContext('importSkipDevice = true;', p.app);
    await p.app.confirmImport(true);
    const f = p.app.__b.getDb().settings.jobsFound;
    check('JF-25', 'a restore keeps the phone\'s own suggestions, never a file\'s', f && f.jobs.length === 2 && f.where !== 'Made-up file place', JSON.stringify(f).slice(0, 120) + ' ' + p.said.join(' | '));
  }
  /* JF-26 */
  {
    let n = 0;
    const p = phone(standIn(() => (++n === 1 ? { status: 200, body: JOBS_BACK } : { status: 429, body: { error: 'used', stopped: 'jobs-daily', left: 0 } })));
    p.app.openJobsFinder();
    await p.app.findJobs();
    const ok = await p.app.findJobs();
    const sh = p.sheet();
    check('JF-26', 'when today\'s searches are used, the sheet says so and keeps the earlier answer', ok === false && /used today.s 3 job searches/.test(sh) && sh.includes('Made-up data analyst')
      && p.db.settings.jobsFound.jobs.length === 2, text(sh).slice(0, 200));
    const q = phone(standIn(() => ({ status: 429, body: { error: 'made-up', stopped: 'ai-monthly' } })));
    q.app.openJobsFinder();
    await q.app.findJobs();
    check('JF-26', 'when the server stops the AI on purpose, the sheet says why in the app\'s own words', q.sheet().includes('This month’s AI spending limit is reached'), text(q.sheet()).slice(0, 200));
  }
  {
    const bad = { jobs: [{ role: 'Made-up script link', url: 'javascript:alert(1)' }, { role: 'Made-up long link', url: 'https://jobs.example.invalid/?' + 'x'.repeat(300) },
      { role: 'Made-up bracket link', url: 'https://jobs.example.invalid/a)b' }, JOBS_BACK.jobs[0]], left: 1 };
    const p = phone(standIn(() => ({ status: 200, body: bad })));
    p.app.openJobsFinder();
    await p.app.findJobs();
    const f = p.db.settings.jobsFound;
    check('JF-29', 'the phone keeps only links it can match whole: never a script link, a long one or one with a bracket', f.jobs.length === 1 && f.jobs[0].url === SRC1 && !p.sheet().includes('javascript:'), JSON.stringify(f.jobs.map(x => x.url.slice(0, 40))));
    const q = phone(standIn(() => ({ status: 200, body: { jobs: [], cut: true, left: 2 } })));
    q.app.openJobsFinder();
    await q.app.findJobs();
    check('JF-29', 'an answer that was cut off is said to be cut off, not "nothing found"', /cut off before it was finished/.test(q.sheet()) && !/found no advert/.test(q.sheet()), text(q.sheet()).slice(-200));
  }
  /* JF-27 */
  {
    const p = phone(standIn());
    Object.assign(p.db.settings, { mode: 'direct', apiKey: 'made-up-key', proxyUrl: '', proxyPass: '' });
    p.app.openJobsFinder();
    const ok = await p.app.findJobs();
    check('JF-27', 'without Brian\'s server the phone sends nothing and says why', ok === false && p.calls.length === 0 && p.said.some(m => /needs Brian.s server/.test(m)), p.said.join(' | '));
  }
});

await section('THE PHONE AND THE REAL SERVER TOGETHER', async () => {
  /* JF-28 */
  const w = await freshWorker(); const env = envWith(); const before = anthropicCalls.length;
  const p = phone(async (path, body) => {
    const r = await find(w, env, { body });
    if (path !== '/jobs/find') throw new Error('unexpected ' + path);
    return { status: r.status, body: await asJson(r) };
  });
  p.app.openJobsFinder();
  p.el('jf_where').value = 'Made-up City';
  await p.app.findJobs();
  let sent = {}; try { sent = JSON.parse(anthropicCalls[before].body); } catch (e) {}
  const ask = (((sent.messages || [])[0]) || {}).content || '';
  const f = p.db.settings.jobsFound || { jobs: [] };
  check('JF-28', 'a search reaches the AI once with his goals and skill, and shows only the checked adverts',
    anthropicCalls.length === before + 1 && ask.includes(YEAR1) && ask.includes('Made-up spreadsheet modelling') && !ask.includes(SALARY)
      && f.jobs.map(j => j.url).join() === [SRC1, SRC2, SRC3].join() && f.left === 2, ask.slice(0, 200) + ' ' + JSON.stringify(f.jobs.map(j => j.url)));
});

await section('restoring a backup keeps the answers kept on a job ad', async () => {
  /* JF-30 */
  const p = phone(standIn());
  const KEPT = { at: now, role: 'Made-up role', company: 'Made-up Ltd', have: [], missing: [{ need: 'Made-up kept gap', close_it: '' }], mention: [], fit: 'Made-up kept fit' };
  const ad = { id: 'jf-ad1', title: 'Made-up kept ad', kind: 'jobad', type: 'library', area: 'work', status: 'open', created: now, updated: now, notes: null, attachments: [],
    source_text: SRC1, pipeline_status: 'saved', job_match: KEPT, job_ad_text: 'Made-up kept advert text', job_liked: { why: 'Made-up liked line', at: now } };
  const ad2 = Object.assign({}, ad, { id: 'jf-ad2', title: 'Made-up second ad' });
  p.db.items.push(ad, ad2);
  p.app.save();
  const file = JSON.parse(JSON.stringify(p.app.__b.getDb()));
  delete file.__device;
  for (const i of file.items) if (i.kind === 'jobad') { delete i.job_match; delete i.job_ad_text; delete i.job_liked; }
  file.items.find(i => i.id === 'jf-ad2').job_liked = null;
  p.app.__b.setPending(file);
  p.app.viewSettings();
  await p.app.confirmImport(true);
  const after = p.app.__b.getDb().items;
  const a1 = after.find(i => i.id === 'jf-ad1') || {}, a2 = after.find(i => i.id === 'jf-ad2') || {};
  check('JF-30', 'the restored ad keeps its kept answer, the advert\'s text and the liked line from this phone',
    a1.job_match && a1.job_match.fit === 'Made-up kept fit' && a1.job_ad_text === 'Made-up kept advert text' && a1.job_liked && a1.job_liked.why === 'Made-up liked line'
      && p.app.privacyOf(a1) === 'synced', JSON.stringify(a1).slice(0, 300) + ' ' + p.said.join(' | '));
  check('JF-30', 'a field the file holds, even empty, is the file\'s', a2.job_liked === null && a2.job_match && a2.job_match.fit === 'Made-up kept fit', JSON.stringify(a2.job_liked));
  check('JF-30', 'and the restore made no AI call', p.calls.length === 0, String(p.calls.length));
  const q = phone(standIn());
  const later = new Date(Date.now() + 60000).toISOString();
  q.db.items.push(Object.assign({}, ad, { id: 'jf-ad3' }));
  q.app.save();
  const file2 = JSON.parse(JSON.stringify(q.app.__b.getDb()));
  delete file2.__device;
  const f3 = file2.items.find(i => i.id === 'jf-ad3');
  delete f3.job_match; delete f3.job_ad_text; delete f3.job_liked; f3.updated = later;
  q.app.__b.setPending(file2);
  q.app.viewSettings();
  await q.app.confirmImport(true);
  const a3 = q.app.__b.getDb().items.find(i => i.id === 'jf-ad3') || {};
  check('JF-30', 'a newer copy of the ad in the file is restored as the file has it, with nothing added from the phone', a3.updated === later && !a3.job_liked && !a3.job_match, JSON.stringify(a3).slice(0, 200));
});

const autoAsk = (extra = {}) => Object.assign({}, ASK, { auto: true, day: day() }, extra);
await section('THE SERVER: one search a day by itself, for both his devices, looking past what he saw', async () => {
  /* JF-40 */
  {
    const w = await freshWorker(); const env = envWith(); const before = anthropicCalls.length;
    const r = await find(w, env, { body: autoAsk({ skip: [SRC2, 'not a link at all', 'https://jobs.example.invalid/with space'] }) });
    const j = await asJson(r);
    let sent = {}; try { sent = JSON.parse((anthropicCalls[before] || {}).body); } catch (e) {}
    const ask = (((sent.messages || [])[0]) || {}).content || '';
    check('JF-40', 'the daily search is one AI call like a tap, and the adverts he saw go into the question as links only',
      r.status === 200 && anthropicCalls.length === before + 1 && ask.endsWith('ALREADY SHOWN:\n- ' + SRC2) && !ask.includes('not a link'), r.status + ' ' + JSON.stringify(ask.slice(-160)));
    check('JF-40', 'an advert he was already shown never comes back, even when the AI names it again',
      j && j.jobs.map(x => x.url).join() === [SRC1, SRC3].join(), JSON.stringify(j && j.jobs.map(x => x.url)));
    check('JF-40', 'the prompt tells the AI to leave them out', /ALREADY SHOWN[^\n]*leave them out/.test(sent.system || ''), String(sent.system).slice(-200));
    /* JF-41 */
    const other = await freshWorker(); const n = anthropicCalls.length;
    const r2 = await find(other, env, { body: autoAsk() }); const j2 = await asJson(r2);
    check('JF-41', 'his other device asking the same day gets the same answer with no second AI call and no search used',
      r2.status === 200 && anthropicCalls.length === n && j2 && j2.reused === true && j2.jobs.map(x => x.url).join() === [SRC1, SRC3].join()
        && env.QUEUE.store.get('jobs-find:day:' + day()) === '1', r2.status + ' ' + JSON.stringify(j2).slice(0, 160) + ' calls ' + (anthropicCalls.length - n));
    const r3 = await find(other, env); 
    check('JF-41', 'a tap after it still makes a search of its own', r3.status === 200 && anthropicCalls.length === n + 1, String(r3.status));
  }
  /* JF-42 */
  {
    const w = await freshWorker(); const env = envWith(); const before = anthropicCalls.length;
    const far = new Date(Date.now() + 5 * 86400e3).toISOString().slice(0, 10);
    const r = await find(w, env, { body: autoAsk({ day: far }) });
    const r2 = await find(w, env, { body: autoAsk({ day: 'yesterday' }) });
    const r3 = await find(w, env, { body: autoAsk({ skip: 'https://jobs.example.invalid/x' }) });
    check('JF-42', 'a daily search naming a day far from the server\'s, or no day, or links not as a list, is refused with no call',
      r.status === 400 && r2.status === 400 && r3.status === 400 && anthropicCalls.length === before, [r.status, r2.status, r3.status].join());
  }
  /* JF-43 */
  {
    const w = await freshWorker(); const env = envWith(); const before = anthropicCalls.length;
    anthropicAnswer = () => new Response('{"error":"made-up overload"}', { status: 529 });
    const r = await find(w, env, { body: autoAsk() });
    anthropicAnswer = () => new Response(JSON.stringify(answerJobs(GOOD_JOBS)), { status: 200 });
    const r2 = await find(w, env, { body: autoAsk() }); const j2 = await asJson(r2);
    check('JF-43', 'a daily search that failed forgets the day, so the next opening searches again',
      r.status === 502 && r2.status === 200 && !j2.reused && anthropicCalls.length === before + 2 && env.QUEUE.store.get('jobs-find:day:' + day()) === '1',
      r.status + ' ' + r2.status + ' ' + JSON.stringify(j2).slice(0, 100));
  }
  /* JF-44 */
  {
    const w = await freshWorker(); const env = envWith(); const before = anthropicCalls.length;
    env.QUEUE.store.set('jobs-find:auto:' + day(), JSON.stringify({ running: Date.now() }));
    const r = await find(w, env, { body: autoAsk() }); const j = await asJson(r);
    check('JF-44', 'while the day\'s search is still running on his other device, this one is told to wait, with no call',
      r.status === 200 && j && j.pending === true && anthropicCalls.length === before, r.status + ' ' + JSON.stringify(j));
    env.QUEUE.store.set('jobs-find:auto:' + day(), JSON.stringify({ running: Date.now() - 6 * 60 * 1000 }));
    const r2 = await find(w, env, { body: autoAsk() });
    check('JF-44', 'a running mark older than five minutes is taken as a search that died', r2.status === 200 && anthropicCalls.length === before + 1, String(r2.status));
  }
  /* JF-45 */
  {
    const w = await freshWorker(); const env = envWith(); const before = anthropicCalls.length;
    for (let k = 0; k < 3; k++) await find(w, env);
    const r = await find(w, env, { body: autoAsk() }); const j = await asJson(r);
    check('JF-45', 'the daily search counts in the 3 a day: after three taps it is refused as the day\'s cap, with no call',
      r.status === 429 && j && j.stopped === 'jobs-daily' && anthropicCalls.length === before + 3 && !env.QUEUE.store.has('jobs-find:auto:' + day()), r.status + ' ' + JSON.stringify(j));
    const w2 = await freshWorker(); const env2 = envWith({ AI_OFF: '1' }); const n = anthropicCalls.length;
    const r2 = await find(w2, env2, { body: autoAsk() }); const j2 = await asJson(r2);
    check('JF-45', 'and the AI switch stops it', r2.status !== 200 && j2 && j2.stopped === 'ai-off' && anthropicCalls.length === n, r2.status + ' ' + JSON.stringify(j2));
  }
  {
    const w = await freshWorker(); const env = envWith(); const held = [];
    const r = await find(w, env, { body: autoAsk(), ctx: { waitUntil(p) { held.push(p); } } });
    const settled = held.length ? await held[0] : null;
    check('JF-46', 'the door\'s whole work is handed to waitUntil, so a phone closed during the search still has it counted and kept',
      held.length === 1 && r.status === 200 && settled && settled.status === 200 && JSON.parse(env.QUEUE.store.get('jobs-find:auto:' + day()) || '{}').jobs.length === 3,
      held.length + ' ' + r.status);
  }
  {
    const w = await freshWorker(); const env = envWith(); const before = anthropicCalls.length;
    anthropicAnswer = () => ({ ok: true, status: 200, text: async () => { throw new Error('made-up lost answer'); } });
    const r = await find(w, env, { body: autoAsk() });
    anthropicAnswer = () => new Response(JSON.stringify(answerJobs(GOOD_JOBS)), { status: 200 });
    const r2 = await find(w, env, { body: autoAsk() }); const j2 = await asJson(r2);
    check('JF-47', 'an answer paid for but lost on the way ends the day\'s automatic search, so it is not paid for twice',
      r.status === 502 && r2.status === 200 && j2.reused === true && anthropicCalls.length === before + 1, r.status + ' ' + r2.status + ' ' + JSON.stringify(j2).slice(0, 80));
  }
});

await section('THE PHONE: the switch, Today\'s row, what is new, and the backup', async () => {
  const yesterday = new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
  /* JF-50 */
  {
    const p = phone(standIn());
    const r = await p.app.jobsDailyRun();
    check('JF-50', 'with the switch off, nothing is searched by itself', r === null && p.calls.length === 0, String(r) + ' ' + p.calls.length);
    p.app.openJobsFinder();
    check('JF-50', 'the sheet has the switch, off, and says what it does', /id="jf_daily"/.test(p.sheet()) && !/id="jf_daily" checked/.test(p.sheet())
      && /Search by itself once a day/.test(p.sheet()) && /your phone and computer share that one search/.test(p.sheet()), p.sheet().slice(-600));
  }
  /* JF-51, JF-52 */
  {
    const p = phone(standIn());
    p.db.settings.jobsFound = { at: new Date(Date.now() - 2 * 86400e3).toISOString(), where: 'Made-up City', jobs: [], cut: false };
    p.app.jobsDailySwitch(true);
    await new Promise(r => setImmediate(r));
    const sent = p.calls.filter(c => c.url === FAKE + '/jobs/find');
    let body = {}; try { body = JSON.parse(sent[0].body); } catch (e) {}
    check('JF-51', 'with the switch on, one search goes by itself, marked as the day\'s, for the place he last used',
      sent.length === 1 && body.auto === true && body.day === vm.runInContext('todayISO()', p.app) && body.where === 'Made-up City' && body.goals.includes(YEAR1), JSON.stringify(body).slice(0, 200));
    vm.runInContext('_jobsDailyNext = 0', p.app);
    const again = await p.app.jobsDailyRun();
    check('JF-51', 'and only once that day', again === null && p.calls.length === 1, String(again) + ' ' + p.calls.length);
    vm.runInContext(`current = 'today';`, p.app); p.app.render();
    const t = text(p.app.__dom.get('main').innerHTML);
    check('JF-52', 'Today says "Brian found 2 new jobs for you"', / Brian found 2 new jobs for you /.test(t), t.slice(0, 400));
    p.app.openJobsFinder();
    check('JF-52', 'the sheet marks the new ones and says it came from the daily search', ((p.app.__dom.get('editSheet') || {}).innerHTML.match(/data-job-new/g) || []).length === 2 && /by the daily search/.test(p.sheet()), p.sheet().slice(0, 300));
    p.app.render();
    check('JF-52', 'once he has opened the sheet, the row on Today is gone', !/new jobs? for you/.test(text(p.app.__dom.get('main').innerHTML)), '');
    /* JF-53: the next day the links he saw go along, and an advert seen before is not new */
    p.db.settings.jobsDaily.day = yesterday;
    vm.runInContext('_jobsDailyNext = 0', p.app);
    const back = p.calls.length;
    await p.app.jobsDailyRun();
    let b2 = {}; try { b2 = JSON.parse(p.calls[back].body); } catch (e) {}
    check('JF-53', 'the next day\'s search sends the links he was already shown', JSON.stringify(b2.skip) === JSON.stringify([SRC1, SRC2]), JSON.stringify(b2.skip));
    const f = p.db.settings.jobsFound;
    check('JF-53', 'and an advert he saw before is not counted as new again', f && f.auto && Array.isArray(f.fresh) && f.fresh.length === 0, JSON.stringify(f && f.fresh));
    p.app.render();
    check('JF-53', 'so Today shows no row when nothing is new', !/new jobs? for you/.test(text(p.app.__dom.get('main').innerHTML)), '');
  }
  /* JF-54 */
  {
    let answer = { status: 429, body: { error: 'off', stopped: 'ai-off' } };
    const p = phone(standIn(() => answer));
    p.db.settings.jobsDaily = { on: true };
    await p.app.jobsDailyRun();
    check('JF-54', 'a refusal on purpose (the AI switch) ends the day\'s try', p.db.settings.jobsDaily.day === vm.runInContext('todayISO()', p.app), JSON.stringify(p.db.settings.jobsDaily));
    const q = phone(standIn(() => ({ status: 200, body: { jobs: [], auto: true, pending: true } })));
    q.db.settings.jobsDaily = { on: true };
    const r = await q.app.jobsDailyRun();
    check('JF-54', 'a search still running on his other device leaves the day open for the next opening', r === 'pending' && !q.db.settings.jobsDaily.day, String(r));
    const o = phone(() => { throw new Error('made-up offline'); });
    o.db.settings.jobsDaily = { on: true };
    const r2 = await o.app.jobsDailyRun();
    check('JF-54', 'so does a lost connection', r2 === 'offline' && !o.db.settings.jobsDaily.day, String(r2));
  }
  {
    const p = phone(standIn());
    p.db.settings.jobsFound = { at: new Date(Date.now() - 86400e3).toISOString(), where: null, cut: false,
      jobs: [{ role: 'Made-up old advert', company: 'Example Old', place: '', why: '', url: 'https://jobs.example.invalid/old-one' }] };
    p.app.openJobsFinder();
    p.db.settings.jobsDaily = { on: true };
    await p.app.jobsDailyRun();
    const shown = (p.app.__dom.get('jf_out') || {}).innerHTML || '';
    check('JF-57', 'an open sheet is drawn again at once with the day\'s new list, so a tap cannot keep the wrong advert',
      shown.includes('Made-up data analyst') && !shown.includes('Made-up old advert'), shown.slice(0, 200));
  }
  {
    const o = phone(() => { throw new Error('made-up offline'); });
    o.db.settings.jobsDaily = { on: true };
    for (let k = 0; k < 6; k++) { vm.runInContext('_jobsDailyNext = 0', o.app); await o.app.jobsDailyRun(); }
    check('JF-58', 'a server that keeps failing is asked at most four times a day, then the day ends',
      o.calls.length === 4 && o.db.settings.jobsDaily.day === vm.runInContext('todayISO()', o.app), o.calls.length + ' ' + JSON.stringify(o.db.settings.jobsDaily));
  }
  {
    const p = phone(standIn());
    p.app.openJobsFinder();
    await p.app.findJobs();
    const n = p.calls.length;
    p.app.jobsDailySwitch(true);
    await new Promise(r => setImmediate(r));
    check('JF-59', 'switching the daily search on right after a search of his own spends no second search that day', p.calls.length === n && p.db.settings.jobsDaily.on === true, String(p.calls.length - n));
  }
  /* JF-55 */
  {
    const p = phone(standIn());
    p.db.settings.jobsDaily = { on: true, day: yesterday };
    p.db.settings.jobsSeen = [SRC1];
    p.db.settings.jobsAsked = [{ id: 'j0a1b2c3d', conversation: 'convmadeup', at: '2026-10-27T08:00:00.000Z' }];
    p.app.save();
    Object.assign(p.app, { crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob });
    let packed = '';
    p.app.Blob = class { constructor(x){ packed = String(x && x[0]); this.size = packed.length; } };
    p.app.URL = Object.assign({}, p.app.URL || {}, { createObjectURL: () => 'blob:made-up', revokeObjectURL(){} });
    await p.app.exportData();
    if (!packed && /id="recovery_code"/.test(p.app.__dom.get('main').innerHTML)) await p.app.keepRecoveryCode();
    const sync = JSON.stringify(p.app.syncPayload(p.db));
    check('JF-55', 'the links already shown and the switch stay out of the backup file and the sync', !!packed && !/jobsSeen|jobsDaily/.test(packed) && !packed.includes(SRC1)
      && !/jobsSeen|jobsDaily/.test(sync), packed ? packed.slice(0, 120) : 'no file');
    check('JF-60', 'the jobs Leo asked about on this device stay out of the backup file and the sync (an earlier build)', !!packed && !/jobsAsked|j0a1b2c3d/.test(packed) && !/jobsAsked/.test(sync), packed ? packed.slice(0, 120) : 'no file');
    const file = JSON.parse(packed);
    file.settings = Object.assign({}, file.settings, { jobsSeen: ['https://jobs.example.invalid/from-the-file'], jobsDaily: { on: false }, jobsAsked: [{ id: 'jffffffff', conversation: 'convfile', at: '2026-10-26T08:00:00.000Z' }] });
    p.app.__b.setPending(file);
    p.app.viewSettings();
    vm.runInContext('importSkipDevice = true;', p.app);
    await p.app.confirmImport(true);
    const st = p.app.__b.getDb().settings;
    check('JF-55', 'a restore keeps this device\'s own switch and links, never a file\'s', st.jobsDaily && st.jobsDaily.on === true && JSON.stringify(st.jobsSeen) === JSON.stringify([SRC1]), JSON.stringify([st.jobsDaily, st.jobsSeen]));
    check('JF-60', 'a restore keeps the jobs Leo asked about on this device, never a file\'s', Array.isArray(st.jobsAsked) && st.jobsAsked.length === 1 && st.jobsAsked[0].id === 'j0a1b2c3d', JSON.stringify(st.jobsAsked));
  }
});

await section('WITH THE REAL SERVER: his phone and his computer with the real server', async () => {
  /* JF-56 */
  const w = await freshWorker(); const env = envWith(); const before = anthropicCalls.length;
  const device = () => phone(async (path, body) => {
    if (path !== '/jobs/find') throw new Error('unexpected ' + path);
    const r = await find(w, env, { body });
    return { status: r.status, body: await asJson(r) };
  });
  const a = device(), b = device();
  for (const d of [a, b]) d.db.settings.jobsDaily = { on: true };
  await a.app.jobsDailyRun();
  await b.app.jobsDailyRun();
  const fa = a.db.settings.jobsFound || {}, fb = b.db.settings.jobsFound || {};
  check('JF-56', 'the phone searches once by itself, and the computer opening later shows the same new jobs with no second AI call',
    anthropicCalls.length === before + 1 && (fa.jobs || []).length === 3 && JSON.stringify(fa.jobs) === JSON.stringify(fb.jobs) && (fb.fresh || []).length === 3,
    'calls ' + (anthropicCalls.length - before) + ' ' + JSON.stringify([(fa.jobs || []).length, (fb.jobs || []).length, fb.fresh]));
});

rmSync(tmpPhone, { recursive: true, force: true });
globalThis.fetch = realFetch;
console.log('Job finder tests: "Find jobs for me" on the server and on the phone');
console.log(out.join('\n'));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (!selfCheck) process.exit(fail ? 1 : 0);
if (fail) process.exit(1);

/* ---------- the self-check: break copies on purpose and see that this suite notices ---------- */
const BREAKS = [
  ['the door is not on the list of addresses, so it is never answered', "'/ideas/send', '/jobs/find', '/leo'", "'/ideas/send', '/leo'"],
  ['the door is answered before the passcode check', "    if (url.pathname === '/env' && request.method === 'GET')", "    if (url.pathname === '/jobs/find') return handleJobsFind(request, env, cors);\n    if (url.pathname === '/env' && request.method === 'GET')"],
  ['the door takes the phone\'s tools', "    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: JOBS_FIND_SEARCHES }] };", "    tools: (body && body.tools) || [{ type: 'web_search_20250305', name: 'web_search', max_uses: JOBS_FIND_SEARCHES }] };"],
  ['the door lets the search run without a limit', "name: 'web_search', max_uses: JOBS_FIND_SEARCHES }", "name: 'web_search' }"],
  ['the door allows two searches', 'const JOBS_FIND_SEARCHES = 1;', 'const JOBS_FIND_SEARCHES = 2;'],
  ['the door takes the phone\'s system prompt', "max_tokens: JOBS_MAX_TOKENS, system: JOBS_SYSTEM,", "max_tokens: JOBS_MAX_TOKENS, system: (body && body.system) || JOBS_SYSTEM,"],
  ['the door asks the store before the AI switch, so a refused search still writes', "  const aiStop = await aiRefusal(env);\n  if (aiStop) return reply({ error: aiStop.why, stopped: aiStop.stopped }, aiStop.status);\n  /* counted", "  /* counted"],
  ['the door has no hourly guard', "  if (!(await underCap(env, 'jfh:hour', JOBS_FIND_PER_HOUR - 1)))", "  if (false)"],
  ['the day\'s count trusts the store alone', "    const used = Math.max(_jobsMem.day === day ? _jobsMem.n : 0, stored);", "    const used = stored;"],
  ['a cut-off answer reads as nothing found', "  if (data && data.stop_reason === 'max_tokens') return reply({ jobs: [], found: 0, cut: true, left });\n", ''],
  ['the door passes on long links', "const jobsUrlOk = url => url.length < JOBS_URL_MAX && /", "const jobsUrlOk = url => /"],
  ['the door has no daily cap', "    if (used >= JOBS_FIND_DAILY_CAP) return { full: true, used };", "    if (false) return { full: true, used };"],
  ['the daily cap is five', 'const JOBS_FIND_DAILY_CAP = 3;', 'const JOBS_FIND_DAILY_CAP = 5;'],
  ['the day\'s count is not taken in turn', "{ const p = _jobsChain.then(f, f); _jobsChain = p.catch(() => {}); return p; };", "{ return f(); };"],
  ['a store that cannot be read counts as none used', "    try { stored = parseInt(await env.QUEUE.get(jobsDayKey(day)) || '0', 10) || 0; } catch (e) { return null; }", "    try { stored = parseInt(await env.QUEUE.get(jobsDayKey(day)) || '0', 10) || 0; } catch (e) { stored = 0; }"],
  ['a failed search is not given back', "  if (!upstream.ok) {\n    await jobsFindGiveBack(env, day);\n", "  if (!upstream.ok) {\n"],
  ['a search refused by the ceiling is not given back', "  if (held.stop) {\n    await jobsFindGiveBack(env, day);\n", "  if (held.stop) {\n"],
  ['the door is not held against the AI ceiling', "  const held = await aiReserve(env, guess);\n  if (held.stop)", "  const held = { ticket: { s: await aiSpendState(env), guess: 0 } };\n  if (held.stop)"],
  ['the searches cost nothing', "  cost = tokens + Math.max(reported, ran) * JOBS_SEARCH_USD;", "  cost = tokens;"],
  /* the AI switch is checked twice, at the door and again inside aiReserve, so a break of the first alone changes
     nothing the phone sees; this break takes both away */
  ['the door ignores the AI switch', "  if (aiSwitchedOff(env))\n    return { stopped: 'ai-off'", "  if (false)\n    return { stopped: 'ai-off'"],
  ['the door passes on made-up links', "    if (!jobsUrlOk(url) || !sources.has(url) || seen.has(url) || shown.has(url)) continue;", "    if (!jobsUrlOk(url) || seen.has(url) || shown.has(url)) continue;"],
  ['the door shows every job the AI names', '    if (out.length >= JOBS_SHOWN) break;\n', ''],
  ['the door passes the whole answer on', "  return reply({ jobs, found, left });", "  return reply({ jobs, found, left, answer: data });"],
  ['the door logs what it is asked', "  const sent = JSON.stringify(call);\n", "  const sent = JSON.stringify(call);\n  console.log('jobs ' + ask.slice(0, 60));\n"],
  ['an earlier build: the daily search runs again on his other device', "    if (had && Array.isArray(had.jobs)) return reply(", "    if (false) return reply("],
  ['an earlier build: the daily search does not wait for one already running', "    if (had && had.running && Date.now()", "    if (false && had.running && Date.now()"],
  ['an earlier build: a failed daily search keeps the day', "  const autoForget = async () => { if (autoKey) {", "  const autoForget = async () => { if (false) {"],
  ['an earlier build: the daily search takes any day', "  if (!Number.isFinite(t) || Math.abs(t - Date.now()) > 36 * 3600 * 1000) return null;", "  if (!Number.isFinite(t)) return null;"],
  ['an earlier build: the adverts he saw are not in the question', "    input.skip.length ? 'ALREADY SHOWN:", "    false ? 'ALREADY SHOWN:"],
  ['an earlier build: an advert he saw comes back', " || seen.has(url) || shown.has(url)) continue;", " || seen.has(url)) continue;"],
  ['an earlier build: the door\'s work is not kept alive', "  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(work.catch(() => {}));", ""],
  ['an earlier build: a paid answer lost on the way leaves the day open', "    else if (autoKey) { try {", "    else if (false) { try {"],
  ['an earlier build: the daily search skips the 3 a day', "  const took = await jobsFindTake(env, day);", "  const took = input.auto ? { used: 0 } : await jobsFindTake(env, day);"],
  ['the door takes a request with nothing to search with', "  if (!goals && !skills.length) return null;\n", ''],
];
const PHONE_BREAKS = [
  ['Applications has no "Find jobs for me"', `<button class="small primary" onclick="openJobsFinder()">Find jobs for me</button>\n    `, ''],
  ['the phone sends the whole record the match uses', '  return { goals: seal(careerGoals()), skills, where: seal(jobClip(where, JOBS_WHERE_MAX)), ', '  return { goals: seal(careerGoals()), skills, where: seal(jobClip(where, JOBS_WHERE_MAX)), record: careerProfile(), '],
  ['the phone sends a skill marked Don\'t keep', "  const skills = allSkills().filter(i => mayLeave(i, 'ai-asked'))", '  const skills = allSkills()'],
  ['the phone sends the skill notes', "    .map(s => seal(jobClip(s.title, 120) + ' — ' + levelLabel(s.skill_level)));", "    .map(s => seal(jobClip(s.title, 120) + ' — ' + levelLabel(s.skill_level) + (s.skill_note ? ' — ' + s.skill_note : '')));"],
  ['the phone does not seal what it sends', "  const seal = t => aiSeal(String(t == null ? '' : t), '').system;", "  const seal = t => String(t == null ? '' : t);"],
  ['the phone shows a role unescaped', "${esc(j.role)}${j.company ? ' — ' + esc(j.company) : ''}</div>", "${j.role}${j.company ? ' — ' + esc(j.company) : ''}</div>"],
  ['the phone keeps no answer, so every opening searches again', '  s.jobsFound = { at: new Date().toISOString()', '  s.jobsFoundGone = { at: new Date().toISOString()'],
  ['"I like this" keeps the ad twice', '  const had = jobKeptFor(j.url); if (had) return had;\n', ''],
  ['"I like this" does not mark it liked', "  it.job_liked = it.job_liked || { why: null, at: new Date().toISOString() };\n", ''],
  ['"What do I have and miss?" does not run the match', '  return checkJobAd(it.id);\n}\nfunction likeJobAd', '  return true;\n}\nfunction likeJobAd'],
  ['the backup file carries the suggestions', '  if (out.settings) delete out.settings.jobsFound;\n', ''],
  ['a restore takes the file\'s suggestions', '    if (s0.jobsFound) db.settings.jobsFound = s0.jobsFound; else delete db.settings.jobsFound;\n', ''],
  ['a used-up day reads as a broken search', "    const why = j.stopped === 'jobs-daily' ?", "    const why = false ?"],
  ['the phone sends without Brian\'s server', "  if (!s.proxyUrl || !s.proxyPass){ toast('Finding jobs", "  if (false){ toast('Finding jobs"],
  ['B194 comes back: a restore drops the answers kept on a job ad', "    for (const f of JOB_PHONE_FIELDS) if (!(f in t) && it[f] != null) t[f] = it[f];\n", ''],
  ['the phone keeps any link', "const jobUrlOk = u => u.length < 300 && /^https?:\\/\\/[^\\s<>\"')]+$/i.test(u);", 'const jobUrlOk = u => true;'],
  ['a cut-off answer reads as nothing found on the phone', "  if (!f.jobs.length && f.cut) return", "  if (false) return"],
  ['B194 fixed too far: a newer copy in the file gets the phone\'s fields', "    if (!it || String(it.updated || '') !== String(t.updated || '')) continue;", "    if (!it) continue;"],
  ['B194 fixed too far: a field the file holds empty is overwritten', "if (!(f in t) && it[f] != null) t[f] = it[f];", "if (t[f] == null && it[f] != null) t[f] = it[f];"],
  ['an earlier build: the daily search runs with the switch off', "  if (!s || !jobsDailyOn() || _locked", "  if (!s || _locked"],
  ['an earlier build: the daily search runs at every opening', "  if (s.jobsDaily.day === day || !s.proxyUrl", "  if (!s.proxyUrl"],
  ['an earlier build: the daily search is not marked as the day\'s', "      body: JSON.stringify({ ...ask, auto: true, day }) }); }", "      body: JSON.stringify(ask) }); }"],
  ['an earlier build: the phone sends no seen links', "  const skip = jobsSeen().filter(jobUrlOk).slice(-JOBS_SKIP_SENT);", "  const skip = [];"],
  ['an earlier build: every advert counts as new', "  const fresh = jobs.map(x => x.url).filter(u => !seen.includes(u));", "  const fresh = jobs.map(x => x.url);"],
  ['an earlier build: Today has no row for new jobs', "  { key: 'newjobs', area: 'work', rows: () => jobsNewRows() },", ""],
  ['an earlier build: the row stays after he opened the sheet', "  if (f && f.auto && !f.opened){ f.opened = true; save(); }", ""],
  ['an earlier build: a refusal keeps trying all day', "      if (j.stopped || res.status === 400 || res.status === 401){", "      if (false){"],
  ['an earlier build: a pending search ends the day', "    if (res.ok && j.pending) return 'pending';", "    if (res.ok && j.pending){ s.jobsDaily = { ...s.jobsDaily, day }; save(); return 'pending'; }"],
  ['an earlier build: an open sheet keeps the old list', "    if (box) box.innerHTML = jobsFoundHTML();", ""],
  ['an earlier build: the daily search is tried all day', "  if (tries >= JOBS_DAILY_TRIES){", "  if (false){"],
  ['an earlier build: switching on after his own search spends another', "  if (on && f && !f.auto && dayOfStamp(f.at || '') === todayISO())", "  if (false)"],
  ['an earlier build: the backup carries the jobs Leo asked about', "  if (out.settings) delete out.settings.jobsAsked;\n", ""],
  ['an earlier build: a restore takes the file\'s asked jobs', "['jobsSeen', 'jobsDaily', 'jobsAsked']", "['jobsSeen', 'jobsDaily']"],
  ['an earlier build: the backup carries the seen links', "  if (out.settings){ delete out.settings.jobsSeen; delete out.settings.jobsDaily; }", ""],
  ['an earlier build: a restore takes the file\'s switch', "    for (const k of ['jobsSeen', 'jobsDaily', 'jobsAsked']) if (s0[k]) db.settings[k] = s0[k]; else delete db.settings[k];", ""],
];
const src = readFileSync(workerPath, 'utf8');
const appSrc = readFileSync(join(root, 'index.html'), 'utf8');
if (FAST) {
  const fits = (list, source) => list.map(([name, find, replace]) => [name, source.replace(find, replace) !== source]);
  const stale = staleBreaks([...fits(BREAKS, src), ...fits(PHONE_BREAKS, appSrc)]);
  skipBreaks();
  process.exit(stale ? 1 : 0);
}
let missed = 0;
const tmp = mkdtempSync(join(tmpdir(), 'job-finder-selfcheck-'));
try { copyFileSync(join(dirname(workerPath), 'kinds.js'), join(tmp, 'kinds.js')); } catch (e) {}
try { cpSync(join(dirname(workerPath), 'leo'), join(tmp, 'leo'), { recursive: true }); } catch (e) {}
console.log('\nBreaking the server on purpose, to see whether the job finder tests notice:');
try {
  for (const [name, find, replace] of BREAKS) {
    const broken = src.replace(find, replace);
    if (broken === src) { console.log('  SKIP    ' + name + ' — the break did not apply (the code moved; update this check)'); missed++; continue; }
    const file = join(tmp, 'worker.js');
    writeFileSync(file, broken);
    const r = runCopy([here, file]);
    if (!noticed(r)) { console.log('  MISSED  ' + name + ' — ' + missedWhy(r)); missed++; }
    else console.log('  caught  ' + name);
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
const tmpApp = mkdtempSync(join(tmpdir(), 'job-finder-selfcheck-app-'));
console.log('\nBreaking the phone\'s half on purpose:');
try {
  for (const [name, find, replace] of PHONE_BREAKS) {
    const broken = appSrc.replace(find, replace);
    if (broken === appSrc) { console.log('  SKIP    ' + name + ' — the break did not apply (the code moved; update this check)'); missed++; continue; }
    const file = join(tmpApp, 'index.html');
    writeFileSync(file, broken);
    for (const f of ['dates.js', 'helpers.js', 'store.js', 'merge-core.js']) { try { copyFileSync(join(root, f), join(tmpApp, f)); } catch (e) {} }
    const r = runCopy([here, workerPath], { env: { ...process.env, JOB_FINDER_APP: file } });
    if (!noticed(r)) { console.log('  MISSED  ' + name + ' — ' + missedWhy(r)); missed++; }
    else console.log('  caught  ' + name);
  }
} finally { rmSync(tmpApp, { recursive: true, force: true }); }
console.log(missed ? '\n' + missed + ' break(s) not caught' : '\nEvery break was caught.');
process.exit(missed ? 1 : 0);
