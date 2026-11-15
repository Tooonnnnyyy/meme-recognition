import React, { useEffect, useRef, useState } from 'react'
import { gazeFeatures, predictGaze } from './gaze'
import { faceSample } from './Calibration'
import { embedUrl } from './figma'
import { SeqRating } from './Questionnaires'
import { runtimeQuestionnaire } from './studyLink'
import { ViewToggles } from '../ThemeToggle'
import { currentLang, durationText } from '../i18n/index.js'
import { Rich, useT } from '../i18n/react.jsx'

const BASE = import.meta.env.BASE_URL
const clock = ms => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
// How a task ended, as the participant sees it (participant.outcome.<id>).
// Neutral on purpose: the participant is never told they passed or failed,
// which would bias the ease rating that follows, and an unverified task (a
// Figma embed that sends no events) may well have reached its goal.
const SHOWN_OUTCOME = { success: 'finished', 'self-reported': 'finished', unverified: 'finished', skipped: 'skipped', timeout: 'timeout' }
const outcomeLabel = (t, outcome) => (SHOWN_OUTCOME[outcome] ? t(`participant.outcome.${SHOWN_OUTCOME[outcome]}`) : outcome)

// A delete button that asks again: the first press shows "Delete everything"
// and "Cancel" (which takes the focus). The pair stays until one is pressed
// or Escape cancels, with no time limit, and cancelling puts the focus back
// on the first button. The second click of a double click is ignored.
function DeleteButton({ label, className, small = false, onDelete }) {
  const t = useT()
  const [armed, setArmed] = useState(false)
  const armedAt = useRef(0)
  const firstRef = useRef(null)
  const wasArmed = useRef(false)
  useEffect(() => {
    if (wasArmed.current && !armed) firstRef.current?.focus()
    wasArmed.current = armed
  }, [armed])
  const size = small ? ' small-btn' : ''
  const escape = event => { if (event.key === 'Escape') setArmed(false) }
  const confirm = () => { if (performance.now() - armedAt.current > 500) onDelete() }
  return armed
    ? <><button className={`btn danger${size}`} onClick={confirm} onKeyDown={escape}>{t('participant.runner.deleteAll')}</button><button className={`btn ghost${size}`} autoFocus aria-label={t('participant.runner.cancelDelete')} onClick={() => setArmed(false)} onKeyDown={escape}>{t('participant.runner.cancel')}</button></>
    : <button ref={firstRef} className={`btn ${className}${size}`} onClick={() => { armedAt.current = performance.now(); setArmed(true) }}>{label}</button>
}

export function TaskRunner({ study, recorder, gazeModel, subscribe, aspect, cameraOn, cameraLost, notice, onFinish, onStop }) {
  const t = useT()
  const frameRef = useRef(null)
  const recent = useRef([])
  const startedAt = useRef(0)
  const runningRef = useRef(false)
  const [index, setIndex] = useState(0)
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [faceSeen, setFaceSeen] = useState(false)
  const [lastOutcome, setLastOutcome] = useState(null)
  // After each task, the ease rating comes before the next task, when the
  // study asks it.
  const [rating, setRating] = useState(false)
  const { seq } = runtimeQuestionnaire(study)
  const introRef = useRef(null)
  const task = study.tasks[index]
  const taskRef = useRef(task)
  taskRef.current = task
  // Between tasks the card over the frame takes the focus (the button that
  // ended the task is now disabled), and the frame is inert, so Tab cannot
  // reach the covered prototype.
  const intro = !running && !rating
  useEffect(() => { if (intro) introRef.current?.focus() }, [intro, index])

  useEffect(() => subscribe(frame => {
    const features = gazeFeatures(frame.faceResult, aspect())
    setFaceSeen(Boolean(features))
    recorder.recordFace(features ? faceSample(frame, features) : null)
    if (!gazeModel || !features) return
    const point = predictGaze(gazeModel, features)
    const now = performance.now()
    recent.current = [...recent.current.filter(item => 1000 > now - item.t), { t: now, ...point }]
    recorder.recordGaze(point)
  }), [subscribe, aspect, gazeModel, recorder])

  const next = () => {
    if (index + 1 >= study.tasks.length) onFinish()
    else setIndex(index + 1)
  }
  const finishTask = outcome => {
    if (!runningRef.current) return
    runningRef.current = false
    recorder.endTask(outcome)
    setRunning(false)
    setLastOutcome(outcome)
    if (seq) setRating(true)
    else next()
  }
  const rated = value => {
    recorder.rateTask(value, currentLang())
    setRating(false)
    next()
  }
  const finishRef = useRef(finishTask)
  finishRef.current = finishTask

  // One interval per running task: face-detection flicker re-renders often,
  // and an interval rebuilt on each render may never fire.
  useEffect(() => {
    if (!running) return undefined
    const timer = setInterval(() => {
      const ms = performance.now() - startedAt.current
      setElapsed(ms)
      if (ms > taskRef.current.limitSec * 1000) finishRef.current('timeout')
    }, 250)
    return () => clearInterval(timer)
  }, [running])

  const start = event => {
    // Drift check: people look at a button while they click it, so the gaze
    // estimate from the moment of the click shows how far the model drifted.
    if (gazeModel) {
      const rect = event.currentTarget.getBoundingClientRect()
      const now = performance.now()
      const points = recent.current.filter(item => 400 >= now - item.t)
      if (points.length) {
        const x = points.reduce((sum, item) => sum + item.x, 0) / points.length
        const y = points.reduce((sum, item) => sum + item.y, 0) / points.length
        recorder.session.quality.driftChecks.push({ taskId: task.id, errorPx: Math.round(Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2))) })
      }
    }
    recorder.startTask(task)
    startedAt.current = performance.now()
    runningRef.current = true
    setElapsed(0)
    setRunning(true)
    if (study.kind === 'figma') {
      // The embed posts its frames; reaching the goal frame completes the task.
      // The clock and time limit restart when the prototype has loaded.
      recorder.attachFigma(frameRef.current, {
        onReady: () => { startedAt.current = performance.now(); setElapsed(0) },
        onPage: page => { if (runningRef.current && page === taskRef.current.successPage) finishRef.current('success') },
      })
      frameRef.current.src = embedUrl(study.figma, task.start || study.figma.startNodeId)
    } else frameRef.current.src = `${BASE}${study.siteBase}${task.start}`
  }

  const loaded = () => {
    if (!frameRef.current?.contentDocument || frameRef.current.src === 'about:blank') return
    const page = recorder.attachFrame(frameRef.current)
    if (runningRef.current && taskRef.current.successPage && page === taskRef.current.successPage) finishTask('success')
  }

  return <div className="screen runner">
    <div className="taskbar">
      <span className="chip">{t('participant.runner.chip', { n: index + 1, total: study.tasks.length })}</span>
      <div className="task-text"><b>{task.prompt}</b><span className="muted small">{t('participant.runner.thinkAloud')}</span></div>
      <span className="timer mono">{running ? clock(elapsed) : '00:00'}</span>
      <button className="btn ghost" disabled={!running} onClick={() => finishTask('skipped')}>{t('participant.runner.skip')}</button>
      <button className="btn primary" disabled={!running} onClick={() => finishTask(task.successPage ? 'unverified' : 'self-reported')}>{t('participant.done')}</button>
      <ViewToggles pinnedLang />
    </div>
    <div className="site-frame">
      <iframe ref={frameRef} title={study.kind === 'figma' ? t('participant.runner.frameFigma') : t('participant.runner.frameSite')} src="about:blank" onLoad={loaded} allow="fullscreen" inert={!running} />
      {!running && rating && <div className="task-intro"><SeqRating taskNumber={index + 1} outcome={outcomeLabel(t, lastOutcome)} onDone={rated} autoFocus /></div>}
      {intro && <div className="task-intro">
        <div className="panel intro-card">
          <span className="kicker">{t('participant.runner.kicker', { n: index + 1, total: study.tasks.length })}</span>
          <h2 ref={introRef} tabIndex={-1}>{task.prompt}</h2>
          <p className="muted">{t(study.kind === 'figma' ? 'participant.runner.introFigma' : 'participant.runner.introSite', { duration: durationText(t.lang, task.limitSec) })}</p>
          {notice && <p className="warning">{notice}</p>}
          <button className="btn primary" onClick={start}>{t('participant.runner.start', { n: index + 1 })}</button>
        </div>
      </div>}
      <div className="floating">
        <span className="chip live borderless"><span className="dot" />{t(study.kind === 'figma' ? 'participant.runner.localFigma' : 'participant.runner.local')}</span>
        {cameraLost
          ? <span className="chip strong borderless">{t('participant.runner.cameraStopped')}</span>
          : <span className="mono small muted">{cameraOn ? [t('participant.runner.cameraOn'), t(gazeModel ? 'participant.runner.gazeOn' : 'participant.runner.gazeOff'), !faceSeen && t('participant.runner.faceHidden')].filter(Boolean).join(' · ') : t('participant.runner.cameraOff')}</span>}
        <DeleteButton label={t('participant.runner.stop')} className="secondary" small onDelete={onStop} />
      </div>
    </div>
  </div>
}

// "a, b and c" in the language of t.
const listText = (t, items) => (items.length > 1 ? t('participant.list.and', { rest: items.slice(0, -1).join(t('participant.list.comma')), last: items.at(-1) }) : items.join(''))

// Where the participant sends the results file: the researcher's name, their
// contact, both, or (with neither in the link) whoever sent the link.
const sendKey = contact => (contact?.researcher && contact?.contact ? 'participant.finished.sendBoth' : contact?.researcher ? 'participant.finished.sendName' : contact?.contact ? 'participant.finished.sendContact' : 'participant.finished.sendSender')

export function Finished({ session, contact, saved, onSaved, onReview, onDelete }) {
  const t = useT()
  const download = () => {
    const blob = new Blob([JSON.stringify(session)], { type: 'application/json' })
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `usability-session-${session.participant}.json` })
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    onSaved()
  }
  // Names only the camera data the file really has.
  const rated = session.tasks.some(task => task.seq != null) || session.sus || session.umuxLite
  const camera = listText(t, [rated && t('participant.finished.ratings'), session.gaze.length && t('participant.finished.gaze'), (session.face.length || session.baseline) && t('participant.finished.face'), session.quality.accuracy && t('participant.finished.accuracy')].filter(Boolean))
  const plus = camera && t('participant.finished.plus', { list: camera })
  return <div className="screen">
    <header className="topbar"><div className="brand"><span className="mark">◎</span><div><strong>Usability Copilot</strong><small>{t('participant.studyLine', { title: session.study.title, participant: session.participant })}</small></div></div><div className="actions"><span className="chip">{t('participant.cameraOffChip')}</span><ViewToggles pinnedLang /></div></header>
    <main className="finished">
      <span className="kicker">{t('participant.finished.kicker')}</span>
      <h1>{t('participant.finished.title')}</h1>
      <p className="lede">{t(session.study.kind === 'figma' ? 'participant.finished.ledeFigma' : 'participant.finished.ledeSite', { plus })}</p>
      <div className="panel outcome-list">
        {session.tasks.map(task => <div key={task.id} className="outcome"><span className="mono">{task.id}</span><span>{task.prompt}</span><span className="muted">{outcomeLabel(t, task.outcome)}</span><span className="mono">{clock(task.end - task.start)}</span></div>)}
      </div>
      <div className="actions">
        <button className="btn primary" onClick={download}>{saved ? t('participant.finished.downloadAgain') : t('participant.finished.download')}</button>
        <button className="btn ghost" onClick={onReview}>{t('participant.finished.review')}</button>
        <DeleteButton label={t('participant.finished.delete')} className="ghost" onDelete={onDelete} />
      </div>
      <div className="finished-next" aria-live="polite">{saved && <>
        <p className="send-to"><Rich text={t(sendKey(contact), contact || {})} tags={{ b: text => <b>{text}</b> }} /></p>
        <p className="muted small">{t('participant.finished.savedHint')}</p>
      </>}</div>
    </main>
  </div>
}
