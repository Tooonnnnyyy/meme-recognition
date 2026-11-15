import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createVisionEngine } from './vision-engine'
import { Lines, LookalikeLibrary, LookalikePanel, useLookalike } from './Lookalike'
import { ViewToggles } from './ThemeToggle'
import { Rich, useT } from './i18n/react.jsx'
import { HTML_LANG, currentLang, errorText, formatDate, formatNumber, translate } from './i18n/index.js'
import './styles.css'

const ASSET_BASE = import.meta.env.BASE_URL
// The product name, the same in every language.
const BRAND = 'Gesture Meme Studio'

// Each action's name and how to do it are the messages studio.action.<id> and
// studio.gesture.<id>; source names what detects it (studio.source.<source>).
// The reaction card's meme caption is studio.caption.<id>.title and .copy.
const ACTIONS = [
  { id: 'open_mouth', icon: '😮', image: `${ASSET_BASE}reactions/grin-meme.jpeg`, tone: 'coral', key: '1', source: 'face' },
  { id: 'eyes_closed', icon: '😴', image: `${ASSET_BASE}reactions/eyes-pursed.jpeg`, tone: 'lavender', key: '2', source: 'face' },
  { id: 'wink_tilt', icon: '🤔', image: `${ASSET_BASE}reactions/think-about-it.jpeg`, tone: 'yellow', key: '3', source: 'handFace' },
  { id: 'tongue_out', icon: '😛', image: `${ASSET_BASE}reactions/shh-character.jpeg`, tone: 'pink', key: '4', source: 'face' },
  { id: 'heart_hands', icon: '🫶', tone: 'rose', key: '5', source: 'hand' },
  { id: 'hand_up', icon: '✋', tone: 'mint', key: '6', source: 'handPose' },
  { id: 'thumbs_up', icon: '👍', tone: 'lime', key: '7', source: 'hand' },
  { id: 'open_palm', icon: '🖐️', tone: 'blue', key: '8', source: 'hand' },
  { id: 'cover_nose', icon: '🙈', tone: 'orange', key: '9', source: 'handFace' },
  { id: 'hands_head', icon: '🤯', image: `${ASSET_BASE}reactions/girl-meme.jpeg`, tone: 'purple', key: '0', source: 'pose' },
]
const actionName = (t, id) => t(`studio.action.${id}`)
const gestureText = (t, id) => t(`studio.gesture.${id}`)

// Each mode's kicker, label and copy are studio.mode.<id>.*.
const MODES = ['reactions', 'lookalike']

// Why vision failed, in the reader's language. Browser and engine errors are
// English, so other languages name the common camera causes and leave the
// rest out.
const CAMERA_ERRORS = { NotFoundError: 'studio.cameraError.notFound', NotReadableError: 'studio.cameraError.busy', OverconstrainedError: 'studio.cameraError.unsupported', SecurityError: 'studio.cameraError.blocked', AbortError: 'studio.cameraError.aborted' }
function failureReason(t, error) {
  if (error?.key) return errorText(t, error)
  if (t.lang === 'en') return `${error?.message}`
  return CAMERA_ERRORS[error?.name] ? t(CAMERA_ERRORS[error.name]) : ''
}

// The status line under the camera preview: a message ({ key, vars, error })
// or, on top of it, the vision engine's own progress text ({ text }). That
// text is English, so other languages keep showing the message under it.
function statusText(t, status) {
  if (status.text != null && (t.lang === 'en' || /\p{Script=Han}/u.test(status.text))) return status.text
  return t(status.key, status.error ? { error: failureReason(t, status.error) } : status.vars)
}

// The voice cue reads the caption title in the current language (looked up
// when it fires, since camera actions arrive through a long-lived callback).
function speakCaption(id) {
  const lang = currentLang()
  const utterance = new SpeechSynthesisUtterance(translate(lang, `studio.caption.${id}.title`).toLowerCase())
  if (lang !== 'en') utterance.lang = HTML_LANG[lang]
  window.speechSynthesis.speak(utterance)
}

function ReactionCard({ action, active }) {
  const t = useT()
  if (!action) {
    return <div className="empty-reaction"><span>◎</span><p><Lines text={t('studio.card.empty')} /></p></div>
  }
  return <div className={`reaction-card tone-${action.tone} ${active ? 'is-active' : ''}`}>
    <div className="reaction-orbit orbit-one" /><div className="reaction-orbit orbit-two" />
    <div className="reaction-icon">{action.image ? <img src={action.image} alt="" /> : action.icon}</div>
    <div className="reaction-title">{t(`studio.caption.${action.id}.title`)}</div>
    <div className="reaction-copy">{t(`studio.caption.${action.id}.copy`)}</div>
    <div className="reaction-gesture">{t('studio.card.do', { gesture: gestureText(t, action.id).toUpperCase() })}</div>
    <div className="reaction-trigger">{t('studio.card.trigger', { action: actionName(t, action.id).toUpperCase() })}</div>
  </div>
}

// The parts of the action diagrams that differ per action. Each branch is a
// block, so the markup check in tests/i18n.test.js sees only the drawing.
function FaceEyes({ id }) {
  if (id === 'eyes_closed') { return <path d="M34 31l8 0M54 31l8 0" /> }
  if (id === 'wink_tilt') { return <><path d="M34 31l8 0M54 28q5 5 10 0" /><path d="M74 17l7 5-7 5" /></> }
  return <><circle cx="39" cy="31" r="2" /><circle cx="58" cy="31" r="2" /></>
}

function FaceMouth({ id }) {
  if (id === 'tongue_out') { return <path d="M39 44q9-8 18 0v9q-9 8-18 0z" /> }
  if (id === 'open_mouth') { return <ellipse cx="48" cy="47" rx="8" ry="6" /> }
  return <path d="M40 47q8 5 16 0" />
}

function HandShape({ id }) {
  if (id === 'heart_hands') { return <><path d="M48 55C28 45 24 33 32 29c5-3 10 2 16 8 6-6 11-11 16-8 8 4 4 16-16 26z" /><path d="M48 37l-6-6M48 37l6-6" /></> }
  if (id === 'thumbs_up') { return <path d="M43 53H30V34h13m0 19h17c4 0 6-4 4-7l-3-5 4-11c1-3-1-6-4-6-4 0-5 8-8 10h-7" /> }
  if (id === 'open_palm') { return <path d="M35 55c-3-3-4-7-3-11l2-15c0-3 5-3 5 0v9-18c0-3 5-3 5 0v17-21c0-3 5-3 5 0v21-17c0-3 5-3 5 0v20l3-8c1-3 6-1 5 2l-3 15c-1 6-5 9-10 9z" /> }
  return <><circle cx="48" cy="25" r="18" /><path d="M34 53c2-12 8-18 14-18s12 6 14 18" /><path d="M55 29l-8 14" /></>
}

function GuideGraphic({ id }) {
  const t = useT()
  const face = id === 'open_mouth' || id === 'eyes_closed' || id === 'wink_tilt' || id === 'tongue_out'
  const hand = id === 'heart_hands' || id === 'thumbs_up' || id === 'open_palm' || id === 'cover_nose'
  if (face) {
    return <svg className="guide-graphic" viewBox="0 0 96 72" role="img" aria-label={t('studio.guide.face')}><circle cx="48" cy="37" r="25" /><path d="M35 31h7M54 31h7" /><FaceEyes id={id} /><FaceMouth id={id} /></svg>
  }
  if (hand) {
    return <svg className="guide-graphic" viewBox="0 0 96 72" role="img" aria-label={t('studio.guide.hand')}><HandShape id={id} /></svg>
  }
  return <svg className="guide-graphic" viewBox="0 0 96 72" role="img" aria-label={t('studio.guide.body')}><circle cx="48" cy="16" r="7" /><path d="M48 23v26M48 30l-18-12M48 30l18-12M48 49l-11 16M48 49l11 16" />{id === 'hands_head' ? <path d="M30 18q-5-8 1-12M66 18q5-8-1-12" /> : <path d="M28 51h-8M68 51h8" />}</svg>
}

function InstructionGuide({ actions }) {
  const t = useT()
  return <section className="instruction-guide panel"><div className="panel-heading"><div><span className="panel-kicker">{t('studio.guide.kicker')}</span><h2>{t('studio.guide.title')}</h2></div><span className="log-caption">{t('studio.guide.caption')}</span></div><div className="guide-grid">{actions.map(action => <article className="guide-card" key={action.id}><GuideGraphic id={action.id} /><div><strong>{actionName(t, action.id)}</strong><p>{gestureText(t, action.id)}</p><small>{t(action.image ? 'studio.guide.meme' : 'studio.guide.card')}</small></div></article>)}</div></section>
}

const HAND_CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]]
const POSE_CONNECTIONS = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24]]

function drawVisionOverlay(canvas, frame) {
  if (!canvas) return
  const context = canvas.getContext('2d')
  const width = canvas.width || 960
  const height = canvas.height || 720
  context.clearRect(0, 0, width, height)
  const point = landmark => [((1 - landmark.x) * width), landmark.y * height]
  const line = (points, connections, color) => {
    if (!points?.length) return
    context.strokeStyle = color
    context.lineWidth = Math.max(1.5, width / 500)
    connections.forEach(([from, to]) => {
      if (!points[from] || !points[to]) return
      const a = point(points[from]); const b = point(points[to])
      context.beginPath(); context.moveTo(...a); context.lineTo(...b); context.stroke()
    })
    context.fillStyle = color
    points.forEach(item => { const [x, y] = point(item); context.beginPath(); context.arc(x, y, Math.max(2, width / 260), 0, Math.PI * 2); context.fill() })
  }
  const face = frame.faceResult?.faceLandmarks?.[0]
  if (face?.length) {
    const xs = face.map(item => item.x); const ys = face.map(item => item.y)
    const x = (1 - Math.max(...xs)) * width; const y = Math.min(...ys) * height
    const boxWidth = (Math.max(...xs) - Math.min(...xs)) * width; const boxHeight = (Math.max(...ys) - Math.min(...ys)) * height
    context.strokeStyle = '#d8f36b'; context.lineWidth = 2; context.strokeRect(x, y, boxWidth, boxHeight)
    line(face, [[10,152],[33,133],[362,263],[61,291],[13,14]], '#d8f36b')
  }
  frame.handResult?.landmarks?.forEach(hand => line(hand, HAND_CONNECTIONS, '#ff7f63'))
  line(frame.poseResult?.landmarks?.[0], POSE_CONNECTIONS, '#8bb9ff')
}

const CAMERA_BADGES = { live: 'studio.camera.badge.live', loading: 'studio.camera.badge.loading', blocked: 'studio.camera.badge.blocked' }
const EVENT_TIME = { hour: '2-digit', minute: '2-digit', second: '2-digit' }

function App() {
  const t = useT()
  const videoRef = useRef(null)
  const overlayRef = useRef(null)
  const streamRef = useRef(null)
  const visionRef = useRef(null)
  const cameraGenerationRef = useRef(0)
  const soundRef = useRef(false)
  const modeRef = useRef('reactions')
  const baselineRef = useRef(null)
  const frameListenersRef = useRef(new Set())
  const statsShownAtRef = useRef(0)
  const calibratingRef = useRef(false)
  const [cameraState, setCameraState] = useState('off')
  // A message ({ key, error }); see statusText.
  const [cameraMessage, setCameraMessage] = useState({ key: 'studio.camera.off' })
  const [activeId, setActiveId] = useState(null)
  const [lastId, setLastId] = useState(null)
  const [confidence, setConfidence] = useState(0)
  const [hud, setHud] = useState(true)
  const [baseline, setBaseline] = useState(null)
  const [calibration, setCalibration] = useState({ status: 'idle', progress: 0 })
  const [events, setEvents] = useState([])
  const [sound, setSound] = useState(false)
  const [candidate, setCandidate] = useState(null)
  // 'waiting', 'tracking' or 'searching' (studio.hud.<state>).
  const [landmarkState, setLandmarkState] = useState('waiting')
  const [mode, setMode] = useState('reactions')
  const [engineStats, setEngineStats] = useState(null)

  const active = useMemo(() => ACTIONS.find(action => action.id === activeId) || null, [activeId])
  const calibrated = Boolean(baseline)
  const subscribeFrames = useCallback(listener => {
    frameListenersRef.current.add(listener)
    return () => frameListenersRef.current.delete(listener)
  }, [])
  const analyzeImages = useCallback(images => visionRef.current?.analyzeImages(images) ?? Promise.reject(new Error('Camera is off')), [])
  const lookalike = useLookalike({ active: mode === 'lookalike', cameraState, subscribeFrames, analyzeImages })

  const trigger = (action, confidenceValue = 0.92, simulated = true) => {
    setActiveId(action.id)
    setLastId(action.id)
    setConfidence(confidenceValue)
    setEvents(current => [{ id: crypto.randomUUID(), actionId: action.id, at: Date.now(), simulated }, ...current].slice(0, 5))
    if (soundRef.current && 'speechSynthesis' in window) speakCaption(action.id)
  }

  const triggerId = (id, confidenceValue = 0.92, simulated = false) => {
    const action = ACTIONS.find(item => item.id === id)
    if (action) trigger(action, confidenceValue, simulated)
  }

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setCameraMessage({ key: 'studio.camera.insecure' }); return }
    const generation = ++cameraGenerationRef.current
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 720, facingMode: 'user' }, audio: false })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setCameraState('loading')
      setCameraMessage({ key: 'studio.camera.loading' })
      const engine = await createVisionEngine(videoRef.current, {
        baseline: baselineRef.current,
        // The engine reports progress as English text, or as a message ({ key, vars }).
        onStatus: message => setCameraMessage(current => (message?.key ? message : { ...current, text: message })),
        onFrame: frame => {
          drawVisionOverlay(overlayRef.current, frame)
          setCandidate(frame.candidate?.id ? frame.candidate : null)
          setConfidence(frame.candidate?.score || 0)
          setLandmarkState(frame.handResult?.landmarks?.length || frame.faceResult?.faceLandmarks?.length || frame.poseResult?.landmarks?.length ? 'tracking' : 'searching')
          if (frame.timestamp - statsShownAtRef.current > 500) { statsShownAtRef.current = frame.timestamp; setEngineStats(frame.stats) }
          frameListenersRef.current.forEach(listener => listener(frame))
        },
        onAction: (id, score) => { if (modeRef.current === 'reactions') triggerId(id, score, false) },
        onError: error => {
          if (generation !== cameraGenerationRef.current) return
          stopCamera()
          setCameraState('blocked')
          setCameraMessage({ key: 'studio.camera.stopped', error })
        },
      })
      if (generation !== cameraGenerationRef.current) { engine.stop(); return }
      visionRef.current = engine
      setCameraState('live')
      setCameraMessage({ key: 'studio.camera.ready' })
    } catch (error) {
      streamRef.current?.getTracks().forEach(track => track.stop())
      streamRef.current = null
      setCameraState('blocked')
      setCameraMessage(error.name === 'NotAllowedError' ? { key: 'studio.camera.denied' } : { key: 'studio.camera.setupFailed', error })
    }
  }

  const stopCamera = () => {
    cameraGenerationRef.current += 1
    visionRef.current?.stop()
    visionRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.srcObject = null }
    setCameraState('off')
    setCameraMessage({ key: 'studio.camera.off' })
    setCandidate(null)
    setLandmarkState('waiting')
    setEngineStats(null)
    drawVisionOverlay(overlayRef.current, {})
  }

  // Records ~2 s of a relaxed face; the median becomes the user's zero point
  // for mouth, eye, and head-tilt rules and for Meme Lookalike. Kept in memory
  // only, for this page visit.
  const startCalibration = async () => {
    const engine = visionRef.current
    if (!engine) { setCameraMessage({ key: 'studio.camera.calibrateFirst' }); return }
    if (calibratingRef.current) return
    calibratingRef.current = true
    setCalibration({ status: 'running', progress: 0 })
    try {
      const measured = await engine.calibrate({ onProgress: progress => setCalibration({ status: 'running', progress }) })
      baselineRef.current = measured
      setBaseline(measured)
      setCameraMessage({ key: 'studio.camera.calibrated' })
    } catch (error) {
      if (visionRef.current === engine) setCameraMessage({ key: 'studio.camera.calibrationFailed', error })
    } finally {
      calibratingRef.current = false
      setCalibration({ status: 'idle', progress: 0 })
    }
  }

  useEffect(() => {
    soundRef.current = sound
  }, [sound])

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    const onKeyDown = event => {
      if (event.repeat) return
      const action = ACTIONS.find(item => item.key === event.key)
      if (action && modeRef.current === 'reactions') trigger(action, 0.96, true)
      if (event.key.toLowerCase() === 'h') setHud(value => !value)
      if (event.key.toLowerCase() === 'c') startCalibration()
      if (event.key === 'Escape') setActiveId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown); stopCamera() }
  }, [])

  const candidateName = id => (ACTIONS.some(action => action.id === id) ? t(`studio.hud.action.${id}`) : id.replaceAll('_', ' ').toUpperCase())

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">◎</span><div><strong>{BRAND}</strong><small>{t('studio.tagline')}</small></div></div>
      <div className="top-actions"><span className="privacy-dot" /> {t('studio.localOnly')} <ViewToggles /><button className="ghost-button" onClick={() => setHud(value => !value)}>{t(hud ? 'studio.hudOn' : 'studio.hudOff')}</button></div>
    </header>

    <section className="intro"><div><p className="eyebrow">{t('studio.intro.eyebrow')}</p><h1><Rich text={t('studio.intro.title')} tags={{ em: text => <><br /><em>{text}</em></> }} /></h1><p className="lede">{t('studio.intro.lede')}</p></div><div className="review-note"><span>{t('studio.note.kicker')}</span><strong>{t('studio.note.title')}</strong><p>{t('studio.note.body')}</p></div></section>

    <nav className="mode-tabs" aria-label={t('studio.modes')}>{MODES.map(id => <button key={id} className={`mode-tab ${mode === id ? 'active' : ''}`} aria-pressed={mode === id} onClick={() => setMode(id)}><span>{t(`studio.mode.${id}.kicker`)}</span><strong>{t(`studio.mode.${id}.label`)}</strong><small>{t(`studio.mode.${id}.copy`)}</small></button>)}</nav>

    <section className="studio-grid">
      {mode === 'lookalike' ? <LookalikePanel lookalike={lookalike} cameraState={cameraState} /> : <section className="reaction-panel panel"><div className="panel-heading"><div><span className="panel-kicker">{t('studio.reaction.kicker')}</span><h2>{t('studio.reaction.title')}</h2></div><span className={`status-badge ${active ? 'fired' : ''}`}>{t(active ? 'studio.reaction.fired' : 'studio.reaction.waiting')}</span></div><div className="reaction-stage"><ReactionCard action={active} active={Boolean(active)} /></div><div className="reaction-footer"><span>{active ? t('studio.reaction.last', { action: actionName(t, active.id) }) : t('studio.reaction.none')}</span><button className="text-button" onClick={() => setActiveId(null)}>{t('studio.reaction.clear')}</button></div></section>}
      <section className="camera-panel panel"><div className="panel-heading"><div><span className="panel-kicker">{t('studio.camera.kicker')}</span><h2>{t('studio.camera.title')}</h2></div><span className={`live-badge ${cameraState}`}>{t(CAMERA_BADGES[cameraState] || 'studio.camera.badge.off')}</span></div><div className="camera-frame"><video ref={videoRef} muted playsInline /><canvas ref={overlayRef} className="vision-overlay" /><div className="camera-placeholder"><span className="camera-crosshair">＋</span><strong>{t(cameraState === 'live' ? 'studio.camera.preview.live' : cameraState === 'loading' ? 'studio.camera.preview.loading' : 'studio.camera.preview.off')}</strong><small>{statusText(t, cameraMessage)}</small></div>{hud && <div className="hud"><div>{t('studio.hud.faceBox')} <b>{t(cameraState === 'live' ? (candidate ? 'studio.hud.locked' : 'studio.hud.searching') : 'studio.hud.standby')}</b></div><div>{t('studio.hud.landmarks')} <b>{t(`studio.hud.${cameraState === 'live' ? landmarkState : 'waiting'}`)}</b></div><div>{t('studio.hud.candidate')} <b>{candidate?.id ? candidateName(candidate.id) : '—'}</b></div><div>{t('studio.hud.confidence')} <b>{confidence ? formatNumber(t.lang, confidence, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</b></div><div>{t('studio.hud.processing')} <b>{t('studio.hud.local')}</b></div><div>{t('studio.hud.engine')} <b>{engineStats ? `${t(engineStats.runtime === 'worker' ? 'studio.hud.worker' : 'studio.hud.mainThread')} · ${engineStats.delegate}` : '—'}</b></div><div>{t('studio.hud.speed')} <b>{engineStats ? t('studio.hud.speedValue', { fps: Math.round(engineStats.fps), ms: Math.round(engineStats.inferenceMs) }) : '—'}</b></div><div>{t('studio.hud.baseline')} <b>{t(calibrated ? 'studio.hud.calibrated' : 'studio.hud.default')}</b></div></div>}{calibration.status === 'running' && <div className="calibration-overlay"><span>{t('studio.calibration.overlay')}</span><i style={{ width: `${Math.round(calibration.progress * 100)}%` }} /></div>}</div><div className="camera-controls"><button className="primary-button" onClick={cameraState === 'live' || cameraState === 'loading' ? stopCamera : startCamera}>{t(cameraState === 'live' || cameraState === 'loading' ? 'studio.camera.stop' : 'studio.camera.start')}</button><button className="secondary-button" disabled={calibration.status === 'running'} onClick={startCalibration}>{calibration.status === 'running' ? t('studio.calibrating', { percent: Math.round(calibration.progress * 100) }) : t(calibrated ? 'studio.recalibrate' : 'studio.calibrate')}</button></div></section>
    </section>

    {mode === 'lookalike' ? <LookalikeLibrary lookalike={lookalike} cameraState={cameraState} /> : <>
    <InstructionGuide actions={ACTIONS} />
    <section className="control-strip"><div className="control-copy"><span className="panel-kicker">{t('studio.deck.kicker')}</span><h2>{t('studio.deck.title')}</h2><p>{t('studio.deck.body')}</p></div><div className="settings"><label><input type="checkbox" checked={sound} onChange={event => setSound(event.target.checked)} /> {t('studio.deck.voiceCue')}</label><span className="calibration-state">{t(calibrated ? 'studio.deck.calibrated' : 'studio.deck.notCalibrated')}</span></div><div className="action-grid">{ACTIONS.map(action => <button title={gestureText(t, action.id)} className={`action-button ${lastId === action.id ? 'selected' : ''}`} key={action.id} onClick={() => trigger(action)}><span className="action-key">{action.key}</span><span className="action-icon">{action.icon}</span><span><b>{actionName(t, action.id)}</b><small>{gestureText(t, action.id)}</small></span><span className="action-source">{t('studio.deck.sim', { source: t(`studio.source.${action.source}`) })}</span></button>)}</div></section>

    <section className="event-log panel"><div className="panel-heading"><div><span className="panel-kicker">{t('studio.log.kicker')}</span><h2>{t('studio.log.title')}</h2></div><span className="log-caption">{t('studio.log.caption')}</span></div>{events.length ? <div className="event-list">{events.map(event => <div className="event-row" key={event.id}><span className="event-dot" /><strong>{actionName(t, event.actionId)}</strong><span>{t(event.simulated ? 'studio.log.simulated' : 'studio.log.live')}</span><time>{formatDate(t.lang, event.at, EVENT_TIME)}</time></div>)}</div> : <div className="empty-log">{t('studio.log.empty')}</div>}</section>
    </>}

    <footer><span>{t('studio.footer.build')}</span><span>{t('studio.footer.privacy')}</span><span>{t('studio.footer.keys')}</span></footer>
  </main>
}

createRoot(document.getElementById('root')).render(<App />)
