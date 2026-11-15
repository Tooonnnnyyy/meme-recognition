import React, { useEffect, useMemo, useRef, useState } from 'react'
import { LabHeader, studyHref } from './LabNav'
import { download, slugOf } from './Studies'
import { exportPackage, saveSession, saveStudy, sessionKeyOf, sessionsOf, workspace } from './workspace'
import { consentDocument, dataFlowStatement, METHODS, newTask, OUTCOMES, participantId, POST_SURVEYS, SOURCES, studyProblems, taskOrder, toRuntimeStudy } from '../research/studyModel'
import { parseFigmaLink } from '../research/figma'
import { studyLink } from '../research/studyLink'
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

  if (missing) { return <div className="screen"><LabHeader /><main className="center-note"><h2>{t('lab.study.missing')}</h2><p className="muted">{t('lab.study.missingHint')}</p><a className="btn primary" href="#/">{t('lab.backToStudies')}</a></main></div> }
  if (!study) { return <div className="screen"><LabHeader /><main className="center-note"><p className="muted">{t('lab.loading')}</p></main></div> }

  return <div className="screen">
    <LabHeader study={study} current={tab}><span className="muted small" role="status">{saveState === 'saving' ? t('lab.saving') : t('lab.saved')}</span></LabHeader>
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
  const t = useT()
  const problems = studyProblems(study, t.lang)
  const figma = study.source.kind === 'figma'
  const studyLang = isLang(study.lang) ? study.lang : 'en'
  const frameInput = value => parseFigmaLink(value)?.nodeId || value.trim() || null
  const order = study.counterbalance ? [0, 1, 2].map(index => taskOrder(study, index).join(' → ')) : null
  const setTask = (index, change) => update(current => ({ tasks: current.tasks.map((task, at) => (at === index ? { ...task, ...change } : task)) }))
  // Task ids follow their position (T1, T2…), so reports line up across studies.
  const renumber = tasks => tasks.map((task, index) => ({ ...task, id: `T${index + 1}` }))
  const move = (index, step) => update(current => {
    const tasks = [...current.tasks]
    const [task] = tasks.splice(index, 1)
    tasks.splice(index + step, 0, task)
    return { tasks: renumber(tasks) }
  })

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
          <small className="muted">{study.method === 'moderated' ? t('lab.plan.methodHint.moderated') : t('lab.plan.methodHint.unmoderated')}</small>
        </fieldset>
        <fieldset className="choice"><legend>{t('lab.plan.source')}</legend>
          {Object.keys(SOURCES).map(value => <label key={value} className="check"><input type="radio" name="source" checked={study.source.kind === value} onChange={() => update(current => ({ source: value === 'figma' ? { kind: 'figma', ...(current.source.kind === 'figma' ? current.source : {}) } : { kind: value } }))} />{t(`study.source.${value}`)}</label>)}
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
      {study.tasks.map((task, index) => <fieldset key={index} className="panel lab-panel task-edit">
        <legend>{t('lab.plan.task', { number: index + 1 })}</legend>
        <Field label={t('lab.plan.prompt')} htmlFor={`task-${index}-prompt`}><textarea id={`task-${index}-prompt`} rows={2} maxLength={300} value={task.prompt} placeholder={t('lab.plan.promptPlaceholder')} onChange={event => setTask(index, { prompt: event.target.value })} /></Field>
        <Field label={t('lab.plan.success')} hint={t('lab.plan.successHint')} htmlFor={`task-${index}-success`}><input id={`task-${index}-success`} value={task.success || ''} placeholder={t('lab.plan.successPlaceholder')} onChange={event => setTask(index, { success: event.target.value })} /></Field>
        {figma && <div className="field-row">
          <Field label={t('lab.plan.startFrame')} htmlFor={`task-${index}-start`}><input id={`task-${index}-start`} value={task.start || ''} placeholder={t('lab.plan.framePlaceholder')} onChange={event => setTask(index, { start: frameInput(event.target.value) })} /></Field>
          <Field label={t('lab.plan.goalFrame')} hint={t('lab.plan.goalFrameHint')} htmlFor={`task-${index}-goal`}><input id={`task-${index}-goal`} value={task.successPage || ''} placeholder={t('lab.plan.framePlaceholder')} onChange={event => setTask(index, { successPage: frameInput(event.target.value) })} /></Field>
        </div>}
        <div className="field-row">
          <Field label={t('lab.plan.limit')} htmlFor={`task-${index}-limit`}><input id={`task-${index}-limit`} type="number" min="0.5" max="60" step="0.5" value={minutes(task.limitSec)} onChange={event => setTask(index, { limitSec: Math.round(Number(event.target.value) * 60) })} /></Field>
          <div className="actions task-tools">
            <button className="btn ghost small-btn" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t('lab.plan.moveUp', { number: index + 1 })}>↑</button>
            <button className="btn ghost small-btn" disabled={index === study.tasks.length - 1} onClick={() => move(index, 1)} aria-label={t('lab.plan.moveDown', { number: index + 1 })}>↓</button>
            {study.tasks.length > 1 && <button className="btn ghost small-btn" onClick={() => update(current => ({ tasks: renumber(current.tasks.filter((_, at) => at !== index)) }))}>{t('lab.plan.remove')}</button>}
          </div>
        </div>
      </fieldset>)}
      {study.tasks.length < 12 && <button className="btn secondary" onClick={() => update(current => ({ tasks: [...current.tasks, newTask(current.tasks.length + 1)] }))}>{t('lab.plan.addTask')}</button>}

      <h2 className="lab-h2">{t('lab.plan.questions')}</h2>
      <div className="panel lab-panel">
        <label className="check" htmlFor="ask-seq"><input id="ask-seq" type="checkbox" checked={study.questionnaire.seq} onChange={event => update(current => ({ questionnaire: { ...current.questionnaire, seq: event.target.checked } }))} />{t('lab.plan.seq')}</label>
        <fieldset className="choice"><legend>{t('lab.plan.post')}</legend>
          {Object.keys(POST_SURVEYS).map(value => <label key={value} className="check"><input type="radio" name="post" checked={study.questionnaire.post === value} onChange={() => update(current => ({ questionnaire: { ...current.questionnaire, post: value } }))} />{t(`study.post.${value}`)}</label>)}
        </fieldset>
        <label className="check" htmlFor="counterbalance"><input id="counterbalance" type="checkbox" checked={study.counterbalance} disabled={study.tasks.length < 2} onChange={event => update({ counterbalance: event.target.checked })} />{t('lab.plan.counterbalance')}</label>
        {order && <small className="muted">{t('lab.plan.orderHint', { first: order[0], second: order[1], third: order[2] })}</small>}
        <Field label={t('lab.plan.planned')} hint={t('lab.plan.plannedHint')} htmlFor="planned"><input id="planned" type="number" min="1" max="100" value={study.plannedParticipants} onChange={event => update({ plannedParticipants: Math.max(1, Math.min(100, Math.round(Number(event.target.value) || 1))) })} /></Field>
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

function Run({ study, sessions, onChanged }) {
  const t = useT()
  const problems = studyProblems(study, t.lang)
  const done = sessions.filter(session => !session.pilot)
  const byParticipant = new Map(done.map(session => [session.participant, session]))
  const slots = Array.from({ length: Math.max(study.plannedParticipants, done.length) }, (_, index) => participantId(index))
  const next = slots.findIndex(code => !byParticipant.has(code))
  // One { key, vars, error? } per file added, shown in the current language.
  const [importNotes, setImportNotes] = useState([])
  const runtimeLink = useMemo(() => {
    if (study.method !== 'unmoderated' || problems.length) return null
    // The demo runs the built-in tasks; ?lang= gives it the study's language.
    if (study.source.kind === 'demo') {
      const url = new URL('research.html', location.href)
      url.search = ''
      url.searchParams.set('lang', isLang(study.lang) ? study.lang : 'en')
      return { url: url.href, demo: true }
    }
    try { return { url: studyLink(toRuntimeStudy(study), new URL('research.html', location.href).href.split('?')[0]) } } catch (error) { return { error } }
  }, [study, problems.length])
  const importResults = async files => {
    const notes = []
    for (const file of files) {
      try {
        const session = readSession(await file.text())
        await saveSession(study.id, session)
        notes.push({ key: 'lab.run.added', vars: { file: file.name, participant: session.participant } })
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
              {session
                ? <><span className="chip live">{t('lab.run.done', { date: when(t.lang, session.startedAt, SLOT_DATE) })}</span><a className="btn ghost small-btn" href={studyHref('review', study.id, sessionKeyOf(study.id, session))}>{t('lab.review')}</a></>
                : <a className="btn ghost small-btn" href={problems.length ? undefined : studyHref('run', study.id, String(index))}>{t('lab.run.start')}</a>}
            </li>
          })}
        </ol>
      </>}
      {study.method === 'unmoderated' && <>
        <p className="lede">{t('lab.run.unmoderatedLede')}</p>
        {runtimeLink?.url && <div className="panel lab-panel"><span className="kicker">{t('lab.run.link')}</span><p className="mono small setup-url">{runtimeLink.url}</p>{runtimeLink.demo && <small className="muted">{t('lab.run.demoNote')}</small>}<div className="actions"><button className="btn primary" onClick={() => navigator.clipboard?.writeText(runtimeLink.url)}>{t('lab.run.copy')}</button><a className="btn ghost" href={runtimeLink.url} target="_blank" rel="noopener">{t('lab.run.try')}</a></div></div>}
        {runtimeLink?.error && <p className="warning">{errorText(t, runtimeLink.error)}</p>}
        <div className="panel lab-panel">
          <span className="kicker">{t('lab.run.files')}</span>
          <label className="btn secondary file-button" htmlFor="add-results">{t('lab.run.addFiles')}<input id="add-results" type="file" multiple accept="application/json,.json" onChange={event => { const files = [...event.target.files]; event.target.value = ''; if (files.length) importResults(files) }} /></label>
          {importNote && <p className="muted small" role="status">{importNote}</p>}
          <p className="muted small">{t('lab.run.received', { done: done.length, planned: study.plannedParticipants })}</p>
        </div>
      </>}
    </section>
    <aside className="lab-side">
      <div className="panel lab-panel sticky">
        <span className="kicker">{t('lab.run.tips')}</span>
        <ul className="tips">
          <li>{t('lab.run.tip.aloud')}</li>
          <li>{t('lab.run.tip.help')}</li>
          <li>{t('lab.run.tip.notes')}</li>
          <li>{t('lab.run.tip.outcomes')}</li>
        </ul>
      </div>
    </aside>
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
          <Field label={t('lab.docs.duration')} htmlFor="consent-duration"><input id="consent-duration" type="number" min="5" max="240" value={c.durationMin} onChange={event => set({ durationMin: Number(event.target.value) || 30 })} /></Field>
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
    await (await workspace()).deleteSession(sessionKeyOf(study.id, session))
    setConfirming(null)
    onChanged()
  }
  const summary = session => {
    const counts = {}
    session.tasks.forEach(task => { if (task.outcome) counts[task.outcome] = (counts[task.outcome] || 0) + 1 })
    return Object.entries(counts).map(([outcome, count]) => t('lab.results.outcomeCount', { count, label: OUTCOMES[outcome] ? t(`study.outcome.${outcome}`) : outcome })).join(' · ')
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
