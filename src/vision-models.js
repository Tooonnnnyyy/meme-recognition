import { FaceLandmarker, FilesetResolver, GestureRecognizer, PoseLandmarker } from '@mediapipe/tasks-vision'

// Loads and runs the three MediaPipe tasks. Used inside the background worker
// and, when a worker is unavailable, directly on the main thread.

const CONFIDENCE = 0.45

const taskOptions = (modelBase, delegate) => ({
  gesture: {
    baseOptions: { modelAssetPath: `${modelBase}gesture_recognizer.task`, delegate },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: CONFIDENCE,
    minHandPresenceConfidence: CONFIDENCE,
    minTrackingConfidence: CONFIDENCE,
    cannedGesturesClassifierOptions: { scoreThreshold: CONFIDENCE },
  },
  face: {
    baseOptions: { modelAssetPath: `${modelBase}face_landmarker.task`, delegate },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
    minFaceDetectionConfidence: CONFIDENCE,
    minFacePresenceConfidence: CONFIDENCE,
    minTrackingConfidence: CONFIDENCE,
  },
  pose: {
    baseOptions: { modelAssetPath: `${modelBase}pose_landmarker_lite.task`, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: CONFIDENCE,
    minPosePresenceConfidence: CONFIDENCE,
    minTrackingConfidence: CONFIDENCE,
  },
})

async function createTasks(fileset, modelBase, delegate) {
  const options = taskOptions(modelBase, delegate)
  const settled = await Promise.allSettled([
    GestureRecognizer.createFromOptions(fileset, options.gesture),
    FaceLandmarker.createFromOptions(fileset, options.face),
    PoseLandmarker.createFromOptions(fileset, options.pose),
  ])
  const failure = settled.find(item => item.status === 'rejected')
  if (failure) {
    settled.forEach(item => item.status === 'fulfilled' && item.value.close())
    throw failure.reason
  }
  const [gesture, face, pose] = settled.map(item => item.value)
  return { gesture, face, pose }
}

const closeTasks = tasks => tasks && Object.values(tasks).forEach(task => task.close())

// WebGL emulated on the CPU (SwiftShader, llvmpipe: virtual machines, remote
// desktops, blocklisted GPUs) makes the GPU delegate several times slower than
// the CPU one. Returns the renderer name when that is the case.
function softwareRenderer() {
  try {
    const canvas = typeof OffscreenCanvas === 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(1, 1)
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!gl) return 'no WebGL'
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render/i.test(renderer) ? renderer : null
  } catch {
    return null
  }
}

function blankFrame() {
  const canvas = typeof OffscreenCanvas === 'undefined' ? Object.assign(document.createElement('canvas'), { width: 64, height: 64 }) : new OffscreenCanvas(64, 64)
  canvas.getContext('2d').fillRect(0, 0, 64, 64)
  return canvas
}

// Copies results into plain objects so they survive postMessage unchanged.
function runTasks(tasks, image, timestamp) {
  const hand = tasks.gesture.recognizeForVideo(image, timestamp)
  const face = tasks.face.detectForVideo(image, timestamp)
  const pose = tasks.pose.detectForVideo(image, timestamp)
  return {
    hand: { landmarks: hand.landmarks, worldLandmarks: hand.worldLandmarks, handedness: hand.handedness, gestures: hand.gestures },
    face: { faceLandmarks: face.faceLandmarks, faceBlendshapes: face.faceBlendshapes },
    pose: { landmarks: pose.landmarks, worldLandmarks: pose.worldLandmarks },
  }
}

// MediaPipe clears self.ModuleFactory after building each task and expects its
// loader script to set it again. A classic <script> re-runs every time, but an
// ES-module import runs only once, so inside the worker any later task (the
// CPU fallback, the image analyzer) would fail with "ModuleFactory not set".
// Load the factory once and pin it to the worker scope.
async function pinModuleFactory(loaderUrl) {
  const { default: factory } = await import(/* @vite-ignore */ loaderUrl)
  Object.defineProperty(self, 'ModuleFactory', { configurable: true, get: () => factory, set: () => {} })
}

// delegate: 'auto' tries the GPU first (faster on real graphics hardware) and
// uses the CPU when WebGL is only emulated, or when the GPU cannot create the
// tasks or fails on a warm-up frame.
export async function loadVisionModels({ wasmBase, modelBase, moduleLoader = false, delegate = 'auto', onStatus = () => {} }) {
  const fileset = await FilesetResolver.forVisionTasks(wasmBase, moduleLoader)
  if (moduleLoader) await pinModuleFactory(fileset.wasmLoaderPath)
  let tasks = null
  let active = null
  let lastTimestamp = 0

  const open = async preferred => {
    const emulated = preferred === 'auto' && softwareRenderer()
    if (emulated) onStatus(`No hardware GPU (${emulated}) · loading the CPU version…`)
    const order = preferred === 'auto' ? (emulated ? ['CPU'] : ['GPU', 'CPU']) : [preferred]
    let lastError
    for (const candidate of order) {
      let created = null
      try {
        created = await createTasks(fileset, modelBase, candidate)
        // A GPU can create tasks and still fail on its first frame, so prove it
        // works before committing to it.
        if (candidate === 'GPU') {
          lastTimestamp += 1
          runTasks(created, blankFrame(), lastTimestamp)
        }
        tasks = created
        active = candidate
        return
      } catch (error) {
        closeTasks(created)
        lastError = error
        if (candidate === 'GPU' && order.includes('CPU')) onStatus('GPU unavailable · loading the CPU version…')
      }
    }
    throw lastError
  }

  const close = () => {
    closeTasks(tasks)
    tasks = null
  }

  const createAnalyzer = async delegateName => FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${modelBase}face_landmarker.task`, delegate: delegateName },
    runningMode: 'IMAGE',
    numFaces: 1,
    outputFaceBlendshapes: true,
    minFaceDetectionConfidence: 0.3,
    minFacePresenceConfidence: 0.3,
  })

  await open(delegate)

  return {
    get delegate() { return active },
    async detect(image, timestamp) {
      // VIDEO mode requires strictly increasing timestamps.
      lastTimestamp = Math.max(timestamp, lastTimestamp + 1)
      try {
        return runTasks(tasks, image, lastTimestamp)
      } catch (error) {
        if (active !== 'GPU') throw error
        onStatus('GPU inference failed · switching to CPU…')
        close()
        await open('CPU')
        lastTimestamp += 1
        return runTasks(tasks, image, lastTimestamp)
      }
    },
    // Reads blendshapes from still images (meme references) with a separate
    // IMAGE-mode landmarker so live VIDEO tracking is not disturbed.
    async analyzeImages(images) {
      const analyzer = await createAnalyzer(active).catch(() => createAnalyzer('CPU'))
      try {
        const results = []
        for (const { id, url } of images) {
          try {
            const response = await fetch(url)
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const bitmap = await createImageBitmap(await response.blob())
            const found = analyzer.detect(bitmap).faceBlendshapes?.[0]?.categories
            bitmap.close()
            results.push({ id, categories: found ? found.map(({ categoryName, score }) => ({ categoryName, score })) : null })
          } catch (error) {
            results.push({ id, categories: null, error: error.message })
          }
        }
        return results
      } finally {
        analyzer.close()
      }
    },
    close,
  }
}
