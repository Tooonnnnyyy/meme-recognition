import { calibrationSignals, classifyVision, createVisionGate } from './vision-rules'
import { createFrameSmoother } from './smoothing'
import { createCalibrationSession } from './calibration'

// Absolute so the worker (whose own URL lives under /assets or /src) and the
// MediaPipe loader resolve models and WASM from the same place as the page.
const assetUrl = path => new URL(`${import.meta.env.BASE_URL}${path}`, location.href).href

// Troubleshooting switches: ?runtime=main skips the worker, ?delegate=cpu|gpu
// pins the inference backend.
function engineOverrides() {
  const params = new URLSearchParams(location.search)
  const delegate = params.get('delegate')?.toUpperCase()
  return { runtime: params.get('runtime'), delegate: delegate === 'CPU' || delegate === 'GPU' ? delegate : 'auto' }
}

async function startWorkerBackend(options, onStatus) {
  const worker = new Worker(new URL('./vision-worker.js', import.meta.url), { type: 'module' })
  const pending = new Map()
  let nextId = 1
  let failure = null
  let delegate = null

  const fail = error => {
    failure = error
    pending.forEach(({ reject }) => reject(error))
    pending.clear()
  }
  const request = (message, transfer = []) => new Promise((resolve, reject) => {
    if (failure) { reject(failure); return }
    const id = nextId++
    pending.set(id, { resolve, reject })
    worker.postMessage({ ...message, id }, transfer)
  })

  worker.onmessage = ({ data }) => {
    if (data.type === 'status') { onStatus(data.message); return }
    const entry = pending.get(data.id)
    if (!entry) return
    pending.delete(data.id)
    if (data.delegate) delegate = data.delegate
    if (data.type === 'error') entry.reject(new Error(data.message))
    else entry.resolve(data)
  }
  worker.onerror = event => {
    event.preventDefault()
    fail(new Error(event.message || 'Vision worker failed to load'))
  }
  worker.onmessageerror = () => fail(new Error('Vision worker sent an unreadable message'))

  return request({ type: 'init', options }).then(() => ({
    runtime: 'worker',
    get delegate() { return delegate },
    async detect(video, timestamp) {
      const frame = await createImageBitmap(video)
      const { result, inferenceMs } = await request({ type: 'frame', frame, timestamp }, [frame])
      return { ...result, inferenceMs }
    },
    analyzeImages: images => request({ type: 'analyze', images }).then(data => data.results),
    close() {
      fail(new Error('Vision worker stopped'))
      worker.terminate()
    },
  }), error => {
    worker.terminate()
    throw error
  })
}

async function startMainThreadBackend(options, onStatus) {
  const { loadVisionModels } = await import('./vision-models')
  const models = await loadVisionModels({ ...options, onStatus })
  return {
    runtime: 'main',
    get delegate() { return models.delegate },
    async detect(video, timestamp) {
      const started = performance.now()
      const result = await models.detect(video, timestamp)
      return { ...result, inferenceMs: performance.now() - started }
    },
    analyzeImages: images => models.analyzeImages(images),
    close: () => models.close(),
  }
}

const average = (previous, next, weight = 0.1) => (previous ? previous + (next - previous) * weight : next)

// Worker frames are ImageBitmaps, which MediaPipe can only read through WebGL
// (even on its CPU path); the main thread reads the <video> element directly.
function webglAvailable() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return Boolean(gl)
  } catch {
    return false
  }
}

export async function createVisionEngine(video, { onFrame, onStatus, onAction = () => {}, onError = () => {}, baseline: initialBaseline = null, models }) {
  const overrides = engineOverrides()
  const options = { wasmBase: assetUrl('vision/wasm'), modelBase: assetUrl('vision/'), delegate: overrides.delegate, ...(models && { models }) }
  let backend
  if (typeof Worker !== 'undefined' && overrides.runtime !== 'main' && webglAvailable()) {
    onStatus('Loading on-device vision models in a background worker…')
    backend = await startWorkerBackend(options, onStatus).catch(error => {
      console.warn('Vision worker unavailable; running models on the main thread.', error)
      return null
    })
  }
  if (!backend) {
    onStatus('Loading on-device vision models…')
    backend = await startMainThreadBackend(options, onStatus)
  }

  const smooth = createFrameSmoother()
  const gate = createVisionGate({ stableFrames: 3, stableMs: 200, cooldownMs: 1200 })
  const stats = { runtime: backend.runtime, delegate: backend.delegate, fps: 0, inferenceMs: 0 }
  let baseline = initialBaseline
  let calibration = null
  let animationFrame = 0
  let lastVideoTime = -1
  let lastFrameAt = 0
  let busy = false
  let stopped = false
  let movedToMainThread = false

  const handle = (result, timestamp) => {
    const frame = smooth(result, timestamp)
    const visionFrame = { handResult: frame.hand, faceResult: frame.face, poseResult: frame.pose }
    if (calibration) {
      const { progress, baseline: measured, error } = calibration.session.add(calibrationSignals(visionFrame), timestamp)
      calibration.onProgress(progress)
      if (measured) { baseline = measured; calibration.resolve(measured); calibration = null }
      else if (error) { calibration.reject(new Error(error)); calibration = null }
    }
    if (lastFrameAt) stats.fps = average(stats.fps, 1000 / Math.max(timestamp - lastFrameAt, 1))
    lastFrameAt = timestamp
    stats.inferenceMs = average(stats.inferenceMs, result.inferenceMs)
    stats.delegate = backend.delegate
    const candidate = classifyVision(visionFrame, { baseline })
    onFrame({ ...visionFrame, raw: result, candidate, baseline, timestamp, stats: { ...stats } })
    const fired = gate(candidate.id, timestamp)
    if (fired) onAction(fired, candidate.score)
  }

  const stop = () => {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(animationFrame)
    calibration?.reject(new Error('Camera stopped'))
    calibration = null
    backend.close()
  }

  // Safety net for inference failures: a worker can load and still fail on
  // real frames (some pipeline stages only run once a face is found). Retry
  // once on the main thread before giving up.
  const recover = async error => {
    if (stopped) return
    if (backend.runtime === 'worker' && !movedToMainThread) {
      movedToMainThread = true
      console.warn('Vision worker failed on a live frame; moving to the main thread.', error)
      onStatus('Background worker failed · reloading vision on the main thread…')
      backend.close()
      try {
        backend = await startMainThreadBackend(options, onStatus)
        stats.runtime = backend.runtime
        if (stopped) backend.close()
        else onStatus(`Vision ready · main thread · ${backend.delegate}`)
        return
      } catch (fallbackError) {
        error = fallbackError
      }
    }
    if (stopped) return
    stop()
    onError(webglAvailable() ? error : new Error('WebGL is turned off in this browser, and MediaPipe needs it to read camera frames'))
  }

  // One frame in flight at a time: a slow device processes fewer frames
  // instead of queueing stale ones.
  const tick = () => {
    if (stopped) return
    animationFrame = requestAnimationFrame(tick)
    if (busy || document.hidden || video.readyState < 2 || video.currentTime === lastVideoTime) return
    lastVideoTime = video.currentTime
    busy = true
    const timestamp = performance.now()
    backend.detect(video, timestamp)
      .then(result => { if (!stopped) handle(result, timestamp) }, recover)
      .catch(error => console.error('Vision frame handling failed', error))
      .finally(() => { busy = false })
  }

  animationFrame = requestAnimationFrame(tick)

  return {
    stop,
    analyzeImages: images => backend.analyzeImages(images),
    calibrate({ durationMs = 2000, onProgress = () => {} } = {}) {
      calibration?.reject(new Error('Calibration restarted'))
      return new Promise((resolve, reject) => {
        if (stopped) { reject(new Error('Camera stopped')); return }
        calibration = { session: createCalibrationSession({ durationMs }), onProgress, resolve, reject }
      })
    },
  }
}
