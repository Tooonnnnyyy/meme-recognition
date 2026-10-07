import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createVisionEngine } from './vision-engine'
import './styles.css'

const ACTIONS = [
  { id: 'open_mouth', label: 'Open mouth', gesture: 'Open your mouth wide', cn: '震惊张嘴', icon: '😮', image: '/reactions/grin-meme.jpeg', title: 'JAW DROP', copy: 'That escalated quickly.', tone: 'coral', key: '1', source: 'Face landmarks' },
  { id: 'eyes_closed', label: 'Eyes closed', gesture: 'Close both eyes', cn: '闭眼', icon: '😴', image: '/reactions/eyes-pursed.jpeg', title: 'TIME OUT', copy: 'Recharging social battery.', tone: 'lavender', key: '2', source: 'Face landmarks' },
  { id: 'wink_tilt', label: 'Think + tilt', gesture: 'Point to your temple and tilt your head', cn: '指太阳穴歪头', icon: '🤔', image: '/reactions/think-about-it.jpeg', title: 'BIG BRAIN', copy: 'Interesting choice.', tone: 'yellow', key: '3', source: 'Hand + face' },
  { id: 'tongue_out', label: 'Tongue out', gesture: 'Stick out your tongue', cn: '吐舌头', icon: '😛', image: '/reactions/shh-character.jpeg', title: 'GOOFY MODE', copy: 'No serious thoughts found.', tone: 'pink', key: '4', source: 'Face landmarks' },
  { id: 'heart_hands', label: 'Heart hands', gesture: 'Touch thumbs and index fingers', cn: '双手比心', icon: '🫶', title: 'WHOLESOME', copy: 'Sending good energy.', tone: 'rose', key: '5', source: 'Hand landmarks' },
  { id: 'hand_up', label: 'Hand up', gesture: 'Raise one hand above your shoulder', cn: '举手', icon: '✋', title: 'PICK ME', copy: 'I have a question.', tone: 'mint', key: '6', source: 'Hand + pose' },
  { id: 'thumbs_up', label: 'Thumbs up', gesture: 'Show one thumbs-up', cn: '竖拇指', icon: '👍', title: 'APPROVED', copy: 'Ship it. Carefully.', tone: 'lime', key: '7', source: 'Hand landmarks' },
  { id: 'open_palm', label: 'Open palm', gesture: 'Hold one open palm', cn: '张开手掌', icon: '🖐️', title: 'HOLD UP', copy: 'Pause and recalibrate.', tone: 'blue', key: '8', source: 'Hand landmarks' },
  { id: 'cover_nose', label: 'Cover nose', gesture: 'Cover your nose with one hand', cn: '捂鼻子', icon: '🙈', title: 'SUSPICIOUS', copy: 'Something smells like scope creep.', tone: 'orange', key: '9', source: 'Hand + face' },
  { id: 'hands_head', label: 'Hands on head', gesture: 'Put both hands on your head', cn: '双手抱头', icon: '🤯', image: '/reactions/girl-meme.jpeg', title: 'CRASHING OUT', copy: 'The demo worked yesterday.', tone: 'purple', key: '0', source: 'Pose landmarks' },
]

function ReactionCard({ action, active }) {
  if (!action) return <div className="empty-reaction"><span>◎</span><p>Make a gesture<br />to summon a reaction</p></div>
  return <div className={`reaction-card tone-${action.tone} ${active ? 'is-active' : ''}`}>
    <div className="reaction-orbit orbit-one" /><div className="reaction-orbit orbit-two" />
    <div className="reaction-icon">{action.image ? <img src={action.image} alt="" /> : action.icon}</div>
    <div className="reaction-title">{action.title}</div>
    <div className="reaction-copy">{action.copy}</div>
    <div className="reaction-gesture">DO · {action.gesture.toUpperCase()}</div>
    <div className="reaction-trigger">TRIGGER · {action.label.toUpperCase()}</div>
  </div>
}

function GuideGraphic({ id }) {
  const face = id === 'open_mouth' || id === 'eyes_closed' || id === 'wink_tilt' || id === 'tongue_out'
  const hand = id === 'heart_hands' || id === 'thumbs_up' || id === 'open_palm' || id === 'cover_nose'
  if (face) return <svg className="guide-graphic" viewBox="0 0 96 72" role="img" aria-label="Face action diagram"><circle cx="48" cy="37" r="25" /><path d="M35 31h7M54 31h7" />{id === 'eyes_closed' ? <path d="M34 31l8 0M54 31l8 0" /> : id === 'wink_tilt' ? <><path d="M34 31l8 0M54 28q5 5 10 0" /><path d="M74 17l7 5-7 5" /></> : <><circle cx="39" cy="31" r="2" /><circle cx="58" cy="31" r="2" /></>}{id === 'tongue_out' ? <path d="M39 44q9-8 18 0v9q-9 8-18 0z" /> : id === 'open_mouth' ? <ellipse cx="48" cy="47" rx="8" ry="6" /> : <path d="M40 47q8 5 16 0" />}</svg>
  if (hand) return <svg className="guide-graphic" viewBox="0 0 96 72" role="img" aria-label="Hand action diagram">{id === 'heart_hands' ? <><path d="M48 55C28 45 24 33 32 29c5-3 10 2 16 8 6-6 11-11 16-8 8 4 4 16-16 26z" /><path d="M48 37l-6-6M48 37l6-6" /></> : id === 'thumbs_up' ? <path d="M43 53H30V34h13m0 19h17c4 0 6-4 4-7l-3-5 4-11c1-3-1-6-4-6-4 0-5 8-8 10h-7" /> : id === 'open_palm' ? <path d="M35 55c-3-3-4-7-3-11l2-15c0-3 5-3 5 0v9-18c0-3 5-3 5 0v17-21c0-3 5-3 5 0v21-17c0-3 5-3 5 0v20l3-8c1-3 6-1 5 2l-3 15c-1 6-5 9-10 9z" /> : <><circle cx="48" cy="25" r="18" /><path d="M34 53c2-12 8-18 14-18s12 6 14 18" /><path d="M55 29l-8 14" /></>}</svg>
  return <svg className="guide-graphic" viewBox="0 0 96 72" role="img" aria-label="Body action diagram"><circle cx="48" cy="16" r="7" /><path d="M48 23v26M48 30l-18-12M48 30l18-12M48 49l-11 16M48 49l11 16" />{id === 'hands_head' ? <path d="M30 18q-5-8 1-12M66 18q5-8-1-12" /> : <path d="M28 51h-8M68 51h8" />}</svg>
}

function InstructionGuide({ actions }) {
  return <section className="instruction-guide panel"><div className="panel-heading"><div><span className="panel-kicker">ACTION GUIDE</span><h2>Copy the pose, then hold it</h2></div><span className="log-caption">3 stable frames · local vision</span></div><div className="guide-grid">{actions.map(action => <article className="guide-card" key={action.id}><GuideGraphic id={action.id} /><div><strong>{action.label}</strong><p>{action.gesture}</p><small>{action.image ? 'Shows a meme reaction' : 'Shows a reaction card'}</small></div></article>)}</div></section>
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

function App() {
  const videoRef = useRef(null)
  const overlayRef = useRef(null)
  const streamRef = useRef(null)
  const visionRef = useRef(null)
  const cameraGenerationRef = useRef(0)
  const soundRef = useRef(false)
  const [cameraState, setCameraState] = useState('off')
  const [cameraMessage, setCameraMessage] = useState('Camera is off · keyboard test is ready')
  const [activeId, setActiveId] = useState(null)
  const [lastId, setLastId] = useState(null)
  const [confidence, setConfidence] = useState(0)
  const [hud, setHud] = useState(true)
  const [calibrated, setCalibrated] = useState(false)
  const [events, setEvents] = useState([])
  const [sound, setSound] = useState(false)
  const [candidate, setCandidate] = useState(null)
  const [landmarkState, setLandmarkState] = useState('WAITING')

  const active = useMemo(() => ACTIONS.find(action => action.id === activeId) || null, [activeId])

  const trigger = (action, confidenceValue = 0.92, simulated = true) => {
    setActiveId(action.id)
    setLastId(action.id)
    setConfidence(confidenceValue)
    setEvents(current => [{ id: crypto.randomUUID(), action: action.label, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), simulated }, ...current].slice(0, 5))
    if (soundRef.current && 'speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(action.title.toLowerCase()))
  }

  const triggerId = (id, confidenceValue = 0.92, simulated = false) => {
    const action = ACTIONS.find(item => item.id === id)
    if (action) trigger(action, confidenceValue, simulated)
  }

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setCameraMessage('Camera needs localhost or HTTPS. Keyboard test stays available.'); return }
    const generation = ++cameraGenerationRef.current
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 720, facingMode: 'user' }, audio: false })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setCameraState('loading')
      setCameraMessage('Camera live · loading local vision models…')
      const engine = await createVisionEngine(videoRef.current, {
        onStatus: message => setCameraMessage(message),
        onFrame: frame => {
          drawVisionOverlay(overlayRef.current, frame)
          setCandidate(frame.candidate?.id ? frame.candidate : null)
          setConfidence(frame.candidate?.score || 0)
          setLandmarkState(frame.handResult?.landmarks?.length || frame.faceResult?.faceLandmarks?.length || frame.poseResult?.landmarks?.length ? 'TRACKING' : 'SEARCHING')
        },
        onAction: (id, score) => triggerId(id, score, false),
      })
      if (generation !== cameraGenerationRef.current) { engine.stop(); return }
      visionRef.current = engine
      setCameraState('live')
      setCameraMessage('Vision ready · hold an action for a moment')
    } catch (error) {
      streamRef.current?.getTracks().forEach(track => track.stop())
      streamRef.current = null
      setCameraState('blocked')
      setCameraMessage(error.name === 'NotAllowedError' ? 'Camera permission denied · use keyboard test' : `Vision setup failed · ${error.message}`)
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
    setCameraMessage('Camera is off · keyboard test is ready')
    setCandidate(null)
    setLandmarkState('WAITING')
    drawVisionOverlay(overlayRef.current, {})
  }

  useEffect(() => {
    soundRef.current = sound
  }, [sound])

  useEffect(() => {
    const onKeyDown = event => {
      if (event.repeat) return
      const action = ACTIONS.find(item => item.key === event.key)
      if (action) trigger(action, 0.96, true)
      if (event.key.toLowerCase() === 'h') setHud(value => !value)
      if (event.key.toLowerCase() === 'c') setCalibrated(true)
      if (event.key === 'Escape') setActiveId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown); stopCamera() }
  }, [])

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">◎</span><div><strong>Gesture Meme Studio</strong><small>computer vision playground · first review build</small></div></div>
      <div className="top-actions"><span className="privacy-dot" /> LOCAL ONLY <button className="ghost-button" onClick={() => setHud(value => !value)}>HUD {hud ? 'ON' : 'OFF'}</button></div>
    </header>

    <section className="intro"><div><p className="eyebrow">10 ACTIONS · REAL-TIME REACTIONS</p><h1>Your face is the<br /><em>controller.</em></h1><p className="lede">Make a gesture. Get a reaction. This build uses a transparent debug layer so we can tune the computer vision before adding custom assets.</p></div><div className="review-note"><span>BUILD 01</span><strong>Split-screen / Debug HUD</strong><p>Keyboard simulation is active for review. Camera processing remains local to this browser.</p></div></section>

    <section className="studio-grid">
      <section className="reaction-panel panel"><div className="panel-heading"><div><span className="panel-kicker">REACTION OUTPUT</span><h2>Live response</h2></div><span className={`status-badge ${active ? 'fired' : ''}`}>{active ? 'EVENT FIRED' : 'WAITING'}</span></div><div className="reaction-stage"><ReactionCard action={active} active={Boolean(active)} /></div><div className="reaction-footer"><span>{active ? `Last event · ${active.label}` : 'No event yet'}</span><button className="text-button" onClick={() => setActiveId(null)}>Clear reaction ↗</button></div></section>
      <section className="camera-panel panel"><div className="panel-heading"><div><span className="panel-kicker">CAMERA INPUT</span><h2>Vision window</h2></div><span className={`live-badge ${cameraState}`}>{cameraState === 'live' ? '● LIVE' : cameraState === 'loading' ? '● LOADING' : cameraState === 'blocked' ? '● BLOCKED' : '○ OFF'}</span></div><div className="camera-frame"><video ref={videoRef} muted playsInline /><canvas ref={overlayRef} className="vision-overlay" /><div className="camera-placeholder"><span className="camera-crosshair">＋</span><strong>{cameraState === 'live' ? 'Camera preview ready' : cameraState === 'loading' ? 'Loading local vision…' : 'Camera preview'}</strong><small>{cameraMessage}</small></div>{hud && <div className="hud"><div>FACE BOX <b>{cameraState === 'live' ? (candidate ? 'LOCKED' : 'SEARCHING') : 'STANDBY'}</b></div><div>LANDMARKS <b>{cameraState === 'live' ? landmarkState : 'WAITING'}</b></div><div>CANDIDATE <b>{candidate?.id?.replaceAll('_', ' ').toUpperCase() || '—'}</b></div><div>CONFIDENCE <b>{confidence ? confidence.toFixed(2) : '—'}</b></div><div>PROCESSING <b>LOCAL</b></div></div>}</div><div className="camera-controls"><button className="primary-button" onClick={cameraState === 'live' || cameraState === 'loading' ? stopCamera : startCamera}>{cameraState === 'live' || cameraState === 'loading' ? 'Stop camera' : 'Enable camera'}</button><button className="secondary-button" onClick={() => setCalibrated(true)}>Recalibrate · {calibrated ? 'ready' : 'C'}</button></div></section>
    </section>

    <InstructionGuide actions={ACTIONS} />
    <section className="control-strip"><div className="control-copy"><span className="panel-kicker">CONTROL DECK</span><h2>Try the reactions</h2><p>Camera actions fire after three stable frames. Keys and buttons below are simulation fallback.</p></div><div className="settings"><label><input type="checkbox" checked={sound} onChange={event => setSound(event.target.checked)} /> voice cue</label><span className="calibration-state">{calibrated ? '● CALIBRATED' : '○ NOT CALIBRATED'}</span></div><div className="action-grid">{ACTIONS.map(action => <button title={action.gesture} className={`action-button ${lastId === action.id ? 'selected' : ''}`} key={action.id} onClick={() => trigger(action)}><span className="action-key">{action.key}</span><span className="action-icon">{action.icon}</span><span><b>{action.label}</b><small>{action.gesture}</small></span><span className="action-source">{action.source} · SIM</span></button>)}</div></section>

    <section className="event-log panel"><div className="panel-heading"><div><span className="panel-kicker">EVENT LOG</span><h2>Recent triggers</h2></div><span className="log-caption">5 max · cooldown 1.5s</span></div>{events.length ? <div className="event-list">{events.map(event => <div className="event-row" key={event.id}><span className="event-dot" /><strong>{event.action}</strong><span>{event.simulated ? 'keyboard / demo' : 'camera / live'}</span><time>{event.time}</time></div>)}</div> : <div className="empty-log">No triggers yet. The log will help us tune false positives.</div>}</section>

    <footer><span>Gesture Meme Studio · Build 01</span><span>Camera frames never leave this device.</span><span>Keys 1–0 · H HUD · C recalibrate · Esc clear</span></footer>
  </main>
}

createRoot(document.getElementById('root')).render(<App />)
