import { classifyVision, createVisionGate } from './vision-rules'

export async function createVisionEngine(video, { onFrame, onStatus, onAction }) {
  const { FilesetResolver, FaceLandmarker, GestureRecognizer, PoseLandmarker } = await import('@mediapipe/tasks-vision')
  onStatus('Loading on-device vision models…')
  const vision = await FilesetResolver.forVisionTasks('/vision/wasm')
  // CPU is intentionally selected: it is available in ordinary Chrome profiles
  // and does not depend on a separate WebGL configuration or cloud service.
  const common = { baseOptions: { delegate: 'CPU' }, runningMode: 'VIDEO' }
  const [gesture, face, pose] = await Promise.all([
    GestureRecognizer.createFromOptions(vision, {
      ...common,
      baseOptions: { ...common.baseOptions, modelAssetPath: '/vision/gesture_recognizer.task' },
      numHands: 2,
      minHandDetectionConfidence: 0.45,
      minHandPresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
      cannedGesturesClassifierOptions: { scoreThreshold: 0.45 },
    }),
    FaceLandmarker.createFromOptions(vision, {
      ...common,
      baseOptions: { ...common.baseOptions, modelAssetPath: '/vision/face_landmarker.task' },
      numFaces: 1,
      outputFaceBlendshapes: true,
      minFaceDetectionConfidence: 0.45,
      minFacePresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    }),
    PoseLandmarker.createFromOptions(vision, {
      ...common,
      baseOptions: { ...common.baseOptions, modelAssetPath: '/vision/pose_landmarker_lite.task' },
      numPoses: 1,
      minPoseDetectionConfidence: 0.45,
      minPosePresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    }),
  ])

  let animationFrame = 0
  let lastVideoTime = -1
  let lastRun = 0
  let stopped = false
  const gate = createVisionGate()

  const stop = () => {
    stopped = true
    cancelAnimationFrame(animationFrame)
    gesture.close()
    face.close()
    pose.close()
  }

  const tick = now => {
    if (stopped) return
    if (!document.hidden && video.readyState >= 2 && video.currentTime !== lastVideoTime && now - lastRun >= 75) {
      lastVideoTime = video.currentTime
      lastRun = now
      const handResult = gesture.recognizeForVideo(video, now)
      const faceResult = face.detectForVideo(video, now)
      const poseResult = pose.detectForVideo(video, now)
      const candidate = classifyVision({ handResult, faceResult, poseResult })
      onFrame({ handResult, faceResult, poseResult, candidate })
      const fired = gate(candidate.id, now)
      if (fired) onAction(fired, candidate.score)
    }
    animationFrame = requestAnimationFrame(tick)
  }

  onStatus('Vision ready · look at the camera and hold an action')
  animationFrame = requestAnimationFrame(tick)
  return { stop }
}
