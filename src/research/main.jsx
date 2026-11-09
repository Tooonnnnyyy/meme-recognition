import React, { useCallback, useRef, useState } from 'react'
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

// Participant flow: consent → calibration (optional) → tasks → finished.
// Researchers open research.html#review to load and review session files.
function App() {
  const videoRef = useRef(null)
  const engineRef = useRef(null)
  const streamRef = useRef(null)
  const listenersRef = useRef(new Set())
  const recorderRef = useRef(null)
  const participant = useRef(participantCode()).current
  const [step, setStep] = useState(location.hash === '#review' ? 'review' : 'consent')
  const [status, setStatus] = useState('')
  const [cameraOn, setCameraOn] = useState(false)
  const [gazeModel, setGazeModel] = useState(null)
  const [session, setSession] = useState(null)

  const subscribe = useCallback(listener => {
    listenersRef.current.add(listener)
    return () => listenersRef.current.delete(listener)
  }, [])
  const aspect = useCallback(() => (videoRef.current?.videoWidth || 4) / (videoRef.current?.videoHeight || 3), [])

  const stopCamera = () => {
    engineRef.current?.stop()
    engineRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOn(false)
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
        onError: error => { stopCamera(); setStatus(`Camera stopped (${error.message}). The session continues without camera signals.`) },
      })
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
    quality.gazeEnabled = passed
    quality.accuracy = { meanPx: Math.round(accuracy.meanPx), meanDegrees: Math.round(accuracy.meanDegrees * 100) / 100 }
    recorderRef.current.session.baseline = baseline
    setGazeModel(passed ? model : null)
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
    {step === 'tasks' && <TaskRunner study={DEMO_STUDY} recorder={recorderRef.current} gazeModel={gazeModel} subscribe={subscribe} aspect={aspect} cameraOn={cameraOn} notice={status} onFinish={finish} onStop={discard} />}
    {step === 'finished' && <Finished session={session} onReview={() => setStep('review')} onDelete={discard} />}
    {step === 'deleted' && <div className="center-note"><span className="kicker">Session ended</span><h2>Your data was deleted</h2><p className="muted">Nothing from this session was saved or sent. You can close this tab.</p></div>}
    {step === 'review' && <Review initialSession={session} />}
  </div>
}

createRoot(document.getElementById('root')).render(<App />)
