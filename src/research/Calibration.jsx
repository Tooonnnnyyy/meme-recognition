import React, { useEffect, useReducer, useRef } from 'react'
import { DEGREES_PER_CSS_PX, fitGazeModel, gazeFeatures, measureAccuracy } from './gaze'
import { GAZE_THRESHOLD_DEGREES } from './study'

// Nine dots to fit the gaze model, then nine different dots to measure how
// accurate it is. Accuracy is always measured on points the model never saw.
const CALIBRATION_POINTS = [[0.08, 0.12], [0.5, 0.12], [0.92, 0.12], [0.08, 0.5], [0.5, 0.5], [0.92, 0.5], [0.08, 0.88], [0.5, 0.88], [0.92, 0.88]]
const VALIDATION_POINTS = [[0.28, 0.28], [0.72, 0.28], [0.5, 0.36], [0.3, 0.55], [0.7, 0.55], [0.4, 0.45], [0.28, 0.75], [0.64, 0.76], [0.58, 0.64]]
const COLLECT_MS = 900
const MIN_SAMPLES = 6
const MAX_ATTEMPTS = 3

const median = values => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[sorted.length >> 1] : 0
}

export const faceSample = (frame, features) => {
  const scores = new Map((frame.faceResult?.faceBlendshapes?.[0]?.categories || []).map(item => [item.categoryName, item.score]))
  return { brow: ((scores.get('browDownLeft') || 0) + (scores.get('browDownRight') || 0)) / 2, scale: features[16] }
}

const freshState = attempt => ({ phase: 'calibrate', index: 0, attempt, calibration: [], validation: [], brow: [], scale: [], collect: null, warning: '', faceSeen: false, model: null, accuracy: null })

export function Calibration({ subscribe, aspect, onDone }) {
  const state = useRef(freshState(1))
  const [, render] = useReducer(count => count + 1, 0)
  const points = state.current.phase === 'validate' ? VALIDATION_POINTS : CALIBRATION_POINTS

  useEffect(() => subscribe(frame => {
    const current = state.current
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

  const clickDot = event => {
    if (state.current.collect) return
    const rect = event.currentTarget.getBoundingClientRect()
    state.current.collect = { target: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, until: performance.now() + COLLECT_MS, samples: [] }
    render()
  }
  const finish = passed => onDone({
    model: state.current.model,
    accuracy: state.current.accuracy,
    passed,
    baseline: state.current.brow.length ? { brow: median(state.current.brow), scale: median(state.current.scale) } : null,
  })
  const retry = () => { state.current = freshState(state.current.attempt + 1); render() }
  const skip = () => onDone({ model: null, accuracy: { meanPx: 0, meanDegrees: 0 }, passed: false, baseline: state.current.brow.length ? { brow: median(state.current.brow), scale: median(state.current.scale) } : null })

  const current = state.current
  if (current.phase === 'result') {
    const { accuracy } = current
    const passed = accuracy.meanDegrees <= GAZE_THRESHOLD_DEGREES
    const percent = Math.min(100, (accuracy.meanDegrees / (GAZE_THRESHOLD_DEGREES * 1.5)) * 100)
    const tip = (GAZE_THRESHOLD_DEGREES / (GAZE_THRESHOLD_DEGREES * 1.5)) * 100
    return <div className="calibration">
      <div className="calibration-head"><span className="kicker">Step 2 of 3 · Check accuracy</span><h2>{passed ? 'Accuracy check passed' : 'Accuracy is too low for gaze'}</h2><p className="muted">We compared {accuracy.points.length} new dots with where the camera thinks you looked.</p></div>
      <svg className="vectors" width="100%" height="100%" aria-hidden="true">
        {accuracy.points.map(({ target, estimate }, index) => <g key={index}>
          <path d={`M${target.x - 12} ${target.y}h24M${target.x} ${target.y - 12}v24`} className="cross" />
          <line x1={target.x} y1={target.y} x2={estimate.x} y2={estimate.y} className="error" />
          <circle cx={estimate.x} cy={estimate.y} r="5" className="estimate" />
        </g>)}
      </svg>
      <div className="legend"><span><i className="swatch cross-swatch" />dot you looked at</span><span><i className="swatch estimate-swatch" />camera estimate</span><span><i className="swatch error-swatch" />error</span></div>
      <div className="panel result-panel">
        <span className="kicker">Gaze accuracy</span>
        <div className={`big ${passed ? '' : 'is-bad'}`}>{accuracy.meanDegrees.toFixed(1)}°</div>
        <span className="mono small muted">≈ {Math.round(accuracy.meanPx)} px average error · threshold {GAZE_THRESHOLD_DEGREES.toFixed(1)}° ({Math.round(GAZE_THRESHOLD_DEGREES / DEGREES_PER_CSS_PX)} px)</span>
        <div className="meter"><i style={{ width: `${percent}%` }} className={passed ? '' : 'is-bad'} /><b style={{ left: `${tip}%` }} /></div>
        <p className="small">{passed ? `Areas smaller than about ${Math.round(accuracy.meanPx * 2)} px will be merged for analysis.` : 'Clicks, page changes and facial movement still work without gaze. You can try once more with your face centred and evenly lit.'}</p>
        <div className="actions">
          {passed ? <button className="btn primary" onClick={() => finish(true)}>Start the tasks</button> : <button className="btn primary" onClick={() => finish(false)}>Continue without gaze</button>}
          {current.attempt < MAX_ATTEMPTS && <button className="btn ghost" onClick={retry}>Recalibrate</button>}
        </div>
      </div>
    </div>
  }

  const [px, py] = points[current.index]
  return <div className="calibration">
    <div className="calibration-head">
      <span className="kicker">Step 2 of 3 · {current.phase === 'validate' ? 'Check accuracy' : 'Calibrate'} · dot {current.index + 1} of {points.length}</span>
      <h2>Look at the dot, then click it</h2>
      <p className="muted">Keep looking at it until it shrinks away.{current.attempt > 1 ? ` Attempt ${current.attempt} of ${MAX_ATTEMPTS}.` : ''}</p>
      <span className={`chip ${current.faceSeen ? 'live' : 'strong'}`}><span className="dot" />{current.faceSeen ? 'FACE FOUND' : 'LOOKING FOR YOUR FACE'}</span>
      {current.warning && <p className="warning">{current.warning}</p>}
    </div>
    <button className={`calibration-dot ${current.collect ? 'is-collecting' : ''}`} style={{ left: `${px * 100}%`, top: `${py * 100}%` }} onClick={clickDot} aria-label={`Calibration dot ${current.index + 1}`} />
    <button className="text-button skip" onClick={skip}>Skip gaze and continue</button>
  </div>
}
