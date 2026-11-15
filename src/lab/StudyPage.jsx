import React, { useEffect, useMemo, useRef, useState } from 'react'
import { LabHeader, studyHref } from './LabNav'
import { download, slugOf } from './Studies'
import { addSession, deleteSession, exportPackage, saveStudy, sessionKeyOf, sessionsOf, workspace } from './workspace'
import { consentDocument, dataFlowStatement, limitsFor, METHODS, newTask, OUTCOMES, participantId, POST_SURVEYS, SOURCES, studyProblems, taskOrder, toRuntimeStudy, williamsSquare } from '../research/studyModel'
import { parseFigmaLink } from '../research/figma'
import { demoLink, studyLink } from '../research/studyLink'
import { isFinished } from '../research/sessionStatus'
import { readSession } from '../research/Review'
import { errorText, formatDate, HTML_LANG, isLang, LANGS, NATIVE } from '../i18n/index.js'
import { useT } from '../i18n/react.jsx'

const minutes = sec => Math.round((sec / 60) * 10) / 10
const clock = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
// When the session's last task ended (ms from the start).
const lastEnd = session => session.tasks.reduce((max, task) => Math.max(max, task.end ?? 0), 0)
// When a session started, as the browser writes dates (toLocaleDateString /
// toLocaleString shapes); a file without a valid start time shows a dash.
const SLOT_DATE = {}
const UNFINISHED_TIME = { dateStyle: 'medium', timeStyle: 'short' }
const SESSION_TIME = { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }
const when = (lang, value, options) => formatDate(lang, value, options) || '–'
const FIGMA_PLACEHOLDER = 'https://www.figma.com/proto/…'

// One study: plan it, run sessions, get the documents, see the results.
export function StudyPage({ id, tab }) {
  const t = useT()
  const [study, setStudy] = useState(null)
  const [sessions, setSessions] = useState([])
  const [missing, setMissing] = useState(false)
  const [saveState, setSaveState] = useState('saved')
  const timer = useRef(0)
  // The latest change not saved yet, and whether the page is still shown.
  const pending = useRef(null)
  const mounted = useRef(true)

  const load = async () => {
    const found = await (await workspace()).getStudy(id)
    if (!found) { setMissing(true); return }
    setStudy(found)
    setSessions(await sessionsOf(id))
  }
  useEffect(() => { load() }, [id])
  const reloadSessions = async () => setSessions(await sessionsOf(id))

  // Every change is saved shortly after it is made, and at once when the
  // researcher leaves the study, reloads or hides the page.
  const flush = () => {
    clearTimeout(timer.current)
    const next = pending.current
    if (!next) return
    pending.current = null
    saveStudy(next).then(() => { if (mounted.current && !pending.current) setSaveState('saved') })
  }
  const update = change => {
    setStudy(current => {
      const next = { ...current, ...(typeof change === 'function' ? change(current) : change) }
      pending.current = next
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, 400)
      return next
    })
    setSaveState('saving')
  }
  useEffect(() => {
    mounted.current = true
    const hidden = () => { if (document.visibilityState === 'hidden') flush() }
    addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      mounted.current = false
      removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', hidden)
      flush()
    }
  }, [])

  if (missing) { return <div className="screen"><LabHeader /><main className="center-note"><h2>{t('lab.study.missing')}</h2><p className="muted">{t('lab.study.missingHint')}</p><a className="btn primary" href="#/">{t('lab.backToStudies')}</a></main></div> }
  if (!study) { return <div className="screen"><LabHeader /><main className="center-note"><p className="muted">{t('lab.loading')}</p></main></div> }

  return <div className="screen">
    <LabHeader study={study} current={tab}><span className="muted small" role="status">{saveState === 'saving' ? t('lab.saving') : t('lab.saved')}</span></LabHeader>
    <main className="lab-main">
      {tab === 'plan' && <Plan study={study} update={update} />}
      {tab === 'run' && <Run study={study} sessions={sessions} onChanged={reloadSessions} />}
      {tab === 'documents' && <Documents study={study} update={update} />}
      {tab === 'results' && <Results study={study} sessions={sessions} onChanged={reloadSessions} />}
    </main>
  </div>
}

function Field({ label, hint, children, htmlFor }) {
  return <label className="field" htmlFor={htmlFor}><span>{label}</span>{children}{hint && <small className="muted">{hint}</small>}</label>
}

// A number field that can be cleared and retyped. What is typed stays as it
// is while the field is edited, and valid values (in range, on a step) are
// saved as they are typed; on leaving the field the value is brought into
// range, and an empty field goes back to the saved value.
function NumberInput({ value, min, max, step = 1, onCommit, ...props }) {
  const [text, setText] = useState(null)
  const fit = number => Math.min(max, Math.max(min, Math.round(number / step) * step))
  const parse = raw => (raw.trim() === '' ? NaN : Number(raw))
  const commit = number => { if (fit(number) !== value) onCommit(fit(number)) }
  return <input {...props} type="number" min={min} max={max} step={step} value={text ?? value}
    onChange={event => {
      setText(event.target.value)
      const number = parse(event.target.value)
      if (fit(number) === number) commit(number)
    }}
    onBlur={() => {
      if (text === null) return
      const number = parse(text)
      setText(null)
      if (Number.isFinite(number)) commit(number)
    }} />
}

function Plan({ study, update }) {
  const t = useT()
  const problems = studyProblems(study, t.lang)
  const limits = limitsFor(study)
  const figma = study.source.kind === 'figma'
  const studyLang = isLang(study.lang) ? study.lang : 'en'
  const frameInput = value => parseFigmaLink(value)?.nodeId || value.trim() || null
  // A link gives every participant the same order, so only moderated
  // sessions are counterbalanced.
  const moderated = study.method === 'moderated'
  const balanced = moderated && study.counterbalance && study.tasks.length > 1
  const order = balanced ? [0, 1, 2].map(index => taskOrder(study, index).join(' → ')) : null
  const rows = balanced ? williamsSquare(study.tasks.length).length : 0
  const setTask = (index, change) => update(current => ({ tasks: current.tasks.map((task, at) => (at === index ? { ...task, ...change } : task)) }))
  // Task ids follow their position (T1, T2…), so reports line up across studies.
  const renumber = tasks => tasks.map((task, index) => ({ ...task, id: `T${index + 1}` }))
  // Each task keeps its React key when tasks move or are removed, so the
  // focused button stays with its task. focusNext names the element to
  // focus after the change is drawn.
  const keys = useRef([])
  const counter = useRef(0)
  if (keys.current.length !== study.tasks.length) keys.current = study.tasks.map((_, index) => keys.current[index] ?? `plan-task-${counter.current++}`)
  const focusNext = useRef(null)
  useEffect(() => {
    if (!focusNext.current) return
    document.getElementById(focusNext.current)?.focus()
    focusNext.current = null
  })
  const [removed, setRemoved] = useState(null)
  const move = (index, step) => {
    const to = index + step
    const [key] = keys.current.splice(index, 1)
    keys.current.splice(to, 0, key)
    // The same arrow again, or the other one once the task reaches an end.
    const atEnd = step < 0 ? to === 0 : to === study.tasks.length - 1
    focusNext.current = `${key}-${(step < 0) !== atEnd ? 'up' : 'down'}`
    update(current => {
      const tasks = [...current.tasks]
      const [task] = tasks.splice(index, 1)
      tasks.splice(to, 0, task)
      return { tasks: renumber(tasks) }
    })
  }
  const remove = index => {
    const [key] = keys.current.splice(index, 1)
    setRemoved({ task: study.tasks[index], index, key })
    focusNext.current = 'task-undo'
    update(current => ({ tasks: renumber(current.tasks.filter((_, at) => at !== index)) }))
  }
  const undo = () => {
    const { task, index, key } = removed
    keys.current.splice(index, 0, key)
    focusNext.current = `${key}-remove`
    setRemoved(null)
    update(current => {
      const tasks = [...current.tasks]
      tasks.splice(index, 0, task)
      return { tasks: renumber(tasks) }
    })
  }

  return <div className="lab-columns">
    <section className="lab-form">
      <span className="kicker">{t('lab.tab.plan')}</span>
      <h1>{study.title || t('lab.plan.newStudy')}</h1>
      <div className="panel lab-panel">
        <Field label={t('lab.plan.title')} htmlFor="study-title"><input id="study-title" value={study.title} maxLength={120} placeholder={t('lab.plan.titlePlaceholder')} onChange={event => update({ title: event.target.value })} /></Field>
        <fieldset className="choice"><legend>{t('study.lang.label')}</legend>
          {LANGS.map(value => <label key={value} className="check" lang={HTML_LANG[value]}><input type="radio" name="study-lang" checked={studyLang === value} onChange={() => update({ lang: value })} />{NATIVE[value]}</label>)}
          <small className="muted">{t('study.lang.hint')}</small>
        </fieldset>
        <fieldset className="choice"><legend>{t('lab.plan.method')}</legend>
          {Object.keys(METHODS).map(value => <label key={value} className="check"><input type="radio" name="method" checked={study.method === value} onChange={() => update({ method: value })} />{t(`study.method.${value}`)}</label>)}
          <small className="muted">{moderated ? t('lab.plan.methodHint.moderated') : t('lab.plan.methodHint.unmoderated')}</small>
        </fieldset>
        <fieldset className="choice"><legend>{t('lab.plan.source')}</legend>
          {Object.keys(SOURCES).map(value => <label key={value} className="check"><input type="radio" name="source" checked={study.source.kind === value} onChange={() => update(current => ({ source: { ...current.source, kind: value } }))} />{t(`study.source.${value}`)}</label>)}
          {study.source.kind === 'none' && <small className="muted">{t('lab.plan.sourceHint.none')}</small>}
        </fieldset>
        {figma && <>
          <Field label={t('lab.plan.figmaLink')} hint={t('lab.plan.figmaLinkHint')} htmlFor="figma-link"><input id="figma-link" defaultValue={study.source.figma?.fileKey ? `https://www.figma.com/proto/${study.source.figma.fileKey}/${encodeURIComponent(study.source.figma.name || 'Prototype')}${study.source.figma.startNodeId ? `?node-id=${study.source.figma.startNodeId.replace(':', '-')}` : ''}` : ''} placeholder={FIGMA_PLACEHOLDER} onChange={event => {
            const parsed = parseFigmaLink(event.target.value)
            // The client ID is kept when the link changes or is not valid yet.
            update(current => ({ source: { kind: 'figma', figma: parsed?.fileKey ? { ...current.source.figma, fileKey: parsed.fileKey, name: parsed.name, startNodeId: parsed.startNodeId || parsed.nodeId } : { ...current.source.figma, fileKey: null } } }))
          }} /></Field>
          <Field label={t('lab.plan.clientId')} hint={study.method === 'unmoderated' ? t('lab.plan.clientIdHint.unmoderated') : t('lab.plan.clientIdHint.moderated')} htmlFor="figma-client"><input id="figma-client" value={study.source.figma?.clientId || ''} onChange={event => update(current => ({ source: { ...current.source, figma: { ...current.source.figma, clientId: event.target.value.trim() } } }))} /></Field>
        </>}
      </div>

      <h2 className="lab-h2">{t('lab.plan.tasks')}</h2>
      {study.tasks.map((task, index) => <fieldset key={keys.current[index]} className="panel lab-panel task-edit">
        <legend>{t('lab.plan.task', { number: index + 1 })}</legend>
        <Field label={t('lab.plan.prompt')} htmlFor={`task-${index}-prompt`}><textarea id={`task-${index}-prompt`} rows={2} maxLength={300} value={task.prompt} placeholder={t('lab.plan.promptPlaceholder')} onChange={event => setTask(index, { prompt: event.target.value })} /></Field>
        <Field label={t('lab.plan.success')} hint={t('lab.plan.successHint')} htmlFor={`task-${index}-success`}><input id={`task-${index}-success`} value={task.success || ''} placeholder={t('lab.plan.successPlaceholder')} onChange={event => setTask(index, { success: event.target.value })} /></Field>
        {figma && <div className="field-row">
          <Field label={t('lab.plan.startFrame')} htmlFor={`task-${index}-start`}><input id={`task-${index}-start`} value={task.start || ''} placeholder={t('lab.plan.framePlaceholder')} onChange={event => setTask(index, { start: frameInput(event.target.value) })} /></Field>
          <Field label={t('lab.plan.goalFrame')} hint={t('lab.plan.goalFrameHint')} htmlFor={`task-${index}-goal`}><input id={`task-${index}-goal`} value={task.successPage || ''} placeholder={t('lab.plan.framePlaceholder')} onChange={event => setTask(index, { successPage: frameInput(event.target.value) })} /></Field>
        </div>}
        <div className="field-row">
          <Field label={t('lab.plan.limit')} htmlFor={`task-${index}-limit`}><NumberInput id={`task-${index}-limit`} min={0.5} max={limits.limitSec / 60} step={0.5} value={minutes(task.limitSec)} onCommit={value => setTask(index, { limitSec: Math.round(value * 60) })} /></Field>
          <div className="actions task-tools">
            <button id={`${keys.current[index]}-up`} className="btn ghost small-btn" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t('lab.plan.moveUp', { number: index + 1 })}>↑</button>
            <button id={`${keys.current[index]}-down`} className="btn ghost small-btn" disabled={index === study.tasks.length - 1} onClick={() => move(index, 1)} aria-label={t('lab.plan.moveDown', { number: index + 1 })}>↓</button>
            {study.tasks.length > 1 && <button id={`${keys.current[index]}-remove`} className="btn ghost small-btn" onClick={event => { if (event.detail < 2) remove(index) }} aria-label={t('lab.plan.removeTask', { number: index + 1 })}>{t('lab.plan.remove')}</button>}
          </div>
        </div>
      </fieldset>)}
      {/* The status stays mounted so screen readers announce the removal. The
          second click of a double click on Remove is ignored. */}
      <div className={removed ? 'actions' : undefined}><span className="muted small" role="status">{removed ? t('lab.plan.removed', { number: removed.index + 1 }) : ''}</span>{removed && <button id="task-undo" className="btn ghost small-btn" disabled={study.tasks.length >= limits.tasks} onClick={undo} aria-label={t('lab.plan.undoTask', { number: removed.index + 1 })}>{t('lab.plan.undo')}</button>}</div>
      {study.tasks.length < limits.tasks && <button className="btn secondary" onClick={() => update(current => ({ tasks: [...current.tasks, newTask(current.tasks.length + 1)] }))}>{t('lab.plan.addTask')}</button>}

      <h2 className="lab-h2">{t('lab.plan.questions')}</h2>
      <div className="panel lab-panel">
        <label className="check" htmlFor="ask-seq"><input id="ask-seq" type="checkbox" checked={study.questionnaire.seq} onChange={event => update(current => ({ questionnaire: { ...current.questionnaire, seq: event.target.checked } }))} />{t('lab.plan.seq')}</label>
        <fieldset className="choice"><legend>{t('lab.plan.post')}</legend>
          {Object.keys(POST_SURVEYS).map(value => <label key={value} className="check"><input type="radio" name="post" checked={study.questionnaire.post === value} onChange={() => update(current => ({ questionnaire: { ...current.questionnaire, post: value } }))} />{t(`study.post.${value}`)}</label>)}
        </fieldset>
        <label className="check" htmlFor="counterbalance"><input id="counterbalance" type="checkbox" checked={moderated && study.counterbalance} disabled={!moderated || study.tasks.length < 2} aria-describedby={moderated ? undefined : 'counterbalance-note'} onChange={event => update({ counterbalance: event.target.checked })} />{t('lab.plan.counterbalance')}</label>
        {!moderated && <small className="muted" id="counterbalance-note">{t('lab.plan.counterbalanceModerated')}</small>}
        {order && <small className="muted">{t('lab.plan.orderHint', { first: order[0], second: order[1], third: order[2] })}</small>}
        {order && study.plannedParticipants % rows !== 0 && <small className="warning">{t('lab.plan.unbalanced', { a: rows, b: rows * 2, c: rows * 3, planned: study.plannedParticipants })}</small>}
        <Field label={t('lab.plan.planned')} hint={t('lab.plan.plannedHint')} htmlFor="planned"><NumberInput id="planned" min={1} max={100} value={study.plannedParticipants} onCommit={value => update({ plannedParticipants: value })} /></Field>
      </div>
    </section>
    <aside className="lab-side">
      <div className="panel lab-panel sticky">
        <span className="kicker">{t('lab.plan.ready')}</span>
        {problems.length ? <ul className="problems">{problems.map(problem => <li key={problem}>{problem}</li>)}</ul> : <p>{t('lab.plan.allSet')}</p>}
        <a className={`btn ${problems.length ? 'ghost' : 'primary'}`} href={studyHref('study', study.id, 'run')}>{t('lab.goToRun')}</a>
        <a className="btn ghost" href={studyHref('study', study.id, 'documents')}>{t('lab.plan.documents')}</a>
      </div>
    </aside>
  </div>
}

// A session that stopped before its end (the console was left mid-session):
// it can be reviewed or discarded, and its slot can be started again.
function Unfinished({ study, session, onChanged }) {
  const t = useT()
  const [confirming, setConfirming] = useState(false)
  const discard = async () => { await deleteSession(study.id, session); onChanged() }
  return <>
    <span className="chip strong">{t('lab.run.unfinished', { date: when(t.lang, session.startedAt, UNFINISHED_TIME) })}</span>
    <a className="btn ghost small-btn" href={studyHref('review', study.id, sessionKeyOf(study.id, session))}>{t('lab.review')}</a>
    {confirming
      ? <><button className="btn danger small-btn" onClick={discard}>{t('lab.run.discardConfirm')}</button><button className="btn ghost small-btn" autoFocus onClick={() => setConfirming(false)}>{t('lab.cancel')}</button></>
      : <button className="btn ghost small-btn" aria-label={t('lab.run.discardLabel', { participant: session.participant })} onClick={() => setConfirming(true)}>{t('lab.run.discard')}</button>}
  </>
}

function Run({ study, sessions, onChanged }) {
  const t = useT()
  const problems = studyProblems(study, t.lang)
  const real = sessions.filter(session => !session.pilot)
  // A slot is done only when its session reached the end.
  const finished = real.filter(isFinished)
  const unfinished = real.filter(session => !isFinished(session))
  const byParticipant = new Map(finished.map(session => [session.participant, session]))
  const slots = Array.from({ length: Math.max(study.plannedParticipants, new Set(real.map(session => session.participant)).size) }, (_, index) => participantId(index))
  const next = slots.findIndex(code => !byParticipant.has(code))
  // One { key, vars, error? } per file added, shown in the current language.
  const [importNotes, setImportNotes] = useState([])
  const [copied, setCopied] = useState(null)
  const runtimeLink = useMemo(() => {
    if (study.method !== 'unmoderated' || problems.length) return null
    const base = new URL('research.html', location.href).href.split('?')[0]
    // The demo runs the built-in tasks; the link carries the study's
    // language, questionnaires and contact, as the runtime study has them.
    if (study.source.kind === 'demo') return { url: demoLink(toRuntimeStudy(study), base), demo: true }
    try { return { url: studyLink(toRuntimeStudy(study), base) } } catch (error) { return { error } }
  }, [study, problems.length])
  useEffect(() => { setCopied(null) }, [runtimeLink?.url])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(runtimeLink.url)
      setCopied('done')
    } catch {
      setCopied('failed')
    }
  }
  const importResults = async files => {
    const notes = []
    for (const file of files) {
      try {
        const session = readSession(await file.text())
        // A file added again keeps the copy here, with its reviews, unless
        // the new copy has more reviews.
        const result = await addSession(study.id, session)
        const vars = { file: file.name, participant: session.participant, count: result.reviews }
        notes.push({ key: result.status === 'added' ? 'lab.run.added' : result.status === 'replaced' ? 'lab.run.replaced' : 'lab.run.already', vars })
      } catch (problem) {
        notes.push(problem instanceof SyntaxError ? { key: 'lab.run.notJson', vars: { file: file.name } } : { key: 'lab.run.fileError', vars: { file: file.name }, error: problem })
      }
    }
    setImportNotes(notes)
    onChanged()
  }
  const importNote = importNotes.map(note => t(note.key, note.error ? { ...note.vars, error: errorText(t, note.error) } : note.vars)).join(' · ')

  return <div className="lab-columns">
    <section className="lab-form">
      <span className="kicker">{t('lab.tab.run')}</span>
      <h1>{study.method === 'moderated' ? t('lab.run.moderatedTitle') : t('lab.run.unmoderatedTitle')}</h1>
      {problems.length > 0 && <div className="warning banner-box" role="alert"><b>{t('lab.run.finishPlan')}</b><ul>{problems.map(problem => <li key={problem}>{problem}</li>)}</ul><a href={studyHref('study', study.id, 'plan')}>{t('lab.goToPlan')}</a></div>}
      {study.method === 'moderated' && <>
        <p className="lede">{t('lab.run.moderatedLede')}</p>
        <div className="actions">
          <a className={`btn primary ${problems.length ? 'is-disabled' : ''}`} aria-disabled={problems.length > 0} href={problems.length || next < 0 ? undefined : studyHref('run', study.id, String(next))}>{next < 0 ? t('lab.run.allDone') : t('lab.run.startSession', { participant: participantId(next) })}</a>
          <a className={`btn ghost ${problems.length ? 'is-disabled' : ''}`} aria-disabled={problems.length > 0} href={problems.length ? undefined : studyHref('run', study.id, 'pilot')}>{t('lab.run.pilot')}</a>
        </div>
        <ol className="slots">
          {slots.map((code, index) => {
            const session = byParticipant.get(code)
            return <li key={code} className={`panel slot ${session ? 'is-done' : ''}`}>
              <b className="mono">{code}</b>
              <span className="muted small">{study.counterbalance ? taskOrder(study, index).join(' → ') : t('lab.tasks', { count: study.tasks.length })}</span>
              {unfinished.filter(item => item.participant === code).map(item => <Unfinished key={sessionKeyOf(study.id, item)} study={study} session={item} onChanged={onChanged} />)}
              {session
                ? <><span className="chip live">{t('lab.run.done', { date: when(t.lang, session.startedAt, SLOT_DATE) })}</span><a className="btn ghost small-btn" href={studyHref('review', study.id, sessionKeyOf(study.id, session))}>{t('lab.review')}</a></>
                : <a className={`btn ghost small-btn ${problems.length ? 'is-disabled' : ''}`} aria-disabled={problems.length > 0} href={problems.length ? undefined : studyHref('run', study.id, String(index))}>{t('lab.run.start')}</a>}
            </li>
          })}
        </ol>
      </>}
      {study.method === 'unmoderated' && <>
        <p className="lede">{t('lab.run.unmoderatedLede')}</p>
        {runtimeLink?.url && <div className="panel lab-panel"><span className="kicker">{t('lab.run.link')}</span><p className="mono small setup-url">{runtimeLink.url}</p>{runtimeLink.demo && <small className="muted">{t('lab.run.demoNote')}</small>}<div className="actions"><button className="btn primary" onClick={copy}>{t('lab.run.copy')}</button><a className="btn ghost" href={runtimeLink.url} target="_blank" rel="noopener">{t('lab.run.try')}</a><span className={`small ${copied === 'failed' ? 'warning' : 'muted'}`} role="status">{copied === 'done' ? t('lab.run.copied') : copied === 'failed' ? t('lab.run.copyFailed') : ''}</span></div></div>}
        {runtimeLink?.error && <p className="warning">{errorText(t, runtimeLink.error)}</p>}
        <div className="panel lab-panel">
          <span className="kicker">{t('lab.run.files')}</span>
          <label className="btn secondary file-button" htmlFor="add-results">{t('lab.run.addFiles')}<input id="add-results" type="file" multiple accept="application/json,.json" onChange={event => { const files = [...event.target.files]; event.target.value = ''; if (files.length) importResults(files) }} /></label>
          {importNote && <p className="muted small" role="status">{importNote}</p>}
          <p className="muted small">{t('lab.run.received', { done: finished.length, planned: study.plannedParticipants })}{unfinished.length ? `${t.lang === 'zh' ? '' : ' '}${t('lab.run.receivedUnfinished', { count: unfinished.length })}` : ''}</p>
        </div>
      </>}
    </section>
    {study.method === 'moderated' && <aside className="lab-side">
      <div className="panel lab-panel sticky">
        <span className="kicker">{t('lab.run.tips')}</span>
        <ul className="tips">
          <li>{t('lab.run.tip.aloud')}</li>
          <li>{t('lab.run.tip.help')}</li>
          <li>{t('lab.run.tip.notes')}</li>
          <li>{t('lab.run.tip.outcomes')}</li>
        </ul>
      </div>
    </aside>}
  </div>
}

function Documents({ study, update }) {
  const t = useT()
  const c = study.consent
  const consent = consentDocument(study)
  const dataFlow = dataFlowStatement(study)
  // Each consent field's label and placeholder are lab.docs.<key> and lab.docs.<key>Placeholder.
  const field = key => <Field label={t(`lab.docs.${key}`)} htmlFor={`consent-${key}`}><input id={`consent-${key}`} value={c[key] ?? ''} placeholder={t(`lab.docs.${key}Placeholder`)} onChange={event => set({ [key]: event.target.value })} /></Field>
  const set = change => update(current => ({ consent: { ...current.consent, ...change } }))
  return <div className="lab-columns">
    <section className="lab-form">
      <span className="kicker">{t('lab.tab.documents')}</span>
      <h1>{t('lab.docs.title')}</h1>
      <p className="lede">{t('lab.docs.lede')}</p>
      <div className="panel lab-panel">
        {field('researcher')}
        {field('institution')}
        {field('contact')}
        {field('supervisor')}
        {field('purpose')}
        <div className="field-row">
          <Field label={t('lab.docs.duration')} htmlFor="consent-duration"><NumberInput id="consent-duration" min={5} max={240} value={c.durationMin} onCommit={value => set({ durationMin: value })} /></Field>
          {field('compensation')}
        </div>
        {field('retention')}
        <div className="field-row">
          {field('ethicsBoard')}
          {field('ethicsNumber')}
        </div>
      </div>
    </section>
    <aside className="lab-side">
      <div className="panel lab-panel">
        <span className="kicker">{t('lab.docs.consent')}</span>
        <pre className="doc-preview">{consent}</pre>
        <div className="actions"><button className="btn primary" onClick={() => download(consent, `${slugOf(study.title)}-consent.md`, 'text/markdown')}>{t('lab.docs.download')}</button></div>
      </div>
      <div className="panel lab-panel">
        <span className="kicker">{t('lab.docs.dataFlow')}</span>
        <pre className="doc-preview">{dataFlow}</pre>
        <div className="actions"><button className="btn secondary" onClick={() => download(dataFlow, `${slugOf(study.title)}-data-management.md`, 'text/markdown')}>{t('lab.docs.download')}</button></div>
      </div>
    </aside>
  </div>
}

function Results({ study, sessions, onChanged }) {
  const t = useT()
  const [confirming, setConfirming] = useState(null)
  const remove = async session => {
    await deleteSession(study.id, session)
    setConfirming(null)
    onChanged()
  }
  // Outcomes come from files, so a name such as "constructor" must not find
  // an object's built-in properties.
  const summary = session => {
    const counts = new Map()
    session.tasks.forEach(task => { if (task.outcome) counts.set(task.outcome, (counts.get(task.outcome) || 0) + 1) })
    return [...counts].map(([outcome, count]) => t('lab.results.outcomeCount', { count, label: Object.hasOwn(OUTCOMES, outcome) ? t(`study.outcome.${outcome}`) : outcome })).join(' · ')
  }
  return <div className="lab-columns">
    <section className="lab-form">
      <span className="kicker">{t('lab.tab.results')}</span>
      <h1>{t('lab.results.sessions', { count: sessions.length })}</h1>
      <div className="actions">
        <a className={`btn primary ${sessions.length ? '' : 'is-disabled'}`} href={sessions.length ? studyHref('report', study.id) : undefined}>{t('lab.results.openReport')}</a>
        <button className="btn ghost" onClick={async () => download(JSON.stringify(await exportPackage([study.id])), `${slugOf(study.title)}.usability-lab.json`)}>{t('lab.results.export')}</button>
      </div>
      {!sessions.length && <p className="muted">{study.method === 'unmoderated' ? t('lab.results.empty.unmoderated') : t('lab.results.empty.moderated')}</p>}
      <ul className="session-list">
        {sessions.map(session => {
          const key = sessionKeyOf(study.id, session)
          const last = lastEnd(session)
          return <li key={key} className="panel session-row">
            <b className="mono">{session.participant}</b>
            {session.pilot && <span className="chip">{t('lab.results.pilot')}</span>}
            {!isFinished(session) && <span className="chip strong">{t('lab.results.unfinished')}</span>}
            <span className="muted small">{when(t.lang, session.startedAt, SESSION_TIME)} · {clock(last)} · {summary(session) || t('lab.results.noTasks')}{session.notes?.length ? ` · ${t('lab.results.notes', { count: session.notes.length })}` : ''}</span>
            <div className="actions">
              <a className="btn ghost small-btn" href={studyHref('review', study.id, key)}>{t('lab.review')}</a>
              <button className="btn ghost small-btn" onClick={() => download(JSON.stringify(session), `${slugOf(study.title)}-${session.participant}.json`)}>{t('lab.download')}</button>
              {confirming === key
                ? <><button className="btn danger small-btn" onClick={() => remove(session)}>{t('lab.results.deleteConfirm')}</button><button className="btn ghost small-btn" autoFocus onClick={() => setConfirming(null)}>{t('lab.cancel')}</button></>
                : <button className="btn ghost small-btn" onClick={() => setConfirming(key)}>{t('lab.delete')}</button>}
            </div>
          </li>
        })}
      </ul>
    </section>
  </div>
}
