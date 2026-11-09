import React, { useEffect, useRef, useState } from 'react'
import { gazeFeatures, predictGaze } from './gaze'
import { faceSample } from './Calibration'
import { ThemeToggle } from '../ThemeToggle'

const BASE = import.meta.env.BASE_URL
const clock = ms => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
const OUTCOME_LABELS = { success: 'Completed', 'self-reported': 'Done (self-reported)', unverified: 'Stopped before the goal', skipped: 'Skipped', timeout: 'Ran out of time' }

export function TaskRunner({ study, recorder, gazeModel, subscribe, aspect, cameraOn, notice, onFinish, onStop }) {
  const frameRef = useRef(null)
  const recent = useRef([])
  const startedAt = useRef(0)
  const runningRef = useRef(false)
  const [index, setIndex] = useState(0)
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [faceSeen, setFaceSeen] = useState(false)
  const [lastOutcome, setLastOutcome] = useState(null)
  const [confirmStop, setConfirmStop] = useState(false)
  const task = study.tasks[index]
  const taskRef = useRef(task)
  taskRef.current = task

  useEffect(() => subscribe(frame => {
    const features = gazeFeatures(frame.faceResult, aspect())
    setFaceSeen(Boolean(features))
    recorder.recordFace(features ? faceSample(frame, features) : null)
    if (!gazeModel || !features) return
    const point = predictGaze(gazeModel, features)
    const now = performance.now()
    recent.current = [...recent.current.filter(item => now - item.t < 1000), { t: now, ...point }]
    recorder.recordGaze(point)
  }), [subscribe, aspect, gazeModel, recorder])

  const finishTask = outcome => {
    if (!runningRef.current) return
    runningRef.current = false
    recorder.endTask(outcome)
    setRunning(false)
    setLastOutcome(outcome)
    if (index + 1 >= study.tasks.length) onFinish()
    else setIndex(index + 1)
  }

  useEffect(() => {
    if (!running) return undefined
    const timer = setInterval(() => {
      const ms = performance.now() - startedAt.current
      setElapsed(ms)
      if (ms > task.limitSec * 1000) finishTask('timeout')
    }, 250)
    return () => clearInterval(timer)
  })

  const start = event => {
    // Drift check: people look at a button while they click it, so the gaze
    // estimate from the moment of the click shows how far the model drifted.
    if (gazeModel) {
      const rect = event.currentTarget.getBoundingClientRect()
      const now = performance.now()
      const points = recent.current.filter(item => now - item.t <= 400)
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
    frameRef.current.src = `${BASE}${study.siteBase}${task.start}`
  }

  const loaded = () => {
    if (!frameRef.current?.contentDocument || frameRef.current.src === 'about:blank') return
    const page = recorder.attachFrame(frameRef.current)
    if (runningRef.current && taskRef.current.successPage && page === taskRef.current.successPage) finishTask('success')
  }

  return <div className="screen runner">
    <div className="taskbar">
      <span className="chip">TASK {index + 1} / {study.tasks.length}</span>
      <div className="task-text"><b>{task.prompt}</b><span className="muted small">Think aloud if you like. Click “I’m done” when you have finished.</span></div>
      <span className="timer mono">{running ? clock(elapsed) : '00:00'}</span>
      <button className="btn ghost" disabled={!running} onClick={() => finishTask('skipped')}>Skip task</button>
      <button className="btn primary" disabled={!running} onClick={() => finishTask(task.successPage ? 'unverified' : 'self-reported')}>I’m done</button>
      <ThemeToggle />
    </div>
    <div className="site-frame">
      <iframe ref={frameRef} title="Website being tested" src="about:blank" onLoad={loaded} />
      {!running && <div className="task-intro">
        <div className="panel intro-card">
          {lastOutcome && <span className="chip live">PREVIOUS TASK · {OUTCOME_LABELS[lastOutcome].toUpperCase()}</span>}
          <span className="kicker">Task {index + 1} of {study.tasks.length}</span>
          <h2>{task.prompt}</h2>
          <p className="muted">Take your time and use the website as you normally would. You have up to {Math.round(task.limitSec / 60)} minutes.</p>
          {notice && <p className="warning">{notice}</p>}
          <button className="btn primary" onClick={start}>Start task {index + 1}</button>
        </div>
      </div>}
      <div className="floating">
        <span className="chip live borderless"><span className="dot" />LOCAL</span>
        <span className="mono small muted">{cameraOn ? `camera on · ${gazeModel ? 'gaze on' : 'gaze off'}${faceSeen ? '' : ' · face not visible'}` : 'camera off'}</span>
        {confirmStop
          ? <button className="btn danger small-btn" onClick={onStop}>Delete everything</button>
          : <button className="btn secondary small-btn" onClick={() => setConfirmStop(true)}>Stop and delete</button>}
      </div>
    </div>
  </div>
}

export function Finished({ session, onReview, onDelete }) {
  const [saved, setSaved] = useState(false)
  const download = () => {
    const blob = new Blob([JSON.stringify(session)], { type: 'application/json' })
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `usability-session-${session.participant}.json` })
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    setSaved(true)
  }
  return <div className="screen">
    <header className="topbar"><div className="brand"><span className="mark">◎</span><div><strong>Usability Copilot</strong><small>Study · {session.study.title} · participant {session.participant}</small></div></div><div className="actions"><span className="chip">CAMERA OFF</span><ThemeToggle /></div></header>
    <main className="finished">
      <span className="kicker">Step 3 of 3 · Finished</span>
      <h1>Thank you</h1>
      <p className="lede">The camera is off. Your results file contains timestamps, task times, clicks and signal numbers. It has no video and no images of you.</p>
      <div className="panel outcome-list">
        {session.tasks.map(task => <div key={task.id} className="outcome"><span className="mono">{task.id}</span><span>{task.prompt}</span><span className="muted">{OUTCOME_LABELS[task.outcome]}</span><span className="mono">{clock(task.end - task.start)}</span></div>)}
      </div>
      <div className="actions">
        <button className="btn primary" onClick={download}>{saved ? 'Download again' : 'Download results file'}</button>
        <button className="btn ghost" onClick={onReview}>Review this session (researcher)</button>
        <button className="btn ghost" onClick={onDelete}>Delete my data</button>
      </div>
    </main>
  </div>
}
