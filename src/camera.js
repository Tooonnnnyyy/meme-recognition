import { interpret, neutral, createGate } from './controls'
export function createCamera(video, onUpdate, onAction) {
  let stream, recognizer, frame, generation = 0, lastTime = -1, lastRun = 0
  let center = { x: .5, y: .5 }, latestHand, gate = createGate()
  function stop() {
    generation++; cancelAnimationFrame(frame)
    stream?.getTracks().forEach(t => t.stop()); stream = null
    video.pause(); video.srcObject = null
    recognizer?.close(); recognizer = null; latestHand = null
    gate = createGate(); onUpdate(neutral(), 'Camera off')
  }
  async function start() {
    stop(); const id = generation
    onUpdate(neutral(), 'Requesting camera…')
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera requires HTTPS or localhost.')
      const acquired = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false })
      if (id !== generation) { acquired.getTracks().forEach(t => t.stop()); return }
      stream = acquired; video.srcObject = stream; await video.play()
      onUpdate(neutral(), 'Loading hand model…')
      const { FilesetResolver, GestureRecognizer } = await import('@mediapipe/tasks-vision')
      const vision = await FilesetResolver.forVisionTasks('/vision/wasm')
      const model = await GestureRecognizer.createFromOptions(vision, { baseOptions: { modelAssetPath: '/vision/gesture_recognizer.task', delegate: 'CPU' }, runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: .6, minTrackingConfidence: .6 })
      if (id !== generation) { model.close(); return }
      recognizer = model; lastTime = -1
      function tick(now) {
        if (id !== generation) return
        try {
          if (!document.hidden && video.readyState >= 2 && now-lastRun>65 && video.currentTime !== lastTime) {
            lastTime=video.currentTime; lastRun=now
            const result = recognizer.recognizeForVideo(video,now)
            latestHand = result.landmarks?.[0]
            const control = interpret(result,center)
            onUpdate(control,'Camera live · processed on this device')
            const action=gate(control.action,now); if(action) onAction(action)
          }
          frame=requestAnimationFrame(tick)
        } catch (error) { stop(); onUpdate(neutral(),`Tracking stopped: ${error.message}`) }
      }
      frame=requestAnimationFrame(tick)
    } catch(error) {
      if(id !== generation) return
      stop(); onUpdate(neutral(),error.name==='NotAllowedError' ? 'Camera permission denied. Keyboard controls still work.' : `Camera unavailable: ${error.message}`)
    }
  }
  return { start, stop, calibrate() { if (!latestHand) return false; center={x:1-latestHand[9].x,y:latestHand[9].y}; return true } }
}
