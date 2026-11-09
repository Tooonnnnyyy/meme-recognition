import React, { useEffect, useMemo, useRef, useState } from 'react'
import { describeSignal, detectSignals, findCandidates, sessionFixations, STRONG, MEDIUM, WEAK } from './signals'
import { ThemeToggle } from '../ThemeToggle'

const BASE = import.meta.env.BASE_URL
const clock = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
const OUTCOME_CLASS = { success: 'ok', 'self-reported': 'ok', unverified: 'bad', skipped: 'bad', timeout: 'bad' }

function analyze(session) {
  const signals = detectSignals(session)
  return {
    signals,
    candidates: findCandidates(signals),
    fixations: sessionFixations(session),
    origin: session.tasks[0]?.start ?? 0,
    duration: Math.max(1, ...session.tasks.map(task => task.end ?? 0)),
  }
}

// The page and scroll position the participant was looking at, at time t.
function viewAt(session, t) {
  const navigation = session.events.filter(event => event.type === 'navigate' && event.t <= t).pop()
  if (!navigation) return null
  const scroll = session.events.filter(event => event.type === 'scroll' && event.page === navigation.page && event.t >= navigation.t && event.t <= t).pop()
  return { page: navigation.page, scrollX: scroll?.x || 0, scrollY: scroll?.y || 0 }
}

function readSession(text) {
  const data = JSON.parse(text)
  if (data?.version !== 1 || !Array.isArray(data.tasks) || !Array.isArray(data.events)) throw new Error('This is not a Usability Copilot session file.')
  return data
}

function Replay({ session, candidate, fixations }) {
  const boxRef = useRef(null)
  const frameRef = useRef(null)
  const [width, setWidth] = useState(800)
  const viewport = session.viewport || { width: 1280, height: 720 }
  const view = viewAt(session, (candidate.start + candidate.end) / 2) || viewAt(session, candidate.end)
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(boxRef.current)
    return () => observer.disconnect()
  }, [])
  if (!view) return <div className="replay empty" ref={boxRef}><p className="muted">No page was open at this moment.</p></div>
  const scale = width / viewport.width
  const inWindow = item => item.page === view.page && item.t >= candidate.start && item.t <= candidate.end
  const spots = fixations.filter(fixation => fixation.page === view.page && fixation.end >= candidate.start && fixation.start <= candidate.end)
  const clicks = session.events.filter(event => event.type === 'click' && inWindow(event))
  return <div className="replay" ref={boxRef} style={{ height: `${viewport.height * scale}px` }}>
    <div className="replay-stage" style={{ width: `${viewport.width}px`, height: `${viewport.height}px`, transform: `scale(${scale})` }}>
      <iframe ref={frameRef} key={`${view.page}-${candidate.id}`} title="Page at this moment" tabIndex={-1} src={`${BASE}${session.study.siteBase}${view.page}.html`} onLoad={() => frameRef.current?.contentWindow?.scrollTo(view.scrollX, view.scrollY)} />
      <svg className="replay-overlay" width={viewport.width} height={viewport.height} aria-hidden="true">
        {/* heat spots sit on the tested website, which is light in both themes */}
        <defs><radialGradient id="heat-spot"><stop offset="0" stopColor="#ff5a28" stopOpacity=".5" /><stop offset="1" stopColor="#ff5a28" stopOpacity="0" /></radialGradient></defs>
        {spots.map((spot, index) => <circle key={index} cx={spot.x - view.scrollX} cy={spot.y - view.scrollY} r={Math.min(70, 18 + (spot.end - spot.start) / 12)} className="heat" fill="url(#heat-spot)" />)}
        {clicks.map((click, index) => <g key={index} className="click-mark"><circle cx={click.x - view.scrollX} cy={click.y - view.scrollY} r="11" /><text x={click.x - view.scrollX + 14} y={click.y - view.scrollY - 10}>{index + 1}</text></g>)}
      </svg>
    </div>
    <span className="chip replay-tag">{view.page} · {clock(candidate.start)}–{clock(candidate.end)} · {session.quality.gazeEnabled ? `${spots.length} fixations` : 'gaze off'} · {clicks.length} clicks</span>
  </div>
}

function Timeline({ session, analysis, selected, onSelect }) {
  // The axis runs from the first task to the last; consent and calibration are left out.
  const span = Math.max(1, analysis.duration - analysis.origin)
  const pct = t => `${Math.max(0, (t - analysis.origin) / span) * 100}%`
  const len = ms => `${(ms / span) * 100}%`
  // Moments are padded by 2 s, so clip them to the tasks' time range.
  const clipped = item => ({ left: pct(Math.max(item.start, analysis.origin)), width: len(Math.min(item.end, analysis.duration) - Math.max(item.start, analysis.origin)) })
  const lane = (strength, label) => <div className="lane"><span>{label}</span><div className="track">
    {analysis.candidates.map(candidate => <button key={candidate.id} className={`cand ${selected?.id === candidate.id ? 'is-selected' : ''}`} style={clipped(candidate)} onClick={() => onSelect(candidate.id)} aria-label={`Moment at ${clock(candidate.start)}`} />)}
    {analysis.signals.filter(signal => signal.strength === strength).map((signal, index) => <i key={index} className={`mk ${strength}`} style={{ left: pct(signal.start), width: `max(6px, ${len(signal.end - signal.start)})` }} title={describeSignal(signal)} />)}
  </div></div>
  return <div className="timeline">
    <div className="lane"><span>TASKS</span><div className="track">
      {session.tasks.map(task => <i key={task.id} className={`seg ${OUTCOME_CLASS[task.outcome] || ''}`} style={{ left: pct(task.start), width: len((task.end ?? task.start) - task.start) }}>{task.id} {OUTCOME_CLASS[task.outcome] === 'ok' ? '✓' : '✕'}</i>)}
      {selected && <i className="playhead" style={{ left: pct(selected.start) }} />}
    </div></div>
    {lane(STRONG, 'STRONG')}
    {lane(MEDIUM, 'MEDIUM')}
    {lane(WEAK, 'WEAK')}
    <div className="axis"><span /><div>{[0, 0.25, 0.5, 0.75, 1].map(part => <span key={part}>{clock(analysis.origin + span * part)}</span>)}</div></div>
  </div>
}

export function Review({ initialSession }) {
  const [session, setSession] = useState(initialSession)
  const [error, setError] = useState('')
  const [reviews, setReviews] = useState(initialSession?.reviews || {})
  const [selectedId, setSelectedId] = useState(null)
  const analysis = useMemo(() => (session ? analyze(session) : null), [session])
  const selected = analysis?.candidates.find(candidate => candidate.id === selectedId) || analysis?.candidates[0] || null

  const load = file => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = readSession(reader.result)
        setSession(data)
        setReviews(data.reviews || {})
        setSelectedId(null)
        setError('')
      } catch (problem) {
        setError(problem instanceof SyntaxError ? 'That file is not valid JSON.' : problem.message)
      }
    }
    reader.readAsText(file)
  }
  const exportFile = () => {
    const blob = new Blob([JSON.stringify({ ...session, reviews })], { type: 'application/json' })
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `usability-session-${session.participant}-reviewed.json` })
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  }
  const setReview = (id, change) => setReviews(current => ({ ...current, [id]: { status: 'open', severity: null, ...current[id], ...change } }))

  const picker = <label className="btn ghost file-button" htmlFor="session-file">{session ? 'Load another file' : 'Choose a session file'}<input id="session-file" type="file" accept="application/json,.json" onChange={event => event.target.files[0] && load(event.target.files[0])} /></label>

  if (!session) return <div className="screen">
    <header className="topbar"><div className="brand"><span className="mark">◎</span><div><strong>Usability Copilot</strong><small>Researcher review</small></div></div><ThemeToggle /></header>
    <main className="center-note"><span className="kicker">Review a session</span><h2>Load a session file</h2><p className="muted">Participants download a results file at the end of a session. Load it here to see flagged moments. Files are read in this browser and not uploaded.</p>{picker}{error && <p className="warning">{error}</p>}</main>
  </div>

  const { quality } = session
  const facePercent = quality.frames ? Math.round((quality.faceFrames / quality.frames) * 100) : null
  const drift = quality.driftChecks?.length ? Math.round(quality.driftChecks.reduce((sum, check) => sum + check.errorPx, 0) / quality.driftChecks.length) : null
  const reviewed = analysis.candidates.filter(candidate => ['confirmed', 'rejected'].includes(reviews[candidate.id]?.status)).length

  return <div className="screen review-screen">
    <header className="topbar"><div className="brand"><span className="mark">◎</span><div><strong>Session review · {session.participant}</strong><small>{session.study.title} · {session.tasks.length} tasks · {clock(analysis.duration)}</small></div></div><div className="actions">{picker}<button className="btn secondary" onClick={exportFile}>Export reviewed file</button><ThemeToggle /></div></header>
    {error && <p className="warning banner">{error}</p>}
    <div className="review">
      <section className="stage">
        <div className="quality">
          <span className="kicker">Data quality</span>
          <span className={`chip ${quality.gazeEnabled ? 'live' : ''}`}>{quality.gazeEnabled ? `GAZE ${quality.accuracy.meanDegrees.toFixed(1)}° · PASS` : 'GAZE OFF'}</span>
          {facePercent !== null && <span className="chip">{facePercent}% FRAMES WITH FACE</span>}
          {drift !== null && <span className="chip">DRIFT CHECK ×{quality.driftChecks.length} · {drift} PX</span>}
          <span className="chip">NO VIDEO STORED</span>
        </div>
        {selected ? <Replay session={session} candidate={selected} fixations={analysis.fixations} /> : <div className="replay empty"><p className="muted">No moments were flagged in this session.</p></div>}
        <Timeline session={session} analysis={analysis} selected={selected} onSelect={setSelectedId} />
      </section>
      <aside className="sidebar">
        <div className="sidebar-head"><span className="kicker">Candidate moments</span><h3>{analysis.candidates.length} flagged · {reviewed} reviewed</h3></div>
        <div className="cands">
          {analysis.candidates.map(candidate => {
            const review = reviews[candidate.id] || {}
            const task = session.tasks.find(item => item.id === candidate.taskId)
            return <article key={candidate.id} className={`card ${selected?.id === candidate.id ? 'active' : ''} ${review.status === 'rejected' ? 'is-rejected' : ''}`} onClick={() => setSelectedId(candidate.id)}>
              <div className="card-top"><b className="mono">{clock(candidate.start)}–{clock(candidate.end)} · {candidate.taskId}</b><span className={`chip ${review.status === 'confirmed' ? 'live' : ''}`}>{review.status === 'confirmed' ? 'CONFIRMED' : review.status === 'rejected' ? 'REJECTED' : `${candidate.confidence.toUpperCase()} CONFIDENCE`}</span></div>
              {task && <p className="muted small">{task.prompt}</p>}
              <ul className="evidence">{candidate.signals.map((signal, index) => <li key={index} className={signal.strength}>{describeSignal(signal)}</li>)}</ul>
              <div className="card-actions" onClick={event => event.stopPropagation()}>
                <button className={`btn small-btn ${review.status === 'confirmed' ? 'primary' : 'ghost'}`} onClick={() => setReview(candidate.id, { status: 'confirmed' })}>Confirm</button>
                <button className={`btn small-btn ${review.status === 'rejected' ? 'secondary' : 'ghost'}`} onClick={() => setReview(candidate.id, { status: 'rejected', severity: null })}>Reject</button>
                <div className="severity" role="group" aria-label="Severity, 0 to 4">{[0, 1, 2, 3, 4].map(level => <button key={level} disabled={review.status !== 'confirmed'} className={review.severity === level ? 'on' : ''} onClick={() => setReview(candidate.id, { severity: level })}>{level}</button>)}</div>
              </div>
            </article>
          })}
          {!analysis.candidates.length && <p className="muted small">Nothing was flagged. Check the data quality chips: with gaze off, only click and page signals are available.</p>}
        </div>
        <p className="muted small sidebar-note">Severity uses Nielsen’s 0–4 scale (0 not a problem, 4 catastrophe). Flags are evidence for you to judge, not findings.</p>
      </aside>
    </div>
  </div>
}
