import React, { useEffect, useReducer, useRef } from 'react'
import { DEGREES_PER_CSS_PX, fitGazeModel, gazeFeatures, measureAccuracy } from './gaze'
import { GAZE_THRESHOLD_DEGREES } from './study'

// Nine dots to fit the gaze model, then nine different dots to measure how
// accurate it is. Accuracy is always measured on points the model never saw,
// out to the same edges: the model is least accurate there, and that is where
// pages keep their menus and footers.
const CALIBRATION_POINTS = [[0.08, 0.12], [0.5, 0.12], [0.92, 0.12], [0.08, 0.5], [0.5, 0.5], [0.92, 0.5], [0.08, 0.88], [0.5, 0.88], [0.92, 0.88]]
const VALIDATION_POINTS = [[0.27, 0.12], [0.73, 0.12], [0.08, 0.31], [0.92, 0.31], [0.27, 0.5], [0.08, 0.69], [0.92, 0.69], [0.27, 0.88], [0.73, 0.88]]
const COLLECT_MS = 900
const MIN_SAMPLES = 6
const MAX_ATTEMPTS = 3
// No camera frame for this long means the camera or the vision engine stopped.
const STALL_MS = 3000
const STALL_WARNING = 'The camera stopped sending pictures. Click the dot to try again, or skip gaze and continue.'
// A baseline from fewer face frames is too noisy to judge brow and lean by.
const BASELINE_SAMPLES = 15

const median = values => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[sorted.length >> 1] : 0
}

export const faceSample = (frame, features) => {
  const scores = new Map((frame.faceResult?.faceBlendshapes?.[0]?.categories || []).map(item => [item.categoryName, item.score]))
  return { brow: ((scores.get('browDownLeft') || 0) + (scores.get('browDownRight') || 0)) / 2, scale: features[16] }
}

const freshState = attempt => ({ phase: 'calibrate', index: 0, attempt, calibration: [], validation: [], brow: [], scale: [], collect: null, warning: '', faceSeen: false, stalled: false, model: null, accuracy: null })

export function Calibration({ subscribe, aspect, onDone }) {
  const state = useRef(freshState(1))
  const lastFrame = useRef(performance.now())
  const [, render] = useReducer(count => count + 1, 0)
  const points = state.current.phase === 'validate' ? VALIDATION_POINTS : CALIBRATION_POINTS

  useEffect(() => subscribe(frame => {
    lastFrame.current = performance.now()
    const current = state.current
    if (current.stalled) { current.stalled = false; current.warning = ''; render() }
    const features = gazeFeatures(frame.faceResult, aspect())
    if (Boolean(features) !== current.faceSeen) { current.faceSeen = Boolean(features); render() }
    if (features && current.phase === 'calibrate') {
      const sample = faceSample(frame, features)
      current.brow.push(sample.brow)
      current.scale.push(sample.scale)
    }
    const collect = current.collect
    if (!collect) return
    if (features) collect.samples.push({ features, x: collect.target.x, y: collect.target.y })
    if (performance.now() < collect.until) return
    current.collect = null
    if (collect.samples.length < MIN_SAMPLES) {
      current.warning = 'We could not see your face clearly. Sit centred in even light, then click the dot again.'
      render()
      return
    }
    current.warning = ''
    current[current.phase === 'validate' ? 'validation' : 'calibration'].push(...collect.samples)
    current.index += 1
    if (current.index === CALIBRATION_POINTS.length && current.phase === 'calibrate') {
      current.model = fitGazeModel(current.calibration)
      current.phase = 'validate'
      current.index = 0
    } else if (current.index === VALIDATION_POINTS.length && current.phase === 'validate') {
      current.accuracy = measureAccuracy(current.model, current.validation)
      current.phase = 'result'
    }
    render()
  }), [subscribe, aspect])

  // A dot only finishes when a frame arrives. If frames stop, end the dot and
  // say so, so the participant can click again or skip.
  useEffect(() => {
    const timer = setInterval(() => {
      const current = state.current
      const now = performance.now()
      const stuck = current.collect && now - Math.max(lastFrame.current, current.collect.start) > STALL_MS
      if (!stuck && (current.stalled || now - lastFrame.current < STALL_MS)) return
      if (stuck) current.collect = null
      current.stalled = true
      current.warning = STALL_WARNING
      render()
    }, 500)
    return () => clearInterval(timer)
  }, [])

  const clickDot = event => {
    if (state.current.collect) return
    const rect = event.currentTarget.getBoundingClientRect()
    const now = performance.now()
    state.current.collect = { target: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, start: now, until: now + COLLECT_MS, samples: [] }
    render()
  }
  // null when too few face frames were seen; the recorder then takes the
  // baseline from the first face frames of the tasks (recordFace).
  const baseline = () => {
    const { brow, scale } = state.current
    return brow.length >= BASELINE_SAMPLES ? { brow: median(brow), scale: median(scale) } : null
  }
  const finish = passed => onDone({ model: state.current.model, accuracy: state.current.accuracy, passed, baseline: baseline() })
  const retry = () => { state.current = freshState(state.current.attempt + 1); render() }
  const skip = () => onDone({ model: null, accuracy: null, passed: false, baseline: baseline() })

  const current = state.current
  if (current.phase === 'result') {
    const { accuracy } = current
    const passed = accuracy.meanDegrees <= GAZE_THRESHOLD_DEGREES
    const canRetry = current.attempt < MAX_ATTEMPTS
    const percent = Math.min(100, (accuracy.meanDegrees / (GAZE_THRESHOLD_DEGREES * 1.5)) * 100)
    const tip = (GAZE_THRESHOLD_DEGREES / (GAZE_THRESHOLD_DEGREES * 1.5)) * 100
    // Error lines go under the card. Crosses and estimates go over its
    // background but under its text, so the card never hides one (a poor fit
    // puts the estimates in the middle, where the card is).
    return <div className="calibration is-result">
      <svg className="vectors" width="100%" height="100%" aria-hidden="true">
        {accuracy.points.map(({ target, estimate }, index) => <line key={index} x1={target.x} y1={target.y} x2={estimate.x} y2={estimate.y} className="error" />)}
      </svg>
      <svg className="vectors markers" width="100%" height="100%" aria-hidden="true">
        {accuracy.points.map(({ target, estimate }, index) => <g key={index}>
          <path d={`M${target.x - 12} ${target.y}h24M${target.x} ${target.y - 12}v24`} className="cross" />
          <circle cx={estimate.x} cy={estimate.y} r="5" className="estimate" />
        </g>)}
      </svg>
      <div className="panel result-panel">
        <span className="kicker">Step 2 of 3 · Check accuracy</span>
        <h2>{passed ? 'Accuracy check passed' : 'Accuracy is too low for gaze'}</h2>
        <p className="muted small">We compared {accuracy.points.length} new dots with where the camera thinks you looked.</p>
        <div className={`big ${passed ? '' : 'is-bad'}`}>{accuracy.meanDegrees.toFixed(1)}°</div>
        <span className="mono small muted">≈ {Math.round(accuracy.meanPx)} px average error · threshold {GAZE_THRESHOLD_DEGREES.toFixed(1)}° ({Math.round(GAZE_THRESHOLD_DEGREES / DEGREES_PER_CSS_PX)} px)</span>
        <div className="meter"><i style={{ width: `${percent}%` }} className={passed ? '' : 'is-bad'} /><b style={{ left: `${tip}%` }} /></div>
        <p className="small">{passed ? `Areas smaller than about ${Math.round(accuracy.meanPx * 2)} px will be merged for analysis.` : `Clicks, page changes and facial movement still work without gaze.${canRetry ? ' You can try again with your face centred and evenly lit.' : ''}`}</p>
        <div className="legend"><span><i className="swatch cross-swatch" />dot you looked at</span><span><i className="swatch estimate-swatch" />camera estimate</span><span><i className="swatch error-swatch" />error</span></div>
        <div className="actions">
          {passed ? <button className="btn primary" onClick={() => finish(true)}>Start the tasks</button> : <button className="btn primary" onClick={() => finish(false)}>Continue without gaze</button>}
          {canRetry && <button className="btn ghost" onClick={retry}>Recalibrate</button>}
        </div>
      </div>
    </div>
  }

  const [px, py] = points[current.index]
  const [chipClass, chipText] = current.stalled ? ['strong', 'CAMERA NOT RESPONDING'] : current.faceSeen ? ['live', 'FACE FOUND'] : ['strong', 'LOOKING FOR YOUR FACE']
  // The instructions and camera preview move to the bottom while the dot is
  // in the top half, so they never cover it.
  return <div className={`calibration ${py < 0.5 ? 'is-dot-high' : ''}`}>
    <button className={`calibration-dot ${current.collect ? 'is-collecting' : ''}`} style={{ left: `${px * 100}%`, top: `${py * 100}%` }} onClick={clickDot} aria-label={`Calibration dot ${current.index + 1}`} />
    <div className="calibration-head">
      <span className="kicker">Step 2 of 3 · {current.phase === 'validate' ? 'Check accuracy' : 'Calibrate'} · dot {current.index + 1} of {points.length}</span>
      <h2>Look at the dot, then click it</h2>
      <p className="muted">Keep looking at it until it shrinks away.{current.attempt > 1 ? ` Attempt ${current.attempt} of ${MAX_ATTEMPTS}.` : ''}</p>
      <span className={`chip ${chipClass}`}><span className="dot" />{chipText}</span>
      {current.warning && <p className="warning">{current.warning}</p>}
      <button className="text-button" onClick={skip}>Skip gaze and continue</button>
    </div>
  </div>
}
