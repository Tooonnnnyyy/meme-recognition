import React, { useEffect, useRef, useState } from 'react'
import { describeSignal, detectSignals, findCandidates, sessionFixations, STRONG, MEDIUM, WEAK } from './signals'
import { ThemeToggle } from '../ThemeToggle'

const BASE = import.meta.env.BASE_URL
const clock = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
const OUTCOME_CLASS = { success: 'ok', 'self-reported': 'ok', unverified: 'bad', skipped: 'bad', timeout: 'bad' }
// Nielsen's severity scale: a level is its index.
const SEVERITY = ['not a problem', 'cosmetic', 'minor', 'major', 'catastrophe']

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

// A file is checked field by field before it is scored or drawn, so a damaged
// or hand-edited file gets a message instead of breaking the page.
class FileError extends Error {}
const isNumber = value => typeof value === 'number' && Number.isFinite(value)
const isText = value => typeof value === 'string'
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const optional = check => value => value == null || check(value)
const listOf = check => value => Array.isArray(value) && value.every(item => isRecord(item) && check(item))
// The site folder and page names become the replay frame's URL, so they must
// stay inside the site: no '..', also not encoded or split by a tab or newline
// (the URL parser drops those), and no encoded slash a server may decode.
const isPath = value => isText(value) && !/^\/|\.\.|:|\\|\/\/|%2[ef]|%5c|[\t\n\r]/i.test(value)
const isAccuracy = accuracy => isRecord(accuracy) && isNumber(accuracy.meanPx) && isNumber(accuracy.meanDegrees)
const EVENT_FIELDS = {
  click: event => isPath(event.page) && isNumber(event.x) && isNumber(event.y) && isRecord(event.target) && isText(event.target.selector),
  navigate: event => isPath(event.page),
  scroll: event => isPath(event.page) && isNumber(event.x) && isNumber(event.y),
}
const FIELDS = {
  study: study => isRecord(study) && isText(study.title) && isPath(study.siteBase),
  participant: isText,
  viewport: optional(viewport => isRecord(viewport) && isNumber(viewport.width) && isNumber(viewport.height)),
  quality: quality => isRecord(quality) && typeof quality.gazeEnabled === 'boolean' && isNumber(quality.frames) && isNumber(quality.faceFrames)
    && optional(listOf(check => isNumber(check.errorPx)))(quality.driftChecks)
    && optional(lost => isRecord(lost) && isNumber(lost.t) && optional(isText)(lost.taskId) && optional(isText)(lost.reason))(quality.cameraLost)
    && (quality.gazeEnabled ? isAccuracy : optional(isAccuracy))(quality.accuracy),
  baseline: optional(baseline => isRecord(baseline) && isNumber(baseline.brow) && isNumber(baseline.scale)),
  tasks: listOf(task => isText(task.id) && isNumber(task.start) && optional(isNumber)(task.end) && optional(isText)(task.outcome) && optional(isText)(task.prompt)),
  events: listOf(event => isText(event.type) && isNumber(event.t) && optional(isText)(event.taskId) && optional(isNumber)(event.last) && (EVENT_FIELDS[event.type]?.(event) ?? true)),
  gaze: optional(listOf(point => isNumber(point.t) && isText(point.page) && isNumber(point.x) && isNumber(point.y) && optional(isNumber)(point.sx) && optional(isNumber)(point.sy))),
  face: optional(listOf(sample => isNumber(sample.t) && isNumber(sample.brow) && isNumber(sample.scale))),
  aois: optional(aois => isRecord(aois) && Object.values(aois).every(listOf(area => isText(area.id) && isRecord(area.rect) && ['x', 'y', 'width', 'height'].every(key => isNumber(area.rect[key]))))),
  reviews: optional(reviews => isRecord(reviews) && Object.values(reviews).every(review => isRecord(review) && ['open', 'confirmed', 'rejected'].includes(review.status)
    && optional(level => Number.isInteger(level) && level >= 0 && level < SEVERITY.length)(review.severity))),
}

function readSession(text) {
  const data = JSON.parse(text)
  if (!isRecord(data) || data.version !== 1) throw new FileError('This is not a Usability Copilot session file.')
  const field = Object.keys(FIELDS).find(name => !FIELDS[name](data[name]))
  if (field) throw new FileError(`This session file cannot be shown: its “${field}” field is ${data[field] === undefined ? 'missing' : 'not in the expected format'}.`)
  return data
}

// Scored when it is opened, so a file that fails here never replaces the one
// on screen.
const opened = session => ({ session, analysis: analyze(session) })

// The replay frame's address, resolved as the frame would resolve it, or null
// if it leaves the study site in a way isPath did not foresee.
function replaySrc(session, page) {
  const resolve = path => new URL(path, location.href)
  const site = resolve(`${BASE}${session.study.siteBase}`)
  const url = resolve(`${BASE}${session.study.siteBase}${page}.html`)
  return url.origin === location.origin && site.pathname.startsWith(resolve(BASE).pathname) && url.pathname.startsWith(site.pathname) ? url.href : null
}

// Keeps a rendering error in one file from blanking the page. It sits below
// Review, so the reviews held there survive and can still be exported.
class Guard extends React.Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

function Replay({ session, candidate, fixations }) {
  const boxRef = useRef(null)
  const frameRef = useRef(null)
  const [width, setWidth] = useState(800)
  const viewport = session.viewport?.width > 0 && session.viewport?.height > 0 ? session.viewport : { width: 1280, height: 720 }
  const view = viewAt(session, (candidate.start + candidate.end) / 2) || viewAt(session, candidate.end)
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(boxRef.current)
    return () => observer.disconnect()
  }, [])
  if (!view) return <div className="replay empty" ref={boxRef}><p className="muted">No page was open at this moment.</p></div>
  const src = replaySrc(session, view.page)
  if (!src) return <div className="replay empty" ref={boxRef}><p className="muted">This page is outside the study site, so it is not shown.</p></div>
  // The frame scrolls only when it loads. With the session in its key, another
  // file's moment on the same page loads it afresh instead of keeping the old
  // scroll position.
  const frameKey = `${session.participant}-${session.startedAt}-${view.page}-${candidate.id}`
  const lost = session.quality.cameraLost
  const scale = width / viewport.width
  const inWindow = item => item.page === view.page && item.t >= candidate.start && item.t <= candidate.end
  const spots = fixations.filter(fixation => fixation.page === view.page && fixation.end >= candidate.start && fixation.start <= candidate.end)
  const clicks = session.events.filter(event => event.type === 'click' && inWindow(event))
  return <div className="replay" ref={boxRef} style={{ height: `${viewport.height * scale}px` }}>
    <div className="replay-stage" style={{ width: `${viewport.width}px`, height: `${viewport.height}px`, transform: `scale(${scale})` }}>
      <iframe ref={frameRef} key={frameKey} title="Page at this moment" tabIndex={-1} src={src} onLoad={() => frameRef.current?.contentWindow?.scrollTo(view.scrollX, view.scrollY)} />
      <svg className="replay-overlay" width={viewport.width} height={viewport.height} aria-hidden="true">
        {/* heat spots sit on the tested website, which is light in both themes */}
        <defs><radialGradient id="heat-spot"><stop offset="0" stopColor="#ff5a28" stopOpacity=".5" /><stop offset="1" stopColor="#ff5a28" stopOpacity="0" /></radialGradient></defs>
        {spots.map((spot, index) => <circle key={index} cx={spot.x - view.scrollX} cy={spot.y - view.scrollY} r={Math.min(70, 18 + (spot.end - spot.start) / 12)} className="heat" fill="url(#heat-spot)" />)}
        {clicks.map((click, index) => <g key={index} className="click-mark"><circle cx={click.x - view.scrollX} cy={click.y - view.scrollY} r="11" /><text x={click.x - view.scrollX + 14} y={click.y - view.scrollY - 10}>{index + 1}</text></g>)}
      </svg>
    </div>
    <span className="chip replay-tag">{view.page} · {clock(candidate.start)}–{clock(candidate.end)} · {!session.quality.gazeEnabled ? 'gaze off' : lost && candidate.start >= lost.t ? 'camera lost' : `${spots.length} fixations`} · {clicks.length} clicks</span>
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

// Everything drawn from one file, inside the Guard.
function SessionView({ session, analysis, reviews, selectedId, onSelect, onReview }) {
  const selected = analysis.candidates.find(candidate => candidate.id === selectedId) || analysis.candidates[0] || null
  const { quality } = session
  const facePercent = quality.frames ? Math.round((quality.faceFrames / quality.frames) * 100) : null
  const drift = quality.driftChecks?.length ? Math.round(quality.driftChecks.reduce((sum, check) => sum + check.errorPx, 0) / quality.driftChecks.length) : null
  // Gaze and face data stop when the camera was lost; frame counts cover only the time before.
  const lost = quality.cameraLost
  const until = lost ? `UNTIL ${clock(lost.t)}` : ''
  const reviewed = analysis.candidates.filter(candidate => ['confirmed', 'rejected'].includes(reviews[candidate.id]?.status)).length
  // Reviews saved against moments this version no longer flags.
  const ids = new Set(analysis.candidates.map(candidate => candidate.id))
  const hidden = Object.keys(reviews).filter(id => !ids.has(id)).length

  return <div className="review">
    <section className="stage">
      <div className="quality">
        <span className="kicker">Data quality</span>
        {lost && <span className="chip strong" title={lost.reason}>CAMERA LOST AT {clock(lost.t)}{lost.taskId ? ` · ${lost.taskId}` : ''}</span>}
        <span className={`chip ${quality.gazeEnabled ? 'live' : ''}`}>{quality.gazeEnabled ? `GAZE ${quality.accuracy.meanDegrees.toFixed(1)}° · ${until || 'PASS'}` : 'GAZE OFF'}</span>
        {facePercent !== null && <span className="chip">{facePercent}% FRAMES WITH FACE{until && ` · ${until}`}</span>}
        {session.baseline?.from === 'tasks' && <span className="chip" title="Calibration gave no face baseline, so brow and lean are compared with the participant's first face frames in the tasks.">FACE BASELINE FROM TASKS</span>}
        {drift !== null && <span className="chip">DRIFT CHECK ×{quality.driftChecks.length} · {drift} PX</span>}
        <span className="chip">NO VIDEO STORED</span>
      </div>
      {selected ? <Replay session={session} candidate={selected} fixations={analysis.fixations} /> : <div className="replay empty"><p className="muted">No moments were flagged in this session.</p></div>}
      <Timeline session={session} analysis={analysis} selected={selected} onSelect={onSelect} />
    </section>
    <aside className="sidebar">
      <div className="sidebar-head"><span className="kicker">Candidate moments</span><h3>{analysis.candidates.length} flagged · {reviewed} reviewed</h3>
        {hidden > 0 && <span className="muted small">{hidden} saved {hidden === 1 ? 'review does' : 'reviews do'} not match any flagged moment. {hidden === 1 ? 'It stays' : 'They stay'} in the exported file.</span>}</div>
      <div className="cands">
        {analysis.candidates.map(candidate => {
          const review = reviews[candidate.id] || {}
          const task = session.tasks.find(item => item.id === candidate.taskId)
          const status = review.status === 'confirmed' ? `CONFIRMED${review.severity == null ? '' : ` · SEVERITY ${review.severity}`}` : review.status === 'rejected' ? 'REJECTED' : `${candidate.confidence.toUpperCase()} CONFIDENCE`
          return <article key={candidate.id} className={`card ${selected?.id === candidate.id ? 'active' : ''} ${review.status === 'rejected' ? 'is-rejected' : ''}`} onClick={() => onSelect(candidate.id)}>
            <div className="card-top"><b className="mono">{clock(candidate.start)}–{clock(candidate.end)} · {candidate.taskId}</b><span className={`chip ${review.status === 'confirmed' ? 'live' : ''}`}>{status}</span></div>
            {task && <p className="muted small">{task.prompt}</p>}
            <ul className="evidence">{candidate.signals.map((signal, index) => <li key={index} className={signal.strength}>{describeSignal(signal)}</li>)}</ul>
            <div className="card-actions" onClick={event => event.stopPropagation()}>
              <button className={`btn small-btn ${review.status === 'confirmed' ? 'primary' : 'ghost'}`} onClick={() => onReview(candidate, { status: 'confirmed' })}>Confirm</button>
              <button className={`btn small-btn ${review.status === 'rejected' ? 'secondary' : 'ghost'}`} onClick={() => onReview(candidate, { status: 'rejected', severity: null })}>Reject</button>
              <div className="severity" role="group" aria-label="Severity, 0 to 4">{SEVERITY.map((meaning, level) => <button key={level} disabled={review.status !== 'confirmed'} aria-pressed={review.severity === level} aria-label={`${level}, ${meaning}`} title={`${level}: ${meaning}`} className={review.severity === level ? 'on' : ''} onClick={() => onReview(candidate, { severity: level })}>{level}</button>)}</div>
            </div>
          </article>
        })}
        {!analysis.candidates.length && <p className="muted small">Nothing was flagged. Check the data quality chips: with gaze off, only click and page signals are available.{lost && ` Gaze and face signals stop at ${clock(lost.t)}, when the camera was lost.`}</p>}
      </div>
      <p className="muted small sidebar-note">Severity uses Nielsen’s 0–4 scale (0 not a problem, 4 catastrophe). Flags are evidence for you to judge, not findings.</p>
    </aside>
  </div>
}

// main.jsx keeps Review mounted while it is hidden, so Back and Forward keep
// unexported reviews.
export function Review({ initialSession, request = 0, hidden = false }) {
  const [open, setOpen] = useState(() => (initialSession ? opened(initialSession) : null))
  const [reviews, setReviews] = useState(initialSession?.reviews || {})
  const [selectedId, setSelectedId] = useState(null)
  const [error, setError] = useState('')
  // Reviews changed since the file was opened or exported, and a checked file
  // waiting for the researcher to say what happens to them.
  const [unexported, setUnexported] = useState(false)
  const [pending, setPending] = useState(null)
  const [loads, setLoads] = useState(0)
  const inputRef = useRef(null)
  const { session, analysis } = open || {}

  useEffect(() => {
    if (!unexported) return undefined
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    addEventListener('beforeunload', warn)
    return () => removeEventListener('beforeunload', warn)
  }, [unexported])

  const commit = next => {
    setOpen(next)
    setReviews(next.session.reviews || {})
    setSelectedId(null)
    setUnexported(false)
    setPending(null)
    setLoads(count => count + 1)
  }
  const load = file => {
    const reader = new FileReader()
    reader.onload = () => {
      let next
      try {
        next = opened(readSession(reader.result))
      } catch (problem) {
        setError(problem instanceof SyntaxError ? 'That file is not valid JSON.' : problem instanceof FileError ? problem.message : 'That file could not be read. It may be damaged or from another version.')
        return
      }
      setError('')
      offer(next)
    }
    reader.readAsText(file)
  }
  const offer = next => (unexported ? setPending(next) : commit(next))
  // Each press of the finished screen's 'Review this session' (request)
  // offers the session just recorded in this tab like a chosen file, once
  // Review is shown. Cancel only means not now: the next press offers it again.
  const handled = useRef(request)
  useEffect(() => {
    if (hidden || request === handled.current) return
    handled.current = request
    if (initialSession && session !== initialSession) offer(opened(initialSession))
  }, [hidden, request, initialSession])
  const cancelLoad = () => {
    setPending(null)
    inputRef.current?.focus()
  }
  const exportFile = () => {
    const blob = new Blob([JSON.stringify({ ...session, reviews })], { type: 'application/json' })
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `usability-session-${session.participant}-reviewed.json` })
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    setUnexported(false)
  }
  // Each review keeps the moment it was made on, so an exported file still
  // says what was judged if the moments are scored differently later.
  const setReview = (candidate, change) => {
    const moment = { taskId: candidate.taskId, start: candidate.start, end: candidate.end, signals: candidate.signals.map(signal => signal.kind) }
    setReviews(current => ({ ...current, [candidate.id]: { status: 'open', severity: null, ...current[candidate.id], ...change, moment } }))
    setUnexported(true)
  }

  // Mounted only when shown, so it picks up a theme chosen on another screen.
  const toggle = hidden ? null : <ThemeToggle />
  // The value is cleared so that choosing the same file again, after Cancel, still loads it.
  const picker = <label className="btn ghost file-button" htmlFor="session-file">{session ? 'Load another file' : 'Choose a session file'}<input ref={inputRef} id="session-file" type="file" accept="application/json,.json" onChange={event => { const [file] = event.target.files; event.target.value = ''; if (file) load(file) }} /></label>

  if (!session) return <div className="screen">
    <header className="topbar"><div className="brand"><span className="mark">◎</span><div><strong>Usability Copilot</strong><small>Researcher review</small></div></div>{toggle}</header>
    <main className="center-note"><span className="kicker">Review a session</span><h2>Load a session file</h2><p className="muted">Participants download a results file at the end of a session. Load it here to see flagged moments. Files are read in this browser and not uploaded.</p>{picker}{error && <p className="warning" role="alert">{error}</p>}</main>
  </div>

  return <div className="screen review-screen">
    <header className="topbar"><div className="brand"><span className="mark">◎</span><div><strong>Session review · {session.participant}</strong><small>{session.study.title} · {session.tasks.length} tasks · {clock(analysis.duration)}</small></div></div><div className="actions">{picker}<button className="btn secondary" onClick={exportFile}>Export reviewed file</button>{toggle}</div></header>
    {error && <p className="warning banner" role="alert">{error}</p>}
    {pending && <div className="warning banner actions" role="group" aria-labelledby="replace-note" onKeyDown={event => event.key === 'Escape' && cancelLoad()}>
      <span id="replace-note">Your reviews for {session.participant} are not exported yet. Loading {pending.session.participant} will replace them.</span>
      <button className="btn primary small-btn" autoFocus onClick={() => { exportFile(); commit(pending) }}>Export, then load</button>
      <button className="btn danger small-btn" onClick={() => commit(pending)}>Load without exporting</button>
      <button className="btn ghost small-btn" onClick={cancelLoad}>Cancel</button>
    </div>}
    <Guard key={loads} fallback={<main className="center-note" role="alert"><span className="kicker">Review a session</span><h2>This file could not be shown</h2><p className="muted">It may be damaged or from another version. Any reviews you made are still here: export them, or load another file.</p></main>}>
      <SessionView session={session} analysis={analysis} reviews={reviews} selectedId={selectedId} onSelect={setSelectedId} onReview={setReview} />
    </Guard>
  </div>
}
