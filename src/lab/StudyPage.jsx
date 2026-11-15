import React, { useEffect, useMemo, useRef, useState } from 'react'
import { LabHeader, studyHref } from './LabNav'
import { download, slugOf } from './Studies'
import { exportPackage, saveSession, saveStudy, sessionKeyOf, sessionsOf, workspace } from './workspace'
import { consentDocument, dataFlowStatement, METHODS, newTask, OUTCOMES, participantId, POST_SURVEYS, SOURCES, studyProblems, taskOrder, toRuntimeStudy } from '../research/studyModel'
import { parseFigmaLink } from '../research/figma'
import { studyLink } from '../research/studyLink'
import { readSession } from '../research/Review'

const minutes = sec => Math.round((sec / 60) * 10) / 10
const clock = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`

// One study: plan it, run sessions, get the documents, see the results.
export function StudyPage({ id, tab }) {
  const [study, setStudy] = useState(null)
  const [sessions, setSessions] = useState([])
  const [missing, setMissing] = useState(false)
  const [saveState, setSaveState] = useState('saved')
  const timer = useRef(0)

  const load = async () => {
    const found = await (await workspace()).getStudy(id)
    if (!found) { setMissing(true); return }
    setStudy(found)
    setSessions(await sessionsOf(id))
  }
  useEffect(() => { load() }, [id])

  // Every change is saved shortly after it is made.
  const update = change => {
    setStudy(current => {
      const next = { ...current, ...(typeof change === 'function' ? change(current) : change) }
      clearTimeout(timer.current)
      setSaveState('saving')
      timer.current = setTimeout(async () => { await saveStudy(next); setSaveState('saved') }, 400)
      return next
    })
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  if (missing) return <div className="screen"><LabHeader /><main className="center-note"><h2>This study is not in this browser</h2><p className="muted">It may have been deleted, or created on another computer. Import its package file from the studies page.</p><a className="btn primary" href="#/">Back to studies</a></main></div>
  if (!study) return <div className="screen"><LabHeader /><main className="center-note"><p className="muted">Loading…</p></main></div>

  return <div className="screen">
    <LabHeader study={study} current={tab}><span className="muted small" role="status">{saveState === 'saving' ? 'Saving…' : 'Saved in this browser'}</span></LabHeader>
    <main className="lab-main">
      {tab === 'plan' && <Plan study={study} update={update} />}
      {tab === 'run' && <Run study={study} sessions={sessions} onChanged={load} />}
      {tab === 'documents' && <Documents study={study} update={update} />}
      {tab === 'results' && <Results study={study} sessions={sessions} onChanged={load} />}
    </main>
  </div>
}

function Field({ label, hint, children, htmlFor }) {
  return <label className="field" htmlFor={htmlFor}><span>{label}</span>{children}{hint && <small className="muted">{hint}</small>}</label>
}

function Plan({ study, update }) {
  const problems = studyProblems(study)
  const figma = study.source.kind === 'figma'
  const setTask = (index, change) => update(current => ({ tasks: current.tasks.map((task, at) => (at === index ? { ...task, ...change } : task)) }))
  // Task ids follow their position (T1, T2…), so reports line up across studies.
  const renumber = tasks => tasks.map((task, index) => ({ ...task, id: `T${index + 1}` }))
  const move = (index, step) => update(current => {
    const tasks = [...current.tasks]
    const [task] = tasks.splice(index, 1)
    tasks.splice(index + step, 0, task)
    return { tasks: renumber(tasks) }
  })
  const frameInput = value => parseFigmaLink(value)?.nodeId || value.trim() || null
  const order = study.counterbalance ? [0, 1, 2].map(index => taskOrder(study, index).join(' → ')) : null

  return <div className="lab-columns">
    <section className="lab-form">
      <span className="kicker">Plan</span>
      <h1>{study.title || 'New study'}</h1>
      <div className="panel lab-panel">
        <Field label="Study title" htmlFor="study-title"><input id="study-title" value={study.title} maxLength={120} placeholder="Course registration redesign, round 1" onChange={event => update({ title: event.target.value })} /></Field>
        <fieldset className="choice"><legend>How sessions run</legend>
          {Object.entries(METHODS).map(([value, label]) => <label key={value} className="check"><input type="radio" name="method" checked={study.method === value} onChange={() => update({ method: value })} />{label}</label>)}
          <small className="muted">{study.method === 'moderated' ? 'You sit with the participant and run the session from this computer: task script, timer, outcomes and quick notes. Nothing needs to be sent back.' : 'You send a link; participants do the tasks alone and send you their results file, which you add under Results.'}</small>
        </fieldset>
        <fieldset className="choice"><legend>What participants use</legend>
          {Object.entries(SOURCES).map(([value, label]) => <label key={value} className="check"><input type="radio" name="source" checked={study.source.kind === value} onChange={() => update(current => ({ source: value === 'figma' ? { kind: 'figma', ...(current.source.kind === 'figma' ? current.source : {}) } : { kind: value } }))} />{label}</label>)}
          {study.source.kind === 'none' && <small className="muted">Use it for anything: a live website, a mobile app, a ProtoPie or Axure prototype, even paper. You observe and note; the times, outcomes and ratings are recorded here.</small>}
        </fieldset>
        {figma && <>
          <Field label="Figma prototype link" hint="In Figma: Present, then Share prototype, then Copy link." htmlFor="figma-link"><input id="figma-link" defaultValue={study.source.figma?.fileKey ? `https://www.figma.com/proto/${study.source.figma.fileKey}/${encodeURIComponent(study.source.figma.name || 'Prototype')}${study.source.figma.startNodeId ? `?node-id=${study.source.figma.startNodeId.replace(':', '-')}` : ''}` : ''} placeholder="https://www.figma.com/proto/…" onChange={event => {
            const parsed = parseFigmaLink(event.target.value)
            // The client ID is kept when the link changes or is not valid yet.
            update(current => ({ source: { kind: 'figma', figma: parsed?.fileKey ? { ...current.source.figma, fileKey: parsed.fileKey, name: parsed.name, startNodeId: parsed.startNodeId || parsed.nodeId } : { ...current.source.figma, fileKey: null } } }))
          }} /></Field>
          <Field label="Figma client ID" hint={study.method === 'unmoderated' ? 'Needed so clicks and screens reach the results. Create an app in Figma’s developer settings and allow this site as an embed origin.' : 'Optional when moderating: without it the prototype still shows, but clicks and screens are not recorded automatically.'} htmlFor="figma-client"><input id="figma-client" value={study.source.figma?.clientId || ''} onChange={event => update(current => ({ source: { ...current.source, figma: { ...current.source.figma, clientId: event.target.value.trim() } } }))} /></Field>
        </>}
      </div>

      <h2 className="lab-h2">Tasks</h2>
      {study.tasks.map((task, index) => <fieldset key={index} className="panel lab-panel task-edit">
        <legend>Task {index + 1}</legend>
        <Field label="What the participant reads" htmlFor={`task-${index}-prompt`}><textarea id={`task-${index}-prompt`} rows={2} maxLength={300} value={task.prompt} placeholder="You want to drop a course you registered for. Find out the last day to drop it without a penalty." onChange={event => setTask(index, { prompt: event.target.value })} /></Field>
        <Field label="Success looks like (for you)" hint="Write it before the sessions, so you judge every participant the same way." htmlFor={`task-${index}-success`}><input id={`task-${index}-success`} value={task.success || ''} placeholder="Names the correct date, 15 November" onChange={event => setTask(index, { success: event.target.value })} /></Field>
        {figma && <div className="field-row">
          <Field label="Start frame (optional)" htmlFor={`task-${index}-start`}><input id={`task-${index}-start`} value={task.start || ''} placeholder="Frame link or node id" onChange={event => setTask(index, { start: frameInput(event.target.value) })} /></Field>
          <Field label="Goal frame (optional)" hint="Reaching it completes the task automatically." htmlFor={`task-${index}-goal`}><input id={`task-${index}-goal`} value={task.successPage || ''} placeholder="Frame link or node id" onChange={event => setTask(index, { successPage: frameInput(event.target.value) })} /></Field>
        </div>}
        <div className="field-row">
          <Field label="Time limit (minutes)" htmlFor={`task-${index}-limit`}><input id={`task-${index}-limit`} type="number" min="0.5" max="60" step="0.5" value={minutes(task.limitSec)} onChange={event => setTask(index, { limitSec: Math.round(Number(event.target.value) * 60) })} /></Field>
          <div className="actions task-tools">
            <button className="btn ghost small-btn" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move task ${index + 1} up`}>↑</button>
            <button className="btn ghost small-btn" disabled={index === study.tasks.length - 1} onClick={() => move(index, 1)} aria-label={`Move task ${index + 1} down`}>↓</button>
            {study.tasks.length > 1 && <button className="btn ghost small-btn" onClick={() => update(current => ({ tasks: renumber(current.tasks.filter((_, at) => at !== index)) }))}>Remove</button>}
          </div>
        </div>
      </fieldset>)}
      {study.tasks.length < 12 && <button className="btn secondary" onClick={() => update(current => ({ tasks: [...current.tasks, newTask(current.tasks.length + 1)] }))}>Add a task</button>}

      <h2 className="lab-h2">Questions and design</h2>
      <div className="panel lab-panel">
        <label className="check" htmlFor="ask-seq"><input id="ask-seq" type="checkbox" checked={study.questionnaire.seq} onChange={event => update(current => ({ questionnaire: { ...current.questionnaire, seq: event.target.checked } }))} />Ask the Single Ease Question (1–7) after each task</label>
        <fieldset className="choice"><legend>After the last task</legend>
          {Object.entries(POST_SURVEYS).map(([value, label]) => <label key={value} className="check"><input type="radio" name="post" checked={study.questionnaire.post === value} onChange={() => update(current => ({ questionnaire: { ...current.questionnaire, post: value } }))} />{label}</label>)}
        </fieldset>
        <label className="check" htmlFor="counterbalance"><input id="counterbalance" type="checkbox" checked={study.counterbalance} disabled={study.tasks.length < 2} onChange={event => update({ counterbalance: event.target.checked })} />Counterbalance the task order (Williams Latin square)</label>
        {order && <small className="muted">Each participant gets a different order, so learning from one task does not always help the same next task. P01: {order[0]} · P02: {order[1]} · P03: {order[2]}…</small>}
        <Field label="Planned participants" hint="5 participants find most of the big problems in one round; 8 or more give steadier numbers." htmlFor="planned"><input id="planned" type="number" min="1" max="100" value={study.plannedParticipants} onChange={event => update({ plannedParticipants: Math.max(1, Math.min(100, Math.round(Number(event.target.value) || 1))) })} /></Field>
      </div>
    </section>
    <aside className="lab-side">
      <div className="panel lab-panel sticky">
        <span className="kicker">Ready to run?</span>
        {problems.length ? <ul className="problems">{problems.map(problem => <li key={problem}>{problem}</li>)}</ul> : <p>Everything needed is filled in.</p>}
        <a className={`btn ${problems.length ? 'ghost' : 'primary'}`} href={studyHref('study', study.id, 'run')}>Go to Run</a>
        <a className="btn ghost" href={studyHref('study', study.id, 'documents')}>Consent and ethics documents</a>
      </div>
    </aside>
  </div>
}

function Run({ study, sessions, onChanged }) {
  const problems = studyProblems(study)
  const done = sessions.filter(session => !session.pilot)
  const byParticipant = new Map(done.map(session => [session.participant, session]))
  const slots = Array.from({ length: Math.max(study.plannedParticipants, done.length) }, (_, index) => participantId(index))
  const next = slots.findIndex(code => !byParticipant.has(code))
  const [importNote, setImportNote] = useState('')
  const runtimeLink = useMemo(() => {
    if (study.method !== 'unmoderated' || problems.length) return null
    if (study.source.kind === 'demo') return { url: new URL('research.html', location.href).href, note: 'The link runs the built-in demo tasks.' }
    try { return { url: studyLink(toRuntimeStudy(study), new URL('research.html', location.href).href.split('?')[0]) } } catch (error) { return { error: error.message } }
  }, [study, problems.length])
  const importResults = async files => {
    const notes = []
    for (const file of files) {
      try {
        const session = readSession(await file.text())
        await saveSession(study.id, session)
        notes.push(`${file.name}: added as ${session.participant}`)
      } catch (problem) { notes.push(`${file.name}: ${problem instanceof SyntaxError ? 'not valid JSON' : problem.message}`) }
    }
    setImportNote(notes.join(' · '))
    onChanged()
  }

  return <div className="lab-columns">
    <section className="lab-form">
      <span className="kicker">Run</span>
      <h1>{study.method === 'moderated' ? 'Moderated sessions' : 'Unmoderated sessions'}</h1>
      {problems.length > 0 && <div className="warning banner-box" role="alert"><b>Finish the plan first:</b><ul>{problems.map(problem => <li key={problem}>{problem}</li>)}</ul><a href={studyHref('study', study.id, 'plan')}>Go to Plan</a></div>}
      {study.method === 'moderated' && <>
        <p className="lede">Sit with the participant at this computer. Start with a pilot session on yourself to rehearse; pilots are kept out of the report.</p>
        <div className="actions">
          <a className={`btn primary ${problems.length ? 'is-disabled' : ''}`} aria-disabled={problems.length > 0} href={problems.length || next < 0 ? undefined : studyHref('run', study.id, String(next))}>{next < 0 ? 'All planned sessions done' : `Start session ${participantId(next)}`}</a>
          <a className={`btn ghost ${problems.length ? 'is-disabled' : ''}`} aria-disabled={problems.length > 0} href={problems.length ? undefined : studyHref('run', study.id, 'pilot')}>Run a pilot</a>
        </div>
        <ol className="slots">
          {slots.map((code, index) => {
            const session = byParticipant.get(code)
            return <li key={code} className={`panel slot ${session ? 'is-done' : ''}`}>
              <b className="mono">{code}</b>
              <span className="muted small">{study.counterbalance ? taskOrder(study, index).join(' → ') : `${study.tasks.length} tasks`}</span>
              {session
                ? <><span className="chip live">DONE · {new Date(session.startedAt).toLocaleDateString()}</span><a className="btn ghost small-btn" href={studyHref('review', study.id, sessionKeyOf(study.id, session))}>Review</a></>
                : <a className="btn ghost small-btn" href={problems.length ? undefined : studyHref('run', study.id, String(index))}>Start</a>}
            </li>
          })}
        </ol>
      </>}
      {study.method === 'unmoderated' && <>
        <p className="lede">Send this link. Each participant downloads a results file at the end and sends it to you; add the files below.</p>
        {runtimeLink?.url && <div className="panel lab-panel"><span className="kicker">Participant link</span><p className="mono small setup-url">{runtimeLink.url}</p>{runtimeLink.note && <small className="muted">{runtimeLink.note}</small>}<div className="actions"><button className="btn primary" onClick={() => navigator.clipboard?.writeText(runtimeLink.url)}>Copy link</button><a className="btn ghost" href={runtimeLink.url} target="_blank" rel="noopener">Try it</a></div></div>}
        {runtimeLink?.error && <p className="warning">{runtimeLink.error}</p>}
        <div className="panel lab-panel">
          <span className="kicker">Results files</span>
          <label className="btn secondary file-button" htmlFor="add-results">Add results files<input id="add-results" type="file" multiple accept="application/json,.json" onChange={event => { const files = [...event.target.files]; event.target.value = ''; if (files.length) importResults(files) }} /></label>
          {importNote && <p className="muted small" role="status">{importNote}</p>}
          <p className="muted small">{done.length} of {study.plannedParticipants} received.</p>
        </div>
      </>}
    </section>
    <aside className="lab-side">
      <div className="panel lab-panel sticky">
        <span className="kicker">Moderating tips</span>
        <ul className="tips">
          <li>Read each task aloud, then let them work. Ask them to think aloud.</li>
          <li>Don’t help unless they are stuck for a while; log any help with A (assist).</li>
          <li>Notes: N note, P problem, Q quote, A assist, E error. Add #tags to group them across participants.</li>
          <li>Outcomes: 1 success, 2 partial, 3 failed or gave up, 4 skip.</li>
        </ul>
      </div>
    </aside>
  </div>
}

function Documents({ study, update }) {
  const c = study.consent
  const set = change => update(current => ({ consent: { ...current.consent, ...change } }))
  const consent = consentDocument(study)
  const dataFlow = dataFlowStatement(study)
  const field = (key, label, placeholder, hint) => <Field label={label} hint={hint} htmlFor={`consent-${key}`}><input id={`consent-${key}`} value={c[key] ?? ''} placeholder={placeholder} onChange={event => set({ [key]: event.target.value })} /></Field>
  return <div className="lab-columns">
    <section className="lab-form">
      <span className="kicker">Documents</span>
      <h1>Consent and ethics</h1>
      <p className="lede">Fill these in once; the consent form and the data management statement update from your study settings. They are drafts with the elements TCPS 2 asks for: adapt them to your ethics board’s template.</p>
      <div className="panel lab-panel">
        {field('researcher', 'Researcher', 'Your name')}
        {field('institution', 'Institution', 'University of Ottawa')}
        {field('contact', 'Contact', 'Email')}
        {field('supervisor', 'Supervisor (for student studies)', 'Name and email')}
        {field('purpose', 'Purpose, completing “The purpose is…”', 'to find out how easily students can drop a course online')}
        <div className="field-row">
          <Field label="Session length (minutes)" htmlFor="consent-duration"><input id="consent-duration" type="number" min="5" max="240" value={c.durationMin} onChange={event => set({ durationMin: Number(event.target.value) || 30 })} /></Field>
          {field('compensation', 'Compensation', 'There is no compensation for taking part.')}
        </div>
        {field('retention', 'How long data are kept', '12 months after the study ends')}
        <div className="field-row">
          {field('ethicsBoard', 'Research ethics board and contact', 'uOttawa Office of Research Ethics and Integrity, ethics@uottawa.ca')}
          {field('ethicsNumber', 'Ethics file number', 'If approved')}
        </div>
      </div>
    </section>
    <aside className="lab-side">
      <div className="panel lab-panel">
        <span className="kicker">Consent form (draft)</span>
        <pre className="doc-preview">{consent}</pre>
        <div className="actions"><button className="btn primary" onClick={() => download(consent, `${slugOf(study.title)}-consent.md`, 'text/markdown')}>Download (.md)</button></div>
      </div>
      <div className="panel lab-panel">
        <span className="kicker">Data management statement</span>
        <pre className="doc-preview">{dataFlow}</pre>
        <div className="actions"><button className="btn secondary" onClick={() => download(dataFlow, `${slugOf(study.title)}-data-management.md`, 'text/markdown')}>Download (.md)</button></div>
      </div>
    </aside>
  </div>
}

function Results({ study, sessions, onChanged }) {
  const [confirming, setConfirming] = useState(null)
  const remove = async session => {
    await (await workspace()).deleteSession(sessionKeyOf(study.id, session))
    setConfirming(null)
    onChanged()
  }
  const summary = session => {
    const counts = {}
    session.tasks.forEach(task => { if (task.outcome) counts[task.outcome] = (counts[task.outcome] || 0) + 1 })
    return Object.entries(counts).map(([outcome, count]) => `${count} ${(OUTCOMES[outcome] || outcome).toLowerCase()}`).join(' · ')
  }
  return <div className="lab-columns">
    <section className="lab-form">
      <span className="kicker">Results</span>
      <h1>{sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}</h1>
      <div className="actions">
        <a className={`btn primary ${sessions.length ? '' : 'is-disabled'}`} href={sessions.length ? studyHref('report', study.id) : undefined}>Open the study report</a>
        <button className="btn ghost" onClick={async () => download(JSON.stringify(await exportPackage([study.id])), `${slugOf(study.title)}.usability-lab.json`)}>Export study and sessions</button>
      </div>
      {!sessions.length && <p className="muted">No sessions yet. Run one from the Run tab{study.method === 'unmoderated' ? ', or add participants’ results files there' : ''}.</p>}
      <ul className="session-list">
        {sessions.map(session => {
          const key = sessionKeyOf(study.id, session)
          const last = session.tasks.reduce((max, task) => Math.max(max, task.end ?? 0), 0)
          return <li key={key} className="panel session-row">
            <b className="mono">{session.participant}</b>
            {session.pilot && <span className="chip">PILOT</span>}
            <span className="muted small">{new Date(session.startedAt).toLocaleString()} · {clock(last)} · {summary(session) || 'no tasks finished'}{session.notes?.length ? ` · ${session.notes.length} notes` : ''}</span>
            <div className="actions">
              <a className="btn ghost small-btn" href={studyHref('review', study.id, key)}>Review</a>
              <button className="btn ghost small-btn" onClick={() => download(JSON.stringify(session), `${slugOf(study.title)}-${session.participant}.json`)}>Download</button>
              {confirming === key
                ? <><button className="btn danger small-btn" onClick={() => remove(session)}>Delete session</button><button className="btn ghost small-btn" autoFocus onClick={() => setConfirming(null)}>Cancel</button></>
                : <button className="btn ghost small-btn" onClick={() => setConfirming(key)}>Delete</button>}
            </div>
          </li>
        })}
      </ul>
    </section>
  </div>
}
