import React, { useEffect, useRef, useState } from 'react'
import { describeSignal, detectSignals, findCandidates, sessionFixations, STRONG, MEDIUM, WEAK } from './signals'
import { ViewToggles } from '../ThemeToggle'
import { ResearcherNav } from './ResearcherNav'
import { embedUrl, isClientId, isFileKey, isNodeId } from './figma'
import { isSeq, susGrade, susScore, umuxLiteScore } from './questionnaire'
import { TextError, errorText, formatNumber } from '../i18n/index.js'
import { useT } from '../i18n/react.jsx'

const BASE = import.meta.env.BASE_URL
const clock = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
// One decimal, rounded as toFixed(1) rounds, in the reader's number format.
const oneDecimal = (lang, value) => formatNumber(lang, Number(Number(value).toFixed(1)), { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false })
// Why the camera was lost: the file keeps it in English, with the message key
// when the runtime had one, so it can be shown in the reader's language. Only
// the camera and vision messages are looked up; anything else shows as saved.
const LOST_REASON_KEY = /^(?:participant\.cameraLost|common\.vision)\.\w+$/
const lostReason = (t, lost) => (typeof lost.reasonKey === 'string' && LOST_REASON_KEY.test(lost.reasonKey) && t(lost.reasonKey) !== lost.reasonKey ? t(lost.reasonKey) : lost.reason)
const OUTCOME_CLASS = { success: 'ok', 'self-reported': 'ok', partial: 'partial', unverified: 'bad', failed: 'bad', skipped: 'bad', timeout: 'bad' }
// Observer note kinds from a moderated session (lab.html console). The keys
// are the kinds a file may hold; screens show t('study.note.' + kind).
export const NOTE_KINDS = { note: 'Note', problem: 'Problem', quote: 'Quote', assist: 'Assist', error: 'Error' }
// Nielsen's severity scale: a level is its index; screens show
// t('researcher.severity.' + level).
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
  const navigation = session.events.filter(event => event.type === 'navigate' && t >= event.t).pop()
  if (!navigation) return null
  const scroll = session.events.filter(event => event.type === 'scroll' && event.page === navigation.page && event.t >= navigation.t && t >= event.t).pop()
  return { page: navigation.page, scrollX: scroll?.x || 0, scrollY: scroll?.y || 0 }
}

// A file is checked field by field before it is scored or drawn, so a damaged
// or hand-edited file gets a message instead of breaking the page. Its
// message is the English text; screens show errorText(t, error).
class FileError extends TextError {}
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
// Pages are paths in the study site, or Figma node ids ('12:34') in a Figma
// study, whose replay is the Figma embed opened at that frame.
const isFigmaStudy = study => isRecord(study) && study.kind === 'figma'
// A moderated session on any product: nothing embedded, only notes and times.
const isObservedStudy = study => isRecord(study) && study.kind === 'observed'
const fieldsFor = isPage => ({
  study: study => isRecord(study) && isText(study.title) && (isFigmaStudy(study)
    ? isRecord(study.figma) && isFileKey(study.figma.fileKey) && isText(study.figma.name) && optional(id => id === '' || isClientId(id))(study.figma.clientId)
    : isObservedStudy(study) || isPath(study.siteBase)),
  mode: optional(mode => ['moderated', 'unmoderated'].includes(mode)),
  pilot: optional(pilot => typeof pilot === 'boolean'),
  notes: optional(listOf(note => isNumber(note.t) && optional(isText)(note.taskId) && Object.hasOwn(NOTE_KINDS, note.kind) && isText(note.text) && optional(tags => Array.isArray(tags) && tags.every(isText))(note.tags))),
  umuxLite: optional(umux => isRecord(umux) && Array.isArray(umux.answers) && umuxLiteScore(umux.answers)?.raw === umux.raw && umuxLiteScore(umux.answers)?.sus === umux.sus),
  participant: isText,
  viewport: optional(viewport => isRecord(viewport) && isNumber(viewport.width) && isNumber(viewport.height)),
  quality: quality => isRecord(quality) && typeof quality.gazeEnabled === 'boolean' && isNumber(quality.frames) && isNumber(quality.faceFrames)
    && optional(listOf(check => isNumber(check.errorPx)))(quality.driftChecks)
    && optional(lost => isRecord(lost) && isNumber(lost.t) && optional(isText)(lost.taskId) && optional(isText)(lost.reason))(quality.cameraLost)
    && (quality.gazeEnabled ? isAccuracy : optional(isAccuracy))(quality.accuracy),
  baseline: optional(baseline => isRecord(baseline) && isNumber(baseline.brow) && isNumber(baseline.scale)),
  tasks: listOf(task => isText(task.id) && isNumber(task.start) && optional(isNumber)(task.end) && optional(isText)(task.outcome) && optional(isText)(task.prompt) && optional(isSeq)(task.seq) && optional(isNumber)(task.ready)),
  // The score must match the answers, so a hand-edited score is caught.
  sus: optional(sus => isRecord(sus) && Array.isArray(sus.answers) && isNumber(sus.score) && susScore(sus.answers) === sus.score),
  events: listOf(event => isText(event.type) && isNumber(event.t) && optional(isText)(event.taskId) && optional(isNumber)(event.last) && (eventFields(isPage)[event.type]?.(event) ?? true)),
  gaze: optional(listOf(point => isNumber(point.t) && isPage(point.page) && isNumber(point.x) && isNumber(point.y) && optional(isNumber)(point.sx) && optional(isNumber)(point.sy))),
  face: optional(listOf(sample => isNumber(sample.t) && isNumber(sample.brow) && isNumber(sample.scale))),
  aois: optional(aois => isRecord(aois) && Object.keys(aois).every(isPage) && Object.values(aois).every(listOf(area => isText(area.id) && isRecord(area.rect) && ['x', 'y', 'width', 'height'].every(key => isNumber(area.rect[key]))))),
  reviews: optional(reviews => isRecord(reviews) && Object.values(reviews).every(review => isRecord(review) && ['open', 'confirmed', 'rejected'].includes(review.status)
    && optional(level => Number.isInteger(level) && level >= 0 && SEVERITY.length > level)(review.severity))),
})
const eventFields = isPage => ({
  click: event => isPage(event.page) && isNumber(event.x) && isNumber(event.y) && isRecord(event.target) && isText(event.target.selector),
  navigate: event => isPage(event.page),
  scroll: event => isPage(event.page) && isNumber(event.x) && isNumber(event.y),
})

export function readSession(text) {
  const data = JSON.parse(text)
  if (!isRecord(data) || data.version !== 1) throw new FileError('researcher.file.notSession')
  const FIELDS = fieldsFor(isFigmaStudy(data.study) ? isNodeId : isPath)
  const field = Object.keys(FIELDS).find(name => !FIELDS[name](data[name]))
  if (field) throw new FileError(data[field] === undefined ? 'researcher.file.missingField' : 'researcher.file.badField', { field })
  return data
}

// Scored when it is opened, so a file that fails here never replaces the one
// on screen.
const opened = session => ({ session, analysis: analyze(session) })

// The replay frame's address, resolved as the frame would resolve it, or null
// if it leaves the study site in a way isPath did not foresee.
function replaySrc(session, page) {
  if (isFigmaStudy(session.study)) return isNodeId(page) ? embedUrl(session.study.figma, page) : null
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
  const t = useT()
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
  const src = view && replaySrc(session, view.page)
  if (!src) return <div className="replay empty" ref={boxRef}><p className="muted">{view ? t('researcher.replay.outside') : t('researcher.replay.noPage')}</p></div>
  const lost = session.quality.cameraLost
  const scale = width / viewport.width
  const inWindow = item => item.page === view.page && item.t >= candidate.start && candidate.end >= item.t
  const spots = fixations.filter(fixation => fixation.page === view.page && fixation.end >= candidate.start && candidate.end >= fixation.start)
  const clicks = session.events.filter(event => event.type === 'click' && inWindow(event))
  // Figma reports click positions inside the clicked frame, not the embed, so
  // they are counted but not drawn.
  const figma = isFigmaStudy(session.study)
  // The frame scrolls only when it loads. With the session in its key, another
  // file's moment on the same page loads it afresh instead of keeping the old
  // scroll position.
  const frameKey = `${session.participant}-${session.startedAt}-${view.page}-${candidate.id}`
  return <div className="replay" ref={boxRef} style={{ height: `${viewport.height * scale}px` }}>
    <div className="replay-stage" style={{ width: `${viewport.width}px`, height: `${viewport.height}px`, transform: `scale(${scale})` }}>
      <iframe ref={frameRef} key={frameKey} title={t('researcher.replay.frameTitle')} tabIndex={-1} src={src} onLoad={() => { if (!figma) frameRef.current?.contentWindow?.scrollTo(view.scrollX, view.scrollY) }} />
      <svg className="replay-overlay" width={viewport.width} height={viewport.height} aria-hidden="true">
        {/* heat spots sit on the tested website, which is light in both themes */}
        <defs><radialGradient id="heat-spot"><stop offset="0" stopColor="#ff5a28" stopOpacity=".5" /><stop offset="1" stopColor="#ff5a28" stopOpacity="0" /></radialGradient></defs>
        {spots.map((spot, index) => <circle key={index} cx={spot.x - view.scrollX} cy={spot.y - view.scrollY} r={Math.min(70, 18 + (spot.end - spot.start) / 12)} className="heat" fill="url(#heat-spot)" />)}
        {!figma && clicks.map((click, index) => <g key={index} className="click-mark"><circle cx={click.x - view.scrollX} cy={click.y - view.scrollY} r="11" /><text x={click.x - view.scrollX + 14} y={click.y - view.scrollY - 10}>{index + 1}</text></g>)}
      </svg>
    </div>
    <span className="chip replay-tag">{view.page} · {clock(candidate.start)}–{clock(candidate.end)} · {!session.quality.gazeEnabled ? t('researcher.replay.gazeOff') : lost && candidate.start >= lost.t ? t('researcher.replay.cameraLost') : t('researcher.replay.fixations', { count: spots.length })} · {t('researcher.replay.clicks', { count: clicks.length })}</span>
  </div>
}

function Timeline({ session, analysis, selected, onSelect }) {
  const t = useT()
  // The axis runs from the first task to the last; consent and calibration are left out.
  const span = Math.max(1, analysis.duration - analysis.origin)
  const pct = time => `${Math.max(0, (time - analysis.origin) / span) * 100}%`
  const len = ms => `${(ms / span) * 100}%`
  // Moments are padded by 2 s, so clip them to the tasks' time range.
  const clipped = item => ({ left: pct(Math.max(item.start, analysis.origin)), width: len(Math.min(item.end, analysis.duration) - Math.max(item.start, analysis.origin)) })
  const lane = (strength, label) => {
    return <div className="lane"><span>{label}</span><div className="track">
      {analysis.candidates.map(candidate => <button key={candidate.id} className={`cand ${selected?.id === candidate.id ? 'is-selected' : ''}`} style={clipped(candidate)} onClick={() => onSelect(candidate.id)} aria-label={t('researcher.timeline.moment', { time: clock(candidate.start) })} />)}
      {analysis.signals.filter(signal => signal.strength === strength).map((signal, index) => <i key={index} className={`mk ${strength}`} style={{ left: pct(signal.start), width: `max(6px, ${len(signal.end - signal.start)})` }} title={describeSignal(signal, t.lang)} />)}
    </div></div>
  }
  return <div className="timeline">
    <div className="lane"><span>{t('researcher.timeline.tasks')}</span><div className="track">
      {session.tasks.map(task => <i key={task.id} className={`seg ${OUTCOME_CLASS[task.outcome] || ''}`} style={{ left: pct(task.start), width: len((task.end ?? task.start) - task.start) }}>{task.id} {OUTCOME_CLASS[task.outcome] === 'ok' ? '✓' : '✕'}</i>)}
      {selected && <i className="playhead" style={{ left: pct(selected.start) }} />}
    </div></div>
    {lane(STRONG, t('researcher.timeline.strong'))}
    {lane(MEDIUM, t('researcher.timeline.medium'))}
    {lane(WEAK, t('researcher.timeline.weak'))}
    <div className="axis"><span /><div>{[0, 0.25, 0.5, 0.75, 1].map(part => <span key={part}>{clock(analysis.origin + span * part)}</span>)}</div></div>
  </div>
}

// Everything drawn from one file, inside the Guard.
// Observer notes from a moderated session, by task, with their times.
function NotesList({ session }) {
  const t = useT()
  const notes = session.notes || []
  if (!notes.length) return null
  // Each task's notes, then those made between tasks.
  return <section className="notes-list" aria-label={t('researcher.notes.label')}>
    <span className="kicker">{t('researcher.notes.kicker', { count: notes.length })}</span>
    {[...session.tasks.map(task => task.id), null].map(taskId => {
      const own = notes.filter(note => (note.taskId ?? null) === taskId)
      if (!own.length) return null
      const task = session.tasks.find(item => item.id === taskId)
      const heading = taskId ? `${taskId} · ${task?.prompt || ''}` : t('researcher.notes.between')
      return <div key={taskId || 'none'} className="notes-task">
        <b>{heading}</b>
        <ul>{own.map((note, index) => <li key={index} className={`note note-${note.kind}`}><span className="mono small">{clock(note.t)}</span><span className="chip">{t(`study.note.${note.kind}`).toUpperCase()}</span><span>{note.kind === 'quote' ? `“${note.text}”` : note.text}</span>{note.tags?.map(tag => <span key={tag} className="tag">#{tag}</span>)}</li>)}</ul>
      </div>
    })}
  </section>
}

function SessionView({ session, analysis, reviews, selectedId, onSelect, onReview }) {
  const t = useT()
  const selected = analysis.candidates.find(candidate => candidate.id === selectedId) || analysis.candidates[0] || null
  const { quality } = session
  const facePercent = quality.frames ? Math.round((quality.faceFrames / quality.frames) * 100) : null
  const drift = quality.driftChecks?.length ? Math.round(quality.driftChecks.reduce((sum, check) => sum + check.errorPx, 0) / quality.driftChecks.length) : null
  const rated = session.tasks.some(task => task.seq != null) || Boolean(session.sus || session.umuxLite)
  const reviewed = analysis.candidates.filter(candidate => ['confirmed', 'rejected'].includes(reviews[candidate.id]?.status)).length
  // Reviews saved against moments this version no longer flags.
  const ids = new Set(analysis.candidates.map(candidate => candidate.id))
  const hidden = Object.keys(reviews).filter(id => !ids.has(id)).length
  // Gaze and face data stop when the camera was lost; frame counts cover only the time before.
  const lost = quality.cameraLost
  const until = lost ? t('researcher.quality.until', { time: clock(lost.t) }) : ''

  return <div className="review">
    <section className="stage">
      <div className="quality">
        <span className="kicker">{t('researcher.quality.kicker')}</span>
        {lost && <span className="chip strong">{t('researcher.quality.cameraLostAt', { time: clock(lost.t) })}{lost.taskId ? ` · ${lost.taskId}` : ''}</span>}
        <span className={`chip ${quality.gazeEnabled ? 'live' : ''}`}>{quality.gazeEnabled ? t('researcher.quality.gaze', { degrees: oneDecimal(t.lang, quality.accuracy.meanDegrees), status: until || t('researcher.quality.pass') }) : t('researcher.quality.gazeOff')}</span>
        {facePercent !== null && <span className="chip">{t('researcher.quality.face', { percent: facePercent })}{until && ` · ${until}`}</span>}
        {session.baseline?.from === 'tasks' && <span className="chip">{t('researcher.quality.baselineFromTasks')}</span>}
        {drift !== null && <span className="chip">{t('researcher.quality.drift', { count: quality.driftChecks.length, px: drift })}</span>}
        {isFigmaStudy(session.study) && !quality.figmaEvents && <span className="chip strong">{t('researcher.quality.noFigmaEvents')}</span>}
        <span className="chip">{t('researcher.quality.noVideo')}</span>
        {session.mode === 'moderated' && <span className="chip">{session.pilot ? t('researcher.quality.moderatedPilot') : t('researcher.quality.moderated')}</span>}
        {rated && <div className="ratings">
          <span className="kicker">{t('researcher.quality.ratings')}</span>
          {session.tasks.map(task => <span key={task.id} className={`chip ${task.seq != null && task.seq < 5 ? 'strong' : ''}`} title={t('researcher.quality.seqTitle')}>{t('researcher.quality.seq', { task: task.id, value: task.seq ?? '–' })}</span>)}
          {session.sus && <span className="chip live" title={t('researcher.quality.susTitle')}>SUS {oneDecimal(t.lang, session.sus.score)} · {susGrade(session.sus.score)}</span>}
          {session.umuxLite && <span className="chip live" title={t('researcher.quality.umuxTitle')}>{t('researcher.quality.umux', { raw: oneDecimal(t.lang, session.umuxLite.raw), sus: oneDecimal(t.lang, session.umuxLite.sus), grade: susGrade(session.umuxLite.sus) })}</span>}
        </div>}
        {lost?.reason && <p className="muted small">{t('researcher.quality.cameraLostReason', { reason: lostReason(t, lost) })}</p>}
        {isFigmaStudy(session.study) && !quality.figmaEvents && <p className="muted small">{t('researcher.quality.noFigmaEventsHint')}</p>}
        {session.baseline?.from === 'tasks' && <p className="muted small">{t('researcher.quality.baselineHint')}</p>}
      </div>
      {selected && <Replay session={session} candidate={selected} fixations={analysis.fixations} />}
      {!selected && !isObservedStudy(session.study) && <div className="replay empty"><p className="muted">{t('researcher.quality.noMoments')}</p></div>}
      <Timeline session={session} analysis={analysis} selected={selected} onSelect={onSelect} />
      <NotesList session={session} />
    </section>
    <aside className="sidebar">
      <div className="sidebar-head"><span className="kicker">{t('researcher.side.kicker')}</span><h3>{t('researcher.side.counts', { flagged: analysis.candidates.length, reviewed })}</h3>
        {hidden > 0 && <span className="muted small">{t('researcher.side.hidden', { count: hidden })}</span>}</div>
      <div className="cands">
        {analysis.candidates.map(candidate => {
          const review = reviews[candidate.id] || {}
          const task = session.tasks.find(item => item.id === candidate.taskId)
          const status = review.status === 'confirmed' ? (review.severity == null ? t('researcher.side.confirmed') : t('researcher.side.confirmedSeverity', { level: review.severity })) : review.status === 'rejected' ? t('researcher.side.rejected') : t(`researcher.side.confidence.${candidate.confidence}`)
          return <article key={candidate.id} className={`card ${selected?.id === candidate.id ? 'active' : ''} ${review.status === 'rejected' ? 'is-rejected' : ''}`} onClick={() => onSelect(candidate.id)}>
            <div className="card-top"><b className="mono">{clock(candidate.start)}–{clock(candidate.end)} · {candidate.taskId}</b><span className={`chip ${review.status === 'confirmed' ? 'live' : ''}`}>{status}</span></div>
            {task && <p className="muted small">{task.prompt}</p>}
            <ul className="evidence">{candidate.signals.map((signal, index) => <li key={index} className={signal.strength}>{describeSignal(signal, t.lang)}</li>)}</ul>
            <div className="card-actions" onClick={event => event.stopPropagation()}>
              <button className={`btn small-btn ${review.status === 'confirmed' ? 'primary' : 'ghost'}`} onClick={() => onReview(candidate, { status: 'confirmed' })}>{t('researcher.side.confirm')}</button>
              <button className={`btn small-btn ${review.status === 'rejected' ? 'secondary' : 'ghost'}`} onClick={() => onReview(candidate, { status: 'rejected', severity: null })}>{t('researcher.side.reject')}</button>
              <div className="severity" role="group" aria-label={t('researcher.side.severity')}>{SEVERITY.map((_, level) => <button key={level} disabled={review.status !== 'confirmed'} aria-pressed={review.severity === level} aria-label={t('researcher.side.severityOption', { level, meaning: t(`researcher.severity.${level}`) })} title={t('researcher.side.severityTitle', { level, meaning: t(`researcher.severity.${level}`) })} className={review.severity === level ? 'on' : ''} onClick={() => onReview(candidate, { severity: level })}>{level}</button>)}</div>
            </div>
          </article>
        })}
        {!analysis.candidates.length && <p className="muted small">{isObservedStudy(session.study) ? t('researcher.side.observed') : lost ? t('researcher.side.nothingLost', { time: clock(lost.t) }) : t('researcher.side.nothing')}</p>}
      </div>
      <p className="muted small sidebar-note">{t('researcher.side.note')}</p>
    </aside>
  </div>
}

// main.jsx keeps Review mounted while it is hidden, so Back and Forward keep
// unexported reviews.
// In the researcher workspace (lab.html) Review gets onSave, which receives
// the session with its reviews after every change (no export needed), and nav,
// the workspace's own navigation.
export function Review({ initialSession, request = 0, hidden = false, onSave, nav = <ResearcherNav current="#review" /> }) {
  const t = useT()
  const [open, setOpen] = useState(() => (initialSession ? opened(initialSession) : null))
  const [reviews, setReviews] = useState(initialSession?.reviews || {})
  const [selectedId, setSelectedId] = useState(null)
  // An error to show in the current language (see errorText), or null.
  const [error, setError] = useState(null)
  // Reviews changed since the file was opened or exported, and a checked file
  // waiting for the researcher to say what happens to them.
  const [unexported, setUnexported] = useState(false)
  const [pending, setPending] = useState(null)
  const [loads, setLoads] = useState(0)
  const inputRef = useRef(null)
  const { session, analysis } = open || {}
  // Mounted only when shown, so it picks up a theme chosen on another screen.
  const toggle = hidden ? null : <ViewToggles />

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
        setError(problem instanceof SyntaxError ? new TextError('researcher.file.notJson') : problem instanceof FileError ? problem : new TextError('researcher.file.unreadable'))
        return
      }
      setError(null)
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
    setReviews(current => {
      const next = { ...current, [candidate.id]: { status: 'open', severity: null, ...current[candidate.id], ...change, moment } }
      if (onSave) onSave({ ...session, reviews: next })
      return next
    })
    if (!onSave) setUnexported(true)
  }

  // The value is cleared so that choosing the same file again, after Cancel, still loads it.
  const picker = <label className="btn ghost file-button" htmlFor="session-file">{session ? t('researcher.review.loadAnother') : t('researcher.review.chooseFile')}<input ref={inputRef} id="session-file" type="file" accept="application/json,.json" onChange={event => { const [file] = event.target.files; event.target.value = ''; if (file) load(file) }} /></label>

  if (!session) {
    return <div className="screen">
      <header className="topbar"><div className="brand"><span className="mark">◎</span><div><strong>Usability Copilot</strong><small>{t('researcher.review.subtitle')}</small></div></div><div className="actions">{nav}{toggle}</div></header>
      <main className="center-note"><span className="kicker">{t('researcher.review.kicker')}</span><h2>{t('researcher.review.loadTitle')}</h2><p className="muted">{t('researcher.review.loadLede')}</p>{picker}{error && <p className="warning" role="alert">{errorText(t, error)}</p>}</main>
    </div>
  }

  return <div className="screen review-screen">
    <header className="topbar"><div className="brand"><span className="mark">◎</span><div><strong>{t('researcher.review.title', { participant: session.participant })}</strong><small>{session.study.title} · {t('researcher.review.tasks', { count: session.tasks.length })} · {clock(analysis.duration)}</small></div></div><div className="actions">{nav}{picker}<button className="btn secondary" onClick={exportFile}>{t('researcher.review.export')}</button>{toggle}</div></header>
    {error && <p className="warning banner" role="alert">{errorText(t, error)}</p>}
    {pending && <div className="warning banner actions" role="group" aria-labelledby="replace-note" onKeyDown={event => event.key === 'Escape' && cancelLoad()}>
      <span id="replace-note">{t('researcher.review.pending', { current: session.participant, next: pending.session.participant })}</span>
      <button className="btn primary small-btn" autoFocus onClick={() => { exportFile(); commit(pending) }}>{t('researcher.review.exportThenLoad')}</button>
      <button className="btn danger small-btn" onClick={() => commit(pending)}>{t('researcher.review.loadWithout')}</button>
      <button className="btn ghost small-btn" onClick={cancelLoad}>{t('researcher.review.cancel')}</button>
    </div>}
    <Guard key={loads} fallback={<main className="center-note" role="alert"><span className="kicker">{t('researcher.review.kicker')}</span><h2>{t('researcher.review.failedTitle')}</h2><p className="muted">{t('researcher.review.failedLede')}</p></main>}>
      <SessionView session={session} analysis={analysis} reviews={reviews} selectedId={selectedId} onSelect={setSelectedId} onReview={setReview} />
    </Guard>
  </div>
}
