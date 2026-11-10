import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createVisionEngine } from '../vision-engine'
import { createRecorder } from './recorder'
import { DEMO_STUDY } from './study'
import { Consent } from './Consent'
import { Calibration } from './Calibration'
import { TaskRunner, Finished } from './TaskRunner'
import { Review } from './Review'
import './research.css'

const participantCode = () => `P-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
// Steps where the session is being recorded: leaving them would lose it, and
// the review screen cannot open over them.
const RECORDING = ['loading', 'calibrate', 'tasks']
// A muted track can come back (a brief OS hiccup); one muted this long is gone.
const MUTE_GRACE_MS = 3000

// Calls onLost once when the camera track ends (unplugged, permission revoked)
// or stays muted (taken by another app, privacy switch). Returns an unwatch.
function watchTrack(track, onLost) {
  const watch = new AbortController()
  const { signal } = watch
  let timer = 0
  const lose = reason => { watch.abort(); onLost(reason) }
  const check = () => {
    if (!track.muted) return
    if (document.hidden) timer = setTimeout(check, MUTE_GRACE_MS)
    else lose('The camera stopped sending pictures')
  }
  const muted = () => { clearTimeout(timer); timer = setTimeout(check, MUTE_GRACE_MS) }
  track.addEventListener('ended', () => lose('The camera was disconnected or turned off'), { signal })
  track.addEventListener('mute', muted, { signal })
  track.addEventListener('unmute', () => clearTimeout(timer), { signal })
  signal.addEventListener('abort', () => clearTimeout(timer))
  if (track.muted) muted()
  return () => watch.abort()
}

// Participant flow: consent → calibration (optional) → tasks → finished.
// Researchers open research.html#review to load and review session files.
function App() {
  const videoRef = useRef(null)
  const engineRef = useRef(null)
  const streamRef = useRef(null)
  const unwatchRef = useRef(null)
  const listenersRef = useRef(new Set())
  const recorderRef = useRef(null)
  const participant = useRef(participantCode()).current
  const [step, setStep] = useState(location.hash === '#review' ? 'review' : 'consent')
  const [status, setStatus] = useState('')
  const [cameraOn, setCameraOn] = useState(false)
  const [cameraLost, setCameraLost] = useState(false)
  const [gazeModel, setGazeModel] = useState(null)
  const [session, setSession] = useState(null)
  const [saved, setSaved] = useState(false)
  const stepRef = useRef(step)
  stepRef.current = step
  const backTo = useRef('consent')

  // #review opens the review screen and leaving it goes back, except while a
  // session is being recorded.
  useEffect(() => {
    const onHash = () => {
      const current = stepRef.current
      if (location.hash === '#review') {
        if (RECORDING.includes(current)) history.replaceState(null, '', location.pathname + location.search)
        else if (current !== 'review') { backTo.current = current; setStep('review') }
      } else if (current === 'review') setStep(backTo.current)
    }
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  // The session lives only in this tab until it is downloaded.
  const unsaved = RECORDING.includes(step) || (Boolean(session) && !saved)
  useEffect(() => {
    if (!unsaved) return undefined
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    addEventListener('beforeunload', warn)
    return () => removeEventListener('beforeunload', warn)
  }, [unsaved])

  const subscribe = useCallback(listener => {
    listenersRef.current.add(listener)
    return () => listenersRef.current.delete(listener)
  }, [])
  const aspect = useCallback(() => (videoRef.current?.videoWidth || 4) / (videoRef.current?.videoHeight || 3), [])

  const stopCamera = () => {
    unwatchRef.current?.()
    unwatchRef.current = null
    engineRef.current?.stop()
    engineRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOn(false)
  }

  // Marks the moment in the file, so the review knows there is no gaze or
  // face data after it, and carries on without the camera.
  const loseCamera = reason => {
    const recorder = recorderRef.current
    if (recorder && !recorder.session.quality.cameraLost) {
      const last = recorder.session.tasks.at(-1)
      recorder.session.quality.cameraLost = { t: recorder.now(), taskId: last && last.end === null ? last.id : null, reason }
    }
    stopCamera()
    setGazeModel(null)
    setCameraLost(true)
    setStatus('The camera stopped, so the rest of the session continues without it.')
    setStep(current => (current === 'calibrate' ? 'tasks' : current))
  }

  const begin = async withCamera => {
    recorderRef.current = createRecorder({ study: DEMO_STUDY, participant })
    if (!withCamera) { setStep('tasks'); return }
    setStep('loading')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 720, facingMode: 'user' }, audio: false })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      engineRef.current = await createVisionEngine(videoRef.current, {
        models: { face: true },
        onStatus: setStatus,
        onFrame: frame => listenersRef.current.forEach(listener => listener(frame)),
        onError: error => loseCamera(error.message),
      })
      const [track] = stream.getVideoTracks()
      if (track.readyState === 'ended') throw new Error('the camera was disconnected')
      unwatchRef.current = watchTrack(track, loseCamera)
      setCameraOn(true)
      setStatus('')
      setStep('calibrate')
    } catch (error) {
      stopCamera()
      setStatus(error.name === 'NotAllowedError' ? 'Camera permission was declined, so this session continues without camera signals.' : `The camera could not start (${error.message}), so this session continues without camera signals.`)
      setStep('tasks')
    }
  }

  const calibrated = ({ model, accuracy, passed, baseline }) => {
    const { quality } = recorderRef.current.session
    const usable = passed && !quality.cameraLost
    quality.gazeEnabled = usable
    quality.accuracy = { meanPx: Math.round(accuracy.meanPx), meanDegrees: Math.round(accuracy.meanDegrees * 100) / 100 }
    recorderRef.current.session.baseline = baseline
    setGazeModel(usable ? model : null)
    setStep('tasks')
  }

  const finish = () => {
    stopCamera()
    recorderRef.current.stop()
    setSession(recorderRef.current.session)
    setStep('finished')
  }

  const discard = () => {
    stopCamera()
    recorderRef.current?.stop()
    recorderRef.current = null
    setSession(null)
    setStep('deleted')
  }

  return <div className={`copilot step-${step}`}>
    <video ref={videoRef} className={`camera-feed ${step === 'calibrate' ? 'is-visible' : ''}`} muted playsInline />
    {step === 'consent' && <Consent study={DEMO_STUDY} participant={participant} onBegin={begin} />}
    {step === 'loading' && <div className="center-note"><span className="kicker">Starting the camera</span><h2>Loading on-device vision…</h2><p className="muted">{status || 'This takes a few seconds the first time.'}</p></div>}
    {step === 'calibrate' && <Calibration subscribe={subscribe} aspect={aspect} onDone={calibrated} />}
    {step === 'tasks' && <TaskRunner study={DEMO_STUDY} recorder={recorderRef.current} gazeModel={gazeModel} subscribe={subscribe} aspect={aspect} cameraOn={cameraOn} cameraLost={cameraLost} notice={status} onFinish={finish} onStop={discard} />}
    {step === 'finished' && <Finished session={session} saved={saved} onSaved={() => setSaved(true)} onReview={() => { location.hash = 'review' }} onDelete={discard} />}
    {step === 'deleted' && <div className="center-note"><span className="kicker">Session ended</span><h2>{saved ? 'Your data was deleted from this page' : 'Your data was deleted'}</h2><p className="muted">{saved ? 'The results file you downloaded is still in your downloads folder. Delete it there too if you do not want to keep it. You can close this tab.' : 'Nothing from this session was saved or sent. You can close this tab.'}</p></div>}
    {step === 'review' && <Review initialSession={session} />}
  </div>
}

createRoot(document.getElementById('root')).render(<App />)
