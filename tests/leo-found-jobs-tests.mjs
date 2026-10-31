/* A test suite from Brian, a private planner. It opens the real app with made-up data and does not run from this repository. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
globalThis.fetch = async url => { throw new Error('unexpected network call: ' + String(url).slice(0, 60)); };

const TODAY = '2026-10-27';
const PASS = 'test-passcode-not-his';
const cors = { 'Access-Control-Allow-Origin': '*' };
const AUDIO = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]).toString('base64');
const CONV = 'convmadeup000000000081';
const NAMES = 'Madeup Person,Madeupcorp';
const NEW = { id: 'j0a1b2c3d', role: 'Made-up data analyst', company: 'Madeup Bank', place: 'the home city' };
const OLD = { id: 'j11112222', role: 'Made-up product owner', company: 'Madeup Shop', place: 'Brno', asked: true };

function makeKV(init = {}) {
  const store = new Map(Object.entries(init));
  return { store, async get(k) { return store.has(k) ? store.get(k) : null; }, async put(k, v) { store.set(k, v); }, async delete(k) { store.delete(k); } };
}
/* one made-up bug he reported, which the server mentions in a quiet moment unless the answer asked about a job */
const WALKS = JSON.stringify({ walkthroughs: [{ day: '2026-10-26', issues: [{ kind: 'bug', ref: 'Bug 999', state: 'new', title: 'Made-up button too small' }] }] });
const envFor = () => ({ QUEUE: makeKV({ 'build:walkthroughs': WALKS }), APP_PASSCODE: PASS, ALLOWED_ORIGIN: '*', LEO_PRIVATE_NAMES: NAMES });

async function load(dir = join(root, 'proxy')) {
  const at = f => pathToFileURL(join(dir, 'leo', f)).href + '?v=' + Math.random();
  return { jobs: await import(at('found-jobs.mjs')), loop: await import(at('loop.mjs')), instructions: await import(at('instructions.mjs')),
    cards: await import(at('cards.mjs')), address: await import(at('address.mjs')), adapters: await import(at('adapters.mjs')),
    brain: await import(at('brain-fake.mjs')) };
}

async function checks(M) {
  const J = M.jobs;
  const stretch = async (replies, body = {}, opts = {}) => {
    const brain = M.brain.createFakeBrain({ replies });
    const r = await M.loop.runStretch({ env: envFor(), heard: { text: opts.text || 'good morning Leo', words: [] }, history: [],
      body: { today: TODAY, conversation: CONV, ...body }, think: async i => brain.think(i), spendWrite: async () => true, challenge: !!opts.challenge });
    return { r, seen: brain.seen };
  };

  /* FJ-1 */
  const read = J.readFoundJobs([
    { ...NEW, url: 'https://example.invalid/made-up', why: 'made-up reason' },
    { id: 'j55556666', role: 'Analyst at Madeupcorp', asked: true },
    { ...OLD },
    { id: 'j77778888', role: 'x'.repeat(300), asked: true },
    { id: 'j33334444', role: 'A fifth made-up job', asked: true }], ['Madeupcorp']);
  if (read.length !== 3) return 'FJ-1: the checked list is ' + JSON.stringify(read);
  if (JSON.stringify(read[0]) !== JSON.stringify(NEW)) return 'FJ-1: the new job kept more or less than its title, company and place: ' + JSON.stringify(read[0]);
  if (J.readFoundJobs([NEW, { id: 'j99998888', role: 'A second made-up job' }]).length !== 1) return 'FJ-1: two new jobs were kept';
  if (J.readFoundJobs([{ id: 'jnothex00', role: 'Bad id' }, { ...NEW, id: 'J0A1B2C3D' }]).length) return 'FJ-1: a job with a bad id was kept';
  if (read.some(j => /Madeupcorp/.test(JSON.stringify(j)))) return 'FJ-1: a job naming a private name was kept';
  if (read[2].role.length !== 120) return 'FJ-1: a long title was not cut';
  if (J.readFoundJobs('nope').length || J.readFoundJobs([{ id: 'j00000000' }]).length) return 'FJ-1: a job of a bad shape was kept';
  if (read.skipped !== null) return 'FJ-1: an asked job naming a private name was named as a skipped new one';
  const priv = J.readFoundJobs([{ id: 'j55556666', role: 'Analyst at Madeupcorp' }, OLD], ['Madeupcorp']);
  if (priv.skipped !== 'j55556666' || priv.length !== 1) return 'FJ-1: a new job naming a private name is not named back as skipped: ' + JSON.stringify([priv, priv.skipped]);
  const five = J.readFoundJobs([1, 2, 3, 4, 5].map(n => ({ id: 'j0000000' + n, role: 'Made-up job ' + n, asked: true })));
  if (five.length !== 4) return 'FJ-1: more than four jobs were kept: ' + five.length;

  /* FJ-2 */
  const asks = 'Nothing else today. I found a job for you: made-up data analyst at Madeup Bank in the home city. Would you like to go for it?';
  const two = await stretch([asks], { jobs: [NEW] });
  const given = two.seen[0].stretch;
  if (!given.includes(J.FOUND_JOB_NOTE) || !/<tool_answer name="found_job">/.test(given) || !given.includes('Made-up data analyst') || !given.includes('Madeup Bank'))
    return 'FJ-2: the brain was not given the new job with the words to ask: ' + given.slice(0, 400);
  if (/example\.invalid|made-up reason/.test(JSON.stringify(two.seen[0]))) return 'FJ-2: the link or the reason reached the brain';
  if (two.r.jobAsked !== NEW.id) return 'FJ-2: an answer naming the job did not mark it asked: ' + JSON.stringify(two.r.jobAsked);
  if (two.r.quietBug) return 'FJ-2: a reported bug was added after the job';
  if (!(await stretch(['Nothing else today.'], {})).r.quietBug) return 'FJ-2: the made-up reported bug is never mentioned, so the check above proves nothing';
  const byTitle = await stretch(['There is a made-up data analyst job I found for you. Would you like to go for it?'], { jobs: [{ id: NEW.id, role: NEW.role }] });
  if (byTitle.r.jobAsked !== NEW.id) return 'FJ-2: an answer naming the title of a job with no company did not mark it asked';

  const short = await stretch(['I also found you a senior analyst job at Madeup. Interested?'], { jobs: [NEW] });
  if (short.r.jobAsked !== NEW.id) return 'FJ-3: a shortened question did not mark the job asked';
  const czech = await stretch(['Našel jsem pro tebe práci: datový analytik v Madeup Bance v Praze. Chceš to zkusit?'], { jobs: [NEW] });
  if (czech.r.jobAsked !== NEW.id) return 'FJ-3: a Czech question did not mark the job asked';
  const onlyAsked = await stretch(['Fine.'], { jobs: [OLD] });
  if (onlyAsked.r.jobAsked) return 'FJ-3: a job asked before was marked asked again';
  const skip = await stretch(['Fine.'], { jobs: [{ id: 'j55556666', role: 'Analyst at Madeupcorp' }] });
  if (skip.r.jobSkipped !== 'j55556666' || /Madeupcorp/.test(skip.seen[0].stretch)) return 'FJ-3: a skipped job is not named back, or reached the brain';
  const silent = await stretch(['SILENT'], { jobs: [NEW] });
  if (silent.r.jobAsked) return 'FJ-3: a silent answer marked the job asked';
  const none = await stretch(['Madeup Bank is a made-up bank.'], {});
  if (none.r.jobAsked || /FOUND_JOB/.test(none.seen[0].stretch)) return 'FJ-3: a stretch without jobs offered one';

  /* FJ-4 */
  const quiet = await stretch(['SILENT'], { jobs: [NEW, OLD], quiet: true }, { text: 'a made-up idea about a shed' });
  if (/FOUND_JOB|JOBS_ASKED/.test(quiet.seen[0].stretch) || quiet.r.jobAsked) return 'FJ-4: a job was offered in quiet mode';
  const challenged = await stretch(['Madeup Bank, then.'], { jobs: [NEW] }, { challenge: true });
  if (/FOUND_JOB/.test(challenged.seen[0].stretch) || challenged.r.jobAsked) return 'FJ-4: a job was offered in a challenge';
  if (!/JOBS_ASKED/.test((await stretch(['Fine.'], { jobs: [OLD] })).seen[0].stretch)) return 'FJ-4: the jobs asked earlier were not listed';
  const questions = [{ who: 'owner', text: 'I want to build a made-up shed' }, { who: 'leo', text: 'Before we start on Made-up shed, I have one question. How big?' }];
  const brain = M.brain.createFakeBrain({ replies: ['Noted.'] });
  const pending = await M.loop.runStretch({ env: envFor(), heard: { text: 'two metres', words: [] }, history: questions,
    body: { today: TODAY, conversation: CONV, jobs: [NEW] }, think: async i => brain.think(i), spendWrite: async () => true });
  if (/FOUND_JOB/.test(brain.seen[0].stretch) || pending.jobAsked) return 'FJ-4: a job was offered while his answers were awaited';
  const both = await stretch([{ reply: '', toolCalls: [{ id: 't1', name: 'start_interview', input: { project: 'Made-up shed', questions: [{ question: 'How big should the made-up shed be?' }] } },
    { id: 't2', name: 'keep_found_job', input: { id: OLD.id } }] }, 'x'], { jobs: [OLD] }, { text: 'yes and I want to build a made-up shed' });
  if (both.r.cards.some(o => o.card && o.card.target === 'jobs')) return 'FJ-4: a job was kept beside Leo\'s questions';

  /* FJ-5 */
  const call = input => ({ reply: '', toolCalls: [{ id: 't1', name: 'keep_found_job', input }] });
  const yes = await stretch([call({ id: OLD.id }), 'Kept in Applications.'], { jobs: [OLD] }, { text: 'yes I would' });
  const card = yes.r.cards[0] && yes.r.cards[0].card;
  if (!card || card.target !== 'jobs' || card.job !== OLD.id || card.action !== 'add' || card.state !== 'waiting'
    || card.text !== 'I like this job: Made-up product owner at Madeup Shop, Brno') return 'FJ-5: his yes made the card ' + JSON.stringify(yes.r.cards);
  const result = t => JSON.parse(t.seen[1].rounds[0].results[0].content.replace(/^<tool_answer name="[a-z_]+">/, '').replace(/<\/tool_answer>$/, ''));
  const notAsked = await stretch([call({ id: NEW.id }), 'Hm.'], { jobs: [NEW] });
  if (notAsked.r.cards.length || !/Only a job you asked him about/.test(result(notAsked).error || '')) return 'FJ-5: a job never asked about was kept';
  const unknown = await stretch([call({ id: 'j12341234' }), 'Hm.'], { jobs: [OLD] });
  if (unknown.r.cards.length) return 'FJ-5: a job the phone did not send was kept';
  const twice = await stretch([{ reply: '', toolCalls: [{ id: 't1', name: 'keep_found_job', input: { id: OLD.id } }, { id: 't2', name: 'keep_found_job', input: { id: OLD.id } }] }, 'Kept.'], { jobs: [OLD] });
  if (twice.r.cards.length !== 1) return 'FJ-5: the same job was kept twice in one answer';
  const kept = await stretch([call({ id: OLD.id }), 'Kept.'], { jobs: [OLD], cards: [{ number: 1, state: 'confirmed', text: J.jobLine(OLD), action: 'add', target: 'jobs' }] });
  if (kept.r.cards.length) return 'FJ-5: a job a card already kept was kept again';
  const undone = await stretch([call({ id: OLD.id }), 'Kept.'], { jobs: [OLD], cards: [{ number: 1, state: 'dismissed', text: J.jobLine(OLD), action: 'add', target: 'jobs' }] });
  if (undone.r.cards.length !== 1) return 'FJ-5: a job whose card he undid could not be kept again';

  /* FJ-6 */
  const tool = (M.instructions.LEO_TOOLS || []).find(t => t.name === 'keep_found_job');
  if (!tool || !tool.input_schema.required.includes('id')) return 'FJ-6: keep_found_job is not offered';
  const text = String(M.instructions.LEO_INSTRUCTIONS || '');
  if (!/JOBS BRIAN FOUND/.test(text) || !/never ask about two at once/.test(text) || !/Of his work you read only his applications' role, company, stage and dates/.test(text)   /* an earlier build */) return 'FJ-6: Leo is not told how to ask about a found job';

  /* FJ-7 */
  const words = t => t.split(' ').map(x => ({ text: x, lang: 'en' }));
  const leo = M.adapters.createLeo({ ears: 'fake', brain: 'fake', voice: 'fake' }, { ears: { heard: [words('what is on today')] }, brain: { replies: [asks] } });
  const res = await M.address.handleLeo({ kind: 'stretch', audio: AUDIO, today: TODAY, preview: 'made up', history: [], conversation: CONV, jobs: [NEW] }, envFor(), cors,
    { leo, spendWrite: async () => true });
  const out = await res.json();
  if (out.jobAsked !== NEW.id) return 'FJ-7: the answer to the phone does not say which job was asked: ' + JSON.stringify(out).slice(0, 300);
  const leo2 = M.adapters.createLeo({ ears: 'fake', brain: 'fake', voice: 'fake' }, { ears: { heard: [words('what is on today')] }, brain: { replies: ['Fine.'] } });
  const out2 = await (await M.address.handleLeo({ kind: 'stretch', audio: AUDIO, today: TODAY, preview: 'made up', history: [], conversation: CONV,
    jobs: [{ id: 'j55556666', role: 'Analyst at Madeupcorp' }] }, envFor(), cors, { leo: leo2, spendWrite: async () => true })).json();
  if (out2.jobSkipped !== 'j55556666') return 'FJ-7: the answer to the phone does not name the skipped job';
  if (!(J.foundJobsHoldChars([NEW]) > J.FOUND_JOB_NOTE.length) || J.foundJobsHoldChars(null) !== 0) return 'FJ-7: the jobs\' cost is not held';
  return true;
}

test('Leo asks about one found job, and his yes keeps it as liked', async () => {
  assert.equal(await checks(await load()), true);
});

const BREAKS = [
  ['two new jobs reach the brain', 'found-jobs.mjs', '    if (!asked && fresh++ >= 1) continue;\n', ''],
  ['a job naming a private name reaches the brain', 'found-jobs.mjs', "    if (namesLoose(names, role, company, place)) { if (!asked && !out.skipped) out.skipped = j.id; continue; }\n", ''],
  ['the fields are not cut', 'found-jobs.mjs', '.trim().slice(0, FOUND_JOB_LIMITS.field).trim()', '.trim()'],
  ['the brain is not told to ask', 'found-jobs.mjs', "  if (fresh) lines.push(FOUND_JOB_NOTE + '\\n' + quoted(", "  if (fresh) lines.push(quoted("],
  ['a silent answer marks the job asked', 'loop.mjs', ' && !fixedLine && !isSilent(reply)\n', ' && !fixedLine\n'],
  ['a job is offered while his answers are awaited', 'loop.mjs', 'foundJobLines(ctx.foundJobs, !ctx.pending && !challenged);', 'foundJobLines(ctx.foundJobs, !challenged);'],
  ['a job is kept beside Leo\'s questions', 'loop.mjs', "    case 'keep_found_job': {\n      if (ctx.interview) return { error: 'Nothing is saved before he answers your questions.' };\n", "    case 'keep_found_job': {\n"],
  ['a skipped job is not named back', 'loop.mjs', ", ...(ctx.foundJobs.skipped ? { jobSkipped: ctx.foundJobs.skipped } : {})", ''],
  ['address.mjs drops the skipped job', 'address.mjs', "      ...(typeof loop.jobSkipped === 'string' ? { jobSkipped: loop.jobSkipped } : {}),\n", ''],
  ['more than four jobs are read', 'found-jobs.mjs', 'Object.freeze({ list: 4, field: 120 })', 'Object.freeze({ list: 9, field: 120 })'],
  ['an asked job naming a private name is named as skipped', 'found-jobs.mjs', 'if (!asked && !out.skipped) out.skipped = j.id;', 'if (!out.skipped) out.skipped = j.id;'],
  ['a job never asked about is kept', 'found-jobs.mjs', '  const job = jobs.find(j => j.id === id && j.asked);', '  const job = jobs.find(j => j.id === id);'],
  ['the same job is kept twice', 'found-jobs.mjs', '  if (made.has(id) || phoneCards.some(', '  if (phoneCards.some('],
  ['a job a card kept is kept again', 'found-jobs.mjs', " || phoneCards.some(c => c.target === 'jobs' && c.text === jobLine(job) && (c.state === 'waiting' || c.state === 'confirmed'))", ''],
  ['a job whose card he undid is never kept again', 'found-jobs.mjs', " && (c.state === 'waiting' || c.state === 'confirmed'))", ')'],
  ['a job is offered in quiet mode', 'loop.mjs', "  const jobs = hushed ? { lines: '', offered: null } : foundJobLines(", '  const jobs = foundJobLines('],
  ['a job is offered in a challenge', 'loop.mjs', 'foundJobLines(ctx.foundJobs, !ctx.pending && !challenged);', 'foundJobLines(ctx.foundJobs, !ctx.pending);'],
  ['a reported bug follows the job', 'loop.mjs', '  const quietMoment = !jobAsked && firstStretch', '  const quietMoment = firstStretch'],
  ['the loop never says which job was asked', 'loop.mjs', '    ...(jobAsked ? { jobAsked } : {}), ', '    '],
  ['the tool is not run', 'loop.mjs', "    case 'keep_found_job': {", "    case 'keep_found_job_x': {"],
  ['address.mjs drops which job was asked', 'address.mjs', "      ...(typeof loop.jobAsked === 'string' ? { jobAsked: loop.jobAsked } : {}),\n", ''],
  ['the jobs\' cost is not held', 'found-jobs.mjs', '  return n ? FOUND_JOB_NOTE.length', '  return 0 && n ? FOUND_JOB_NOTE.length'],
  ['Leo is not offered the tool', 'instructions.mjs', "  { name: 'keep_found_job',", "  { name: 'keep_found_job_x',"],
  ['Leo is not told to ask one at a time', 'instructions.mjs', 'and never ask about two at once', 'and ask about any'],
];

test('broken copies of the server\'s code are noticed', async () => {
  const fast = process.env.BRIAN_FAST === '1';
  const missed = [];
  for (const [name, file, from, to] of BREAKS) {
    const src = readFileSync(join(root, 'proxy', 'leo', file), 'utf8');
    if (src.split(from).length !== 2) { missed.push(name + ' (the break did not apply)'); continue; }
    if (fast) continue;
    const dir = mkdtempSync(join(tmpdir(), 'leo-b81-'));
    try {
      cpSync(join(root, 'proxy'), dir, { recursive: true });
      writeFileSync(join(dir, 'leo', file), src.replace(from, () => to));
      let r; try { r = await checks(await load(dir)); } catch (e) { r = 'threw ' + e.message; }
      if (r === true) missed.push(name);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  assert.deepEqual(missed, [], 'not noticed: ' + missed.join('; '));
});
