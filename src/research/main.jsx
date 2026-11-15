import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createVisionEngine } from '../vision-engine'
import { createRecorder } from './recorder'
import { demoStudyIn } from './study'
import { Consent } from './Consent'
import { Calibration } from './Calibration'
import { TaskRunner, Finished } from './TaskRunner'
import { Review } from './Review'
import { Setup } from './Setup'
import { Report } from './Report'
import { SusForm } from './Questionnaires'
import { decodeStudy } from './studyLink'
import { TextError, currentLang, errorText, isLang, pinLang, pinnedLang, translate, translator } from '../i18n/index.js'
import { useT } from '../i18n/react.jsx'
import './research.css'

const participantCode = () => `P-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
// Steps where the session is being recorded: leaving them would lose it, and
// the review screen cannot open over them.
const RECORDING = ['loading', 'calibrate', 'tasks']
// A muted track can come back (a brief OS hiccup); one muted this long is gone.
const MUTE_GRACE_MS = 3000

// Calls onLost once when the camera track ends (unplugged, permission revoked)
// or stays muted (taken by another app, privacy switch). Returns an unwatch.
// The results file keeps the reason in English, whatever the visit's
// language, plus its message key so the review can show it translated.
function watchTrack(track, onLost) {
  const watch = new AbortController()
  const { signal } = watch
  let timer = 0
  const lose = key => { watch.abort(); onLost(translate('en', key), key) }
  const check = () => {
    if (!track.muted) return
    if (document.hidden) timer = setTimeout(check, MUTE_GRACE_MS)
    else lose('participant.cameraLost.stalled')
  }
  const muted = () => { clearTimeout(timer); timer = setTimeout(check, MUTE_GRACE_MS) }
  track.addEventListener('ended', () => lose('participant.cameraLost.ended'), { signal })
  track.addEventListener('mute', muted, { signal })
  track.addEventListener('unmute', () => clearTimeout(timer), { signal })
  signal.addEventListener('abort', () => clearTimeout(timer))
  if (track.muted) muted()
  return () => watch.abort()
}

// Why the camera could not start, for languages other than English, whose
// browser messages are English: the common causes by name, the rest left out.
const CAMERA_ERRORS = { NotFoundError: 'participant.camera.notFound', NotReadableError: 'participant.camera.busy', OverconstrainedError: 'participant.camera.unsupported', SecurityError: 'participant.camera.blocked', AbortError: 'participant.camera.aborted' }
const cameraReason = (t, error) => {
  if (error?.key) return errorText(t, error)
  if (t.lang === 'en') return error?.message
  return CAMERA_ERRORS[error?.name] ? t(CAMERA_ERRORS[error.name]) : ''
}
// The status line is a message ({ key, vars }), a camera failure
// ({ error }) or the vision engine's own progress text ({ text }), which is
// English, so other languages show it only once it is translated.
function statusText(t, status) {
  if (!status) return ''
  if ('text' in status) return t.lang === 'en' || /\p{Script=Han}/u.test(status.text) ? status.text : ''
  if ('error' in status) {
    const reason = cameraReason(t, status.error)
    return reason ? t('participant.camera.failed', { reason }) : t('participant.camera.failedPlain')
  }
  return t(status.key, status.vars)
}

// Researcher screens are hash routes; Review stays mounted once opened.
const SCREENS = { '#review': 'review', '#setup': 'setup', '#report': 'report' }
const RESEARCHER = Object.values(SCREENS)
// A participant link carries its study (?study=...); without one the demo
// study runs, in the language the link names (?lang=, from the Lab's demo
// study) or else the language of the visit.
function linkedStudy() {
  const params = new URLSearchParams(location.search)
  const param = params.get('study')
  const lang = params.get('lang')
  if (!param) return { study: demoStudyIn(isLang(lang) ? lang : currentLang()), demo: true }
  try { return { study: decodeStudy(param) } } catch (error) { return { error } }
}
const LINKED = linkedStudy()
const STUDY = LINKED.study
// The participant sees the study's language (the consent, questionnaires and
// tasks are one instrument), and can switch it for this visit only.
// Researcher screens keep the researcher's own choice.
if (STUDY && !SCREENS[location.hash]) pinLang(STUDY.lang || currentLang())
const firstStep = () => SCREENS[location.hash] || (LINKED.error ? 'bad-link' : 'consent')

// Participant flow: consent → calibration (optional) → tasks → finished.
// Researchers open research.html#review to load and review session files, and
// research.html#setup to make a Figma study link.
function App() {
  const t = useT()
  const videoRef = useRef(null)
  const engineRef = useRef(null)
  const streamRef = useRef(null)
  const unwatchRef = useRef(null)
  const listenersRef = useRef(new Set())
  const recorderRef = useRef(null)
  const participant = useRef(participantCode()).current
  const [step, setStep] = useState(firstStep)
  const [status, setStatus] = useState(null)
  // The study of this session: the demo is worded again in the visit's
  // language when the session starts.
  const studyRef = useRef(STUDY)
  const [cameraOn, setCameraOn] = useState(false)
  const [cameraLost, setCameraLost] = useState(false)
  const [gazeModel, setGazeModel] = useState(null)
  const [session, setSession] = useState(null)
  const [saved, setSaved] = useState(false)
  const stepRef = useRef(step)
  stepRef.current = step
  const backTo = useRef(LINKED.error ? 'bad-link' : 'consent')
  // Review stays mounted, hidden, once opened, so unexported reviews survive
  // Back and Forward. Deleting the data unmounts it.
  const [reviewKept, setReviewKept] = useState(step === 'review')
  const [reviewRequest, setReviewRequest] = useState(0)

  // Leaving for a researcher screen releases the participant's language, and
  // coming back restores it (including a switch made during the visit).
  const visitLang = useRef(STUDY ? STUDY.lang || currentLang() : null)
  useLayoutEffect(() => {
    if (!visitLang.current) return
    if (RESEARCHER.includes(step)) {
      if (pinnedLang()) visitLang.current = pinnedLang()
      pinLang(null)
    } else if (!pinnedLang()) pinLang(visitLang.current)
  }, [step])

  // #review opens the review screen and leaving it goes back, except while a
  // session is being recorded.
  useEffect(() => {
    const onHash = () => {
      const current = stepRef.current
      const target = SCREENS[location.hash]
      if (target) {
        if (RECORDING.includes(current)) history.replaceState(null, '', location.pathname + location.search)
        else if (current !== target) {
          if (!RESEARCHER.includes(current)) backTo.current = current
          if (target === 'review') setReviewKept(true)
          setStep(target)
        }
      } else if (RESEARCHER.includes(current)) setStep(backTo.current)
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
  // reason is English (it is saved in the file); reasonKey, when there is one,
  // lets the review show it in the reader's language.
  const loseCamera = (reason, reasonKey) => {
    const recorder = recorderRef.current
    if (recorder && !recorder.session.quality.cameraLost) {
      const last = recorder.session.tasks.at(-1)
      recorder.session.quality.cameraLost = { t: recorder.now(), taskId: last && last.end === null ? last.id : null, reason, ...(reasonKey ? { reasonKey } : {}) }
    }
    stopCamera()
    setGazeModel(null)
    setCameraLost(true)
    setStatus({ key: 'participant.camera.stopped' })
    setStep(current => (current === 'calibrate' ? 'tasks' : current))
  }

  const begin = async withCamera => {
    if (LINKED.demo) studyRef.current = demoStudyIn(currentLang())
    recorderRef.current = createRecorder({ study: studyRef.current, participant })
    if (!withCamera) { setStep('tasks'); return }
    setStep('loading')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 720, facingMode: 'user' }, audio: false })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      engineRef.current = await createVisionEngine(videoRef.current, {
        models: { face: true },
        onStatus: text => setStatus({ text }),
        onFrame: frame => listenersRef.current.forEach(listener => listener(frame)),
        onError: error => loseCamera(errorText(translator('en'), error), error?.key),
      })
      const [track] = stream.getVideoTracks()
      if (track.readyState === 'ended') throw new TextError('participant.camera.disconnected')
      unwatchRef.current = watchTrack(track, loseCamera)
      setCameraOn(true)
      setStatus(null)
      setStep('calibrate')
    } catch (error) {
      stopCamera()
      setStatus(error.name === 'NotAllowedError' ? { key: 'participant.camera.declined' } : { error })
      setStep('tasks')
    }
  }

  const calibrated = ({ model, accuracy, passed, baseline }) => {
    const { quality } = recorderRef.current.session
    const usable = passed && !quality.cameraLost
    quality.gazeEnabled = usable
    // Skipping measures nothing, so there is no accuracy to store.
    quality.accuracy = accuracy && { meanPx: Math.round(accuracy.meanPx), meanDegrees: Math.round(accuracy.meanDegrees * 100) / 100 }
    recorderRef.current.session.baseline = baseline
    setGazeModel(usable ? model : null)
    setStep('tasks')
  }

  const finish = () => {
    stopCamera()
    recorderRef.current.stop()
    setSession(recorderRef.current.session)
    setStep('sus')
  }

  const discard = () => {
    stopCamera()
    recorderRef.current?.stop()
    recorderRef.current = null
    setSession(null)
    setReviewKept(false)
    setStep('deleted')
  }

  // On the consent screen the demo follows a language switch at once (its
  // title and task count are in the header); begin() words it again for the
  // session.
  const consentDemo = useMemo(() => (LINKED.demo ? demoStudyIn(t.lang) : null), [t.lang])
  const study = step === 'consent' && consentDemo ? consentDemo : studyRef.current
  const notice = statusText(t, status)
  return <div className={`copilot step-${step}`}>
    <video ref={videoRef} className={`camera-feed ${step === 'calibrate' ? 'is-visible' : ''}`} muted playsInline />
    {step === 'consent' && <Consent study={study} participant={participant} onBegin={begin} />}
    {step === 'loading' && <div className="center-note"><span className="kicker">{t('participant.loading.kicker')}</span><h2>{t('participant.loading.title')}</h2><p className="muted">{notice || t('participant.loading.hint')}</p></div>}
    {step === 'calibrate' && <Calibration subscribe={subscribe} aspect={aspect} onDone={calibrated} />}
    {step === 'tasks' && <TaskRunner study={study} recorder={recorderRef.current} gazeModel={gazeModel} subscribe={subscribe} aspect={aspect} cameraOn={cameraOn} cameraLost={cameraLost} notice={notice} onFinish={finish} onStop={discard} />}
    {step === 'sus' && <SusForm study={study} participant={participant} onDone={answers => { recorderRef.current?.setSus(answers, currentLang()); setStep('finished') }} />}
    {step === 'finished' && <Finished session={session} saved={saved} onSaved={() => setSaved(true)} onReview={() => { setReviewRequest(count => count + 1); location.hash = 'review' }} onDelete={discard} />}
    {step === 'deleted' && <div className="center-note"><span className="kicker">{t('participant.deleted.kicker')}</span><h2>{saved ? t('participant.deleted.titleSaved') : t('participant.deleted.title')}</h2><p className="muted">{saved ? t('participant.deleted.saved') : t('participant.deleted.unsaved')}</p></div>}
    {step === 'setup' && <Setup />}
    {step === 'report' && <Report />}
    {step === 'bad-link' && <div className="center-note"><span className="kicker">{t('participant.badLink.kicker')}</span><h2>{t('participant.badLink.title')}</h2><p className="muted">{errorText(t, LINKED.error)}</p></div>}
    {reviewKept && <div hidden={step !== 'review'}><Review initialSession={session} request={reviewRequest} hidden={step !== 'review'} /></div>}
  </div>
}

createRoot(document.getElementById('root')).render(<App />)
