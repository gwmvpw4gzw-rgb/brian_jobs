/* Part of Brian, a private planner. This file is a sample from the job corner and does not run on its own. */
(function(){
"use strict";
const ROUND = 5, ANSWER_MAX = 2000, Q_MAX = 300, TIP_MAX = 600, AD_MAX = 6000;
const DRAFT_KEY = 'brian.interview.v1';
let run = null, busy = false;
/* the round in progress, on this device only; every read and write may fail (a private window) */
function draftSave(){ try { if (run) localStorage.setItem(DRAFT_KEY, JSON.stringify(run)); else localStorage.removeItem(DRAFT_KEY); } catch(e){} }
function draftFor(id){
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    return d && d.id === id && Array.isArray(d.questions) && d.questions.length && d.questions.every(x => x && typeof x.q === 'string') ? d : null;
  } catch(e){ return null; }
}
const textOf = v => typeof v === 'string' ? v : (v && typeof v === 'object' ? (v.question || v.q || v.text || '') : '');

const clip = (v, n) => String(v == null ? '' : v).replace(/\r/g, '').trim().slice(0, n);
const adOf = id => db.items.find(i => i.id === id && i.kind === 'jobad') || null;
/* what the AI reads about the job: the advert's own kept text, or else the saved match */
function adText(it){
  if (it.job_ad_text) return clip(it.job_ad_text, AD_MAX);
  const m = it.job_match;
  if (!m) return '';
  return [m.role ? 'THE ROLE: ' + m.role : null, m.company ? 'THE COMPANY: ' + m.company : null,
    (m.have || []).length ? 'IT ASKS FOR, AND HE HAS:\n' + m.have.map(x => '- ' + x.need).join('\n') : null,
    (m.missing || []).length ? 'IT ASKS FOR, AND HE LACKS:\n' + m.missing.map(x => '- ' + x.need).join('\n') : null].filter(Boolean).join('\n');
}
/* the first JSON array in an answer, or null */
function arrayIn(raw){
  const s = String(raw || ''); const a = s.indexOf('['), b = s.lastIndexOf(']');
  if (a < 0 || b <= a) return null;
  try { const v = JSON.parse(s.slice(a, b + 1)); return Array.isArray(v) ? v : null; } catch(e){ return null; }
}
/* the practice sheet, while it is on screen for this ad */
let shownFor = null;
const box = id => {
  const sh = document.getElementById('editSheet'), b = document.getElementById('ip_out');
  return b && sh && String(sh.innerHTML).includes('id="ip_out"') && (!id || shownFor === id) ? b : null;
};

/* the ad's page: the button, and the last round when there is one */
function blockHTML(it){
  const p = it.job_practice;
  let h = `<div class="section-label">Interview practice</div>`;
  if (draftFor(it.id)) h += `<div class="qa-row"><button class="small primary" onclick="BrianInterview.resume('${it.id}')">Go on with the practice</button></div>`;
  if (p && Array.isArray(p.questions) && p.questions.length){
    h += `<div class="s">Last practised ${esc(fmtDY(dayOfStamp(p.at || '')))}.</div>`
      + `<div class="qa-row" style="margin-top:4px"><button class="small" onclick="BrianInterview.review('${it.id}')">Read it again</button>
      <button class="small primary" onclick="BrianInterview.start('${it.id}')">Practise again</button></div>`;
  } else {
    h += `<div class="qa-row"><button class="small primary" onclick="BrianInterview.start('${it.id}')">Practise the interview</button></div>`;
  }
  return h + `<div class="s">${ROUND} likely questions, your answers in your own words, then what worked and what to add. Two AI calls, never your salary.</div>`;
}
function sheet(it, inner){
  const sh = document.getElementById('editSheet'); if (!sh) return;
  /* what he typed in the ad's own sheet is kept before this sheet takes its place */
  if (typeof keepSheetEdits === 'function') keepSheetEdits(it.id);
  shownFor = it.id;
  sh.innerHTML = `<h2>Interview practice</h2><div class="s">${esc(it.title)}</div><div id="ip_out">${inner}</div>`;
  openSheet('editSheet');
}
/* his tap: the questions are asked for */
async function start(id){
  const it = adOf(id); if (!it) return false;
  if (typeof aiRefused === 'function' && aiRefused(it)) return false;
  if (!aiConfigured()){ toast('Set up AI in Settings first'); return false; }
  const ad = adText(it);
  if (!ad){ toast('Check this advert first, or paste its text, so the questions fit the job'); return false; }
  if (busy){ toast('One at a time'); return false; }
  busy = true;
  sheet(it, `<div class="s" style="margin-top:8px">Thinking of the questions…</div>`);
  try {
    const raw = await aiRequest(
      `You prepare a person for a job interview. Write the ${ROUND} questions this employer is most likely to ask him for this job, in the language of the advert: a mix of questions about the work itself, about his experience, and one about a gap the advert shows against his record, if there is one.
HARD RULES:
- Each question is one or two plain sentences, the way an interviewer says it.
- No question about salary, availability, age, family, health or anything an employer may not ask.
Return ONLY a JSON array of ${ROUND} strings.`,
      `THE JOB:\n${ad}\n\nHIS RECORD (roles, skills, certifications; no salary is included by design):\n${careerProfile()}`, 800);
    const qs = (arrayIn(raw) || []).map(q => clip(textOf(q), Q_MAX)).filter(Boolean).slice(0, ROUND);
    if (!qs.length){ if (box(id)) box(id).innerHTML = `<div class="empty">No questions came back. Try again in a moment.</div>`; return false; }
    run = { id, at: new Date().toISOString(), questions: qs.map(q => ({ q, a: '' })), n: 0 };
    draftSave();
    if (box(id)) ask(); else { toast('The interview questions are ready on the ad'); render(); }
    return true;
  } catch(e){ if (box(id)) box(id).innerHTML = `<div class="empty">The questions could not be made. ${esc(saidWhy(e))}</div>`; return false; }
  finally { busy = false; }
}
/* a round he left half done, from this device's draft */
function resume(id){
  const it = adOf(id), d = draftFor(id); if (!it || !d) return false;
  run = Object.assign(d, { n: Math.min(Math.max(0, d.n | 0), d.questions.length - 1) });
  sheet(it, '');
  ask();
  return true;
}
/* one question on screen, with the box for his answer */
function ask(){
  if (!run || !box(run.id)) return;
  const q = run.questions[run.n];
  box(run.id).innerHTML = `<div class="s" style="margin-top:8px">Question ${run.n + 1} of ${run.questions.length}</div>
    <div class="card"><div class="t">${esc(q.q)}</div></div>
    <textarea id="ip_a" style="width:100%;min-height:120px" maxlength="${ANSWER_MAX}" aria-label="Your answer">${esc(q.a)}</textarea>
    <div class="qa-row" style="margin-top:6px">
      ${run.n > 0 ? `<button class="small ghost" onclick="BrianInterview.step(-1)">Back</button>` : ''}
      <button class="small primary" onclick="BrianInterview.step(1)">${run.n + 1 < run.questions.length ? 'Next question' : 'How did I do?'}</button>
    </div>
    <div class="s">Answer as you would in the room. You can use the keyboard's microphone.</div>`;
}
function keepAnswer(){
  const el = document.getElementById('ip_a');
  if (run && el && box(run.id)) run.questions[run.n].a = clip(el.value, ANSWER_MAX);
  draftSave();
}
function step(d){
  if (!run) return false;
  keepAnswer();
  const next = run.n + d;
  if (next < 0) return false;
  if (next < run.questions.length){ run.n = next; draftSave(); ask(); return true; }
  return feedback();
}
/* after the last answer: one call for what worked and what to add, kept on the ad */
async function feedback(){
  const r = run, it = r && adOf(r.id); if (!it) return false;
  if (!r.questions.some(x => x.a)){ toast('Answer at least one question first'); return false; }
  if (typeof aiRefused === 'function' && aiRefused(it)) return false;
  if (busy){ toast('One at a time'); return false; }
  busy = true;
  const again = `<div class="qa-row"><button class="small primary" onclick="BrianInterview.retry()">Ask for the feedback again</button></div>`;
  if (box(r.id)) box(r.id).innerHTML = `<div class="s" style="margin-top:8px">Reading your answers…</div>`;
  try {
    const raw = await aiRequest(
      `You coach a person after a practice job interview. For each question and his answer, say in the language of his answer what worked, and what to add or change to make it stronger.
HARD RULES:
- Only point him to experience, skills or results that his record states. Never invent a year, a tool, a certification or a result. If his record has nothing for a question, say so honestly and suggest how to answer truthfully.
- Two to four short sentences per answer, plain and specific, kind but honest.
- An empty answer gets a short note on what a good answer would cover from his record.
Return ONLY a JSON array with one object per question, in order, also for a question with no answer: {"n": its number, "worked": "...", "add": "..."}.`,
      `THE JOB:\n${adText(it)}\n\nHIS RECORD (no salary is included by design):\n${careerProfile()}\n\nTHE PRACTICE:\n`
        + r.questions.map((x, i) => `Q${i + 1}: ${x.q}\nHIS ANSWER: ${x.a || '(no answer)'}`).join('\n\n'), 1500);
    /* only real tips count: an object with words; one that names its question by number goes there */
    const list = (arrayIn(raw) || []).filter(t => t && typeof t === 'object' && (typeof t.worked === 'string' || typeof t.add === 'string'));
    const tipFor = i => list.find(t => Number(t.n) === i + 1) || (list.every(t => t.n == null) ? list[i] : null) || null;
    if (!list.length){ if (box(r.id)) box(r.id).innerHTML = `<div class="empty">No feedback came back. Your answers are kept.</div>` + again; return false; }
    const now = adOf(r.id);
    if (!now){ if (box(r.id)) box(r.id).innerHTML = `<div class="empty">This job ad is no longer in Brian, so nothing was kept.</div>`; run = null; draftSave(); return false; }
    now.job_practice = { at: r.at, questions: r.questions.map((x, i) => { const t = tipFor(i);
      return { q: x.q, a: x.a, worked: clip(t && t.worked, TIP_MAX), add: clip(t && t.add, TIP_MAX) }; }) };
    touch(now); save();
    run = null; draftSave();
    /* the sheet is shown again only while he is still on it; otherwise the ad holds the tips */
    if (box(now.id)) review(now.id, true); else toast('Your interview tips are kept on the ad');
    render();
    return true;
  } catch(e){ if (box(r.id)) box(r.id).innerHTML = `<div class="empty">The feedback could not be made. ${esc(saidWhy(e))} Your answers are kept.</div>` + again; return false; }
  finally { busy = false; }
}
/* the kept round, question by question */
function review(id, fresh){
  const it = adOf(id), p = it && it.job_practice; if (!p) return false;
  const h = (Array.isArray(p.questions) ? p.questions : []).filter(x => x && typeof x === 'object').map((x, i) => `<div class="card"><div class="t">${i + 1}. ${esc(x.q)}</div>
    <div class="s" style="white-space:pre-wrap">${x.a ? esc(x.a) : '<i>No answer</i>'}</div>
    ${x.worked ? `<div class="s"><b>What worked:</b> ${esc(x.worked)}</div>` : ''}
    ${x.add ? `<div class="s"><b>What to add:</b> ${esc(x.add)}</div>` : ''}</div>`).join('');
  const inner = (fresh ? `<div class="s" style="margin-top:8px">Kept on this ad, so you can read it again before the interview.</div>` : '')
    + h + `<div class="qa-row" style="margin-top:6px"><button class="small primary" onclick="BrianInterview.start('${it.id}')">Practise again</button></div>`;
  if (fresh && box(id)) box(id).innerHTML = inner; else sheet(it, inner);
  return true;
}

window.BrianInterview = { blockHTML, start, step, review, resume, retry: () => feedback(), _run: () => run };
})();
