import React, { useEffect, useRef, useState } from 'react'
import { NATIVE, currentLang, pinLang, pinnedLang } from '../i18n/index.js'
import { Rich, useT } from '../i18n/react.jsx'
import { LabHeader, studyHref } from './LabNav'
import { saveSession, sessionKeyOf, sessionsOf, workspace } from './workspace'
import { OUTCOMES, participantId, taskOrder, toRuntimeStudy } from '../research/studyModel'
import { createRecorder } from '../research/recorder'
import { embedUrl } from '../research/figma'
import { SeqRating, SusForm, UmuxLiteForm } from '../research/Questionnaires'
import { NOTE_KINDS } from '../research/Review'

const BASE = import.meta.env.BASE_URL
const clock = ms => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
// Hotkeys: notes by their first letter, outcomes by number.
const NOTE_KEYS = { n: 'note', p: 'problem', q: 'quote', a: 'assist', e: 'error' }
const OUTCOME_KEYS = { 1: 'success', 2: 'partial', 3: 'failed', 4: 'skipped' }
const typing = target => /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName) || target?.isContentEditable
const kbd = text => <kbd>{text}</kbd>
// From Begin session to the end, the session screens (and the moderator's
// panel, which shares the page) show the study's language, as participants
// see it everywhere else. The questionnaires let the participant switch
// language for this visit; afterwards the console goes back to the
// moderator's own choice.
const releaseLang = () => { if (pinnedLang()) pinLang(null) }
// Whole sentences, joined the way each language joins them.
function sentences(lang, parts) {
  return parts.filter(Boolean).join(lang === 'zh' ? '' : ' ')
}

// A moderated session on this computer. The participant sees the task (and
// the embedded prototype, if any); the moderator's panel on the right holds
// the success criteria, outcome buttons and quick notes. Everything is saved
// to the workspace as it happens, so a closed tab loses at most one note.
export function Console({ id, slot }) {
  const t = useT()
  const pilot = slot === 'pilot'
  const index = pilot ? 0 : Math.max(0, Number(slot) || 0)
  const [study, setStudy] = useState(null)
  const [code, setCode] = useState('')
  const [phase, setPhase] = useState('setup')
  const [taskIndex, setTaskIndex] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [consented, setConsented] = useState(false)
  const [noteKind, setNoteKind] = useState('note')
  const [noteText, setNoteText] = useState('')
  const [notes, setNotes] = useState([])
  const [lastOutcome, setLastOutcome] = useState(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const recorderRef = useRef(null)
  const frameRef = useRef(null)
  const noteRef = useRef(null)
  const startedAt = useRef(0)
  const runningRef = useRef(false)

  useEffect(() => {
    (async () => {
      const found = await (await workspace()).getStudy(id)
      if (!found) return setStudy(false)
      const existing = await sessionsOf(id)
      setCode(pilot ? `PILOT-${existing.filter(session => session.pilot).length + 1}` : participantId(index))
      setStudy(found)
    })()
  }, [id, slot])
  useEffect(() => releaseLang, [])

  const order = study ? taskOrder(study, index) : []
  const runtime = study ? toRuntimeStudy(study, order) : null
  const task = runtime?.tasks[taskIndex]
  const definition = study ? study.tasks.find(item => item.id === task?.id) : undefined
  const embedded = runtime && runtime.kind !== 'observed'
  const outcomeLabel = outcome => (OUTCOMES[outcome] ? t(`study.outcome.${outcome}`) : outcome)
  const kindLabel = kind => (NOTE_KINDS[kind] ? t(`study.note.${kind}`) : kind)

  const persist = () => recorderRef.current && saveSession(id, recorderRef.current.session)

  const begin = () => {
    const recorder = createRecorder({ study: runtime, participant: code })
    Object.assign(recorder.session, { mode: 'moderated', pilot, consentConfirmedAt: new Date().toISOString(), taskOrder: order, notes: [] })
    recorderRef.current = recorder
    persist()
    pinLang(runtime.lang)
    setPhase('intro')
  }

  const start = () => {
    const recorder = recorderRef.current
    recorder.startTask(task)
    startedAt.current = performance.now()
    runningRef.current = true
    setElapsed(0)
    setPhase('running')
    persist()
    if (runtime.kind === 'figma') {
      recorder.attachFigma(frameRef.current, {
        onReady: () => { startedAt.current = performance.now(); setElapsed(0) },
        onPage: page => { if (runningRef.current && page === task.successPage) endRef.current('success') },
      })
      frameRef.current.src = embedUrl(runtime.figma, task.start || runtime.figma.startNodeId)
    } else if (embedded) frameRef.current.src = `${BASE}${runtime.siteBase}${task.start}`
  }
  const loaded = () => {
    if (runtime?.kind === 'figma' || !frameRef.current?.contentDocument || frameRef.current.src === 'about:blank') return
    const page = recorderRef.current.attachFrame(frameRef.current)
    if (runningRef.current && task?.successPage && page === task.successPage) endTask('success')
  }

  const endTask = outcome => {
    if (!runningRef.current) return
    runningRef.current = false
    recorderRef.current.endTask(outcome)
    setLastOutcome(outcome)
    persist()
    if (study.questionnaire.seq) setPhase('rating')
    else advance()
  }
  const endRef = useRef(endTask)
  endRef.current = endTask

  const advance = () => {
    if (taskIndex + 1 < runtime.tasks.length) {
      setTaskIndex(taskIndex + 1)
      setPhase('intro')
    } else if (study.questionnaire.post !== 'none') setPhase('post')
    else finish()
  }
  const rated = value => {
    recorderRef.current.rateTask(value, currentLang())
    persist()
    advance()
  }
  const finish = () => {
    const recorder = recorderRef.current
    runningRef.current = false
    if (recorder.session.tasks.at(-1)?.end === null) recorder.endTask('skipped')
    recorder.stop()
    recorder.session.finishedAt = new Date().toISOString()
    persist()
    releaseLang()
    setPhase('done')
  }

  const addNote = event => {
    event?.preventDefault()
    const note = recorderRef.current?.addNote(noteKind, noteText)
    if (!note) return
    persist()
    setNotes([...recorderRef.current.session.notes])
    setNoteText('')
    setNoteKind('note')
  }
  const removeNote = note => {
    recorderRef.current.removeNote(note)
    persist()
    setNotes([...recorderRef.current.session.notes])
  }

  // One interval while a task runs.
  useEffect(() => {
    if (phase !== 'running') return undefined
    const timer = setInterval(() => setElapsed(performance.now() - startedAt.current), 250)
    return () => clearInterval(timer)
  }, [phase])

  // Warn before closing the tab mid-session (it is saved, but unfinished).
  // The browser shows its own wording, in its own language.
  useEffect(() => {
    if (['setup', 'done'].includes(phase)) return undefined
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    addEventListener('beforeunload', warn)
    return () => removeEventListener('beforeunload', warn)
  }, [phase])

  // Moderator hotkeys, ignored while typing in a field.
  useEffect(() => {
    const onKey = event => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (typing(event.target)) {
        if (event.key === 'Escape') event.target.blur()
        return
      }
      const key = event.key.toLowerCase()
      if (phase === 'setup' || phase === 'done' || phase === 'post') return
      if (NOTE_KEYS[key]) {
        event.preventDefault()
        setNoteKind(NOTE_KEYS[key])
        noteRef.current?.focus()
      } else if (phase === 'running' && OUTCOME_KEYS[key]) {
        event.preventDefault()
        endRef.current(OUTCOME_KEYS[key])
      } else if (phase === 'intro' && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault()
        start()
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  if (!study) return <div className="screen"><LabHeader /><main className="center-note">{study === false
    ? <><h2>{t('console.missing.title')}</h2><a className="btn primary" href="#/">{t('console.missing.back')}</a></>
    : <p className="muted">{t('console.loading')}</p>}</main></div>

  if (phase === 'post') {
    const Form = study.questionnaire.post === 'sus' ? SusForm : UmuxLiteForm
    return <Form study={runtime} participant={code} onDone={answers => {
      if (study.questionnaire.post === 'sus') recorderRef.current.setSus(answers, currentLang())
      else recorderRef.current.setUmuxLite(answers, currentLang())
      finish()
    }} />
  }

  if (phase === 'setup') return <div className="screen">
    <LabHeader study={study} current="run" />
    <main className="center-note console-setup">
      <span className="kicker">{pilot ? t('console.setup.kickerPilot') : t('console.setup.kicker')}</span>
      <h2>{t('console.session', { code })}</h2>
      <p className="muted">{sentences(t.lang, [
        t('console.setup.order', { count: runtime.tasks.length, order: order.join(' → ') }),
        study.questionnaire.seq && t('console.setup.seq'),
        study.questionnaire.post !== 'none' && t('console.setup.post', { scale: study.questionnaire.post === 'sus' ? 'SUS' : 'UMUX-Lite' }),
      ])}</p>
      {runtime.lang !== t.lang && <p className="muted">{t('console.setup.langMismatch', { lang: NATIVE[runtime.lang] })}</p>}
      <ol className="checklist">
        <li>{t('console.setup.welcome')}</li>
        <li>{study.consent.researcher ? t('console.setup.consent') : t('console.setup.consentGenerate')}</li>
        <li>{t('console.setup.thinkAloud')}</li>
      </ol>
      <label className="check" htmlFor="consented"><input id="consented" type="checkbox" checked={consented} onChange={event => setConsented(event.target.checked)} />{t('console.setup.consented')}</label>
      <div className="actions">
        <button className="btn primary" disabled={!consented} onClick={begin}>{t('console.setup.begin')}</button>
        <a className="btn ghost" href={studyHref('study', study.id, 'run')}>{t('console.setup.back')}</a>
      </div>
    </main>
  </div>

  if (phase === 'done') {
    const session = recorderRef.current.session
    const next = pilot ? null : index + 1
    return <div className="screen">
      <LabHeader study={study} current="run" />
      <main className="center-note">
        <span className="kicker">{t('console.done.kicker')}</span>
        <h2>{t('console.done.title', { code })}</h2>
        <ul className="outcome-summary">{session.tasks.map(item => <li key={item.id}><b className="mono">{item.id}</b> {outcomeLabel(item.outcome)} · {clock((item.end ?? item.start) - (item.ready ?? item.start))}{item.seq ? ` · ${t('console.done.ease', { value: item.seq })}` : ''}</li>)}</ul>
        <p className="muted">{[
          t('console.done.notes', { count: session.notes?.length || 0 }),
          session.sus && `SUS ${session.sus.score}`,
          session.umuxLite && `UMUX-Lite ${session.umuxLite.raw}`,
        ].filter(Boolean).join(' · ')}{t('console.fullStop')}</p>
        <div className="actions">
          {next !== null && next < study.plannedParticipants && <a className="btn primary" href={studyHref('run', study.id, String(next))}>{t('console.done.next', { code: participantId(next) })}</a>}
          <a className="btn secondary" href={studyHref('review', study.id, sessionKeyOf(study.id, session))}>{t('console.done.review')}</a>
          <a className="btn ghost" href={studyHref('study', study.id, 'results')}>{t('console.done.results')}</a>
        </div>
      </main>
    </div>
  }

  const overTime = phase === 'running' && elapsed > task.limitSec * 1000
  const taskNotes = notes.filter(note => note.taskId === task?.id)
  const position = { n: taskIndex + 1, total: runtime.tasks.length }
  return <div className="screen console">
    <header className="topbar console-bar">
      <div className="brand"><span className="mark">◎</span><div><strong>{study.title}</strong><small>{code}{pilot ? ` · ${t('console.bar.pilot')}` : ''} · {t('console.bar.task', position)}</small></div></div>
      <div className="actions">
        <span className={`timer mono ${overTime ? 'over' : ''}`} aria-live="off">{phase === 'running' ? clock(elapsed) : '00:00'}</span>
        {overTime && <span className="chip strong">{t('console.over', { minutes: Math.round(task.limitSec / 60) })}</span>}
        {confirmEnd
          ? <><button className="btn danger small-btn" onClick={finish}>{t('console.endNow')}</button><button className="btn ghost small-btn" autoFocus onClick={() => setConfirmEnd(false)}>{t('console.cancel')}</button></>
          : <button className="btn ghost small-btn" onClick={() => setConfirmEnd(true)}>{t('console.end')}</button>}
      </div>
    </header>
    <div className="console-body">
      <main className="console-stage">
        {embedded && <iframe ref={frameRef} className={phase === 'running' ? '' : 'is-waiting'} title={t('console.stage.frameTitle')} src="about:blank" onLoad={loaded} allow="fullscreen" />}
        {phase === 'intro' && <div className="stage-card panel">
          {lastOutcome && <span className="chip live">{t('console.stage.previous', { outcome: outcomeLabel(lastOutcome).toUpperCase() })}</span>}
          <span className="kicker">{t('console.stage.task', position)}</span>
          <h2 className="task-big">{task.prompt}</h2>
          <button className="btn primary" onClick={start}><Rich text={t('console.stage.start')} tags={{ kbd }} /></button>
        </div>}
        {phase === 'running' && !embedded && <div className="stage-card panel">
          <span className="kicker">{t('console.stage.task', position)}</span>
          <h2 className="task-big">{task.prompt}</h2>
          <p className="muted">{t('console.stage.thinkAloud')}</p>
        </div>}
        {phase === 'running' && embedded && <div className="task-ribbon"><Rich text={t('console.stage.ribbon', position)} tags={{ b: text => <b>{text}</b>, prompt: () => task.prompt }} /></div>}
        {phase === 'rating' && <div className="stage-card stage-plain"><SeqRating taskNumber={taskIndex + 1} outcome={outcomeLabel(lastOutcome)} onDone={rated} /></div>}
      </main>
      <aside className="console-panel" aria-label={t('console.panel.label')}>
        <section>
          <span className="kicker">{t('console.panel.success')}</span>
          <p>{definition?.success || <span className="muted">{t('console.panel.noSuccess')}</span>}</p>
        </section>
        <section>
          <span className="kicker">{t('console.panel.outcome')}</span>
          <div className="outcome-buttons">
            {Object.entries(OUTCOME_KEYS).map(([key, outcome]) => <button key={key} className={`btn small-btn ${outcome === 'success' ? 'primary' : 'ghost'}`} disabled={phase !== 'running'} onClick={() => endTask(outcome)}><kbd>{key}</kbd> {outcomeLabel(outcome)}</button>)}
          </div>
        </section>
        <section>
          <span className="kicker">{t('console.panel.notes')}</span>
          <form className="note-form" onSubmit={addNote}>
            <div className="note-kinds" role="radiogroup" aria-label={t('console.panel.noteType')}>
              {Object.keys(NOTE_KINDS).map(kind => <button key={kind} type="button" role="radio" aria-checked={noteKind === kind} className={`kind ${noteKind === kind ? 'on' : ''}`} onClick={() => { setNoteKind(kind); noteRef.current?.focus() }}><kbd>{kind[0].toUpperCase()}</kbd> {kindLabel(kind)}</button>)}
            </div>
            <input ref={noteRef} aria-label={t('console.panel.noteText', { kind: kindLabel(noteKind) })} value={noteText} disabled={phase === 'setup'} placeholder={noteKind === 'quote' ? t('console.panel.quotePlaceholder') : t('console.panel.notePlaceholder')} onChange={event => setNoteText(event.target.value)} />
            <button className="btn secondary small-btn" type="submit" disabled={!noteText.trim()}><Rich text={t('console.panel.add')} tags={{ kbd }} /></button>
          </form>
          <ul className="console-notes">
            {taskNotes.slice().reverse().map((note, at) => <li key={`${note.t}-${at}`} className={`note note-${note.kind}`}>
              <span className="mono small">{clock(note.t - (recorderRef.current.session.tasks.find(item => item.id === note.taskId)?.start ?? 0))}</span>
              <span className="chip">{kindLabel(note.kind).toUpperCase()}</span>
              <span>{note.kind === 'quote' ? `“${note.text}”` : note.text}</span>
              {note.tags.map(tag => <span key={tag} className="tag">#{tag}</span>)}
              <button className="chip-x" aria-label={t('console.panel.deleteNote')} onClick={() => removeNote(note)}>×</button>
            </li>)}
          </ul>
        </section>
        <p className="muted small hotkeys"><Rich text={t('console.panel.hotkeys')} tags={{ kbd }} /></p>
      </aside>
    </div>
  </div>
}
