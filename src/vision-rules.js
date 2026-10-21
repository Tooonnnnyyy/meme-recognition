const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0))

const clamp = value => Math.max(0, Math.min(1, value))

function categoryScore(categories, names) {
  const wanted = names.map(name => name.toLowerCase())
  const category = categories?.find(item => wanted.includes(String(item.categoryName || '').toLowerCase()))
  return category?.score || 0
}

// Raw 0–1 face signals before any per-user calibration. Roll is signed so a
// calibrated resting head tilt can be subtracted.
function faceSignals(faceResult) {
  const face = faceResult?.faceLandmarks?.[0]
  if (!face) return null

  const blendshapes = faceResult.faceBlendshapes?.[0]?.categories || []
  const height = Math.max(distance(face[10], face[152]), 0.001)
  const mouthOpenGeometry = distance(face[13], face[14]) / height
  const leftEye = distance(face[159], face[145]) / Math.max(distance(face[33], face[133]), 0.001)
  const rightEye = distance(face[386], face[374]) / Math.max(distance(face[362], face[263]), 0.001)
  const jawOpen = categoryScore(blendshapes, ['jawOpen', 'jaw_open'])
  const blinkLeft = categoryScore(blendshapes, ['eyeBlinkLeft', 'eye_blink_left'])
  const blinkRight = categoryScore(blendshapes, ['eyeBlinkRight', 'eye_blink_right'])
  const tongue = categoryScore(blendshapes, ['tongueOut', 'tongue_out'])
  const leftEyeCenter = { x: (face[33].x + face[133].x) / 2, y: (face[33].y + face[133].y) / 2 }
  const rightEyeCenter = { x: (face[362].x + face[263].x) / 2, y: (face[362].y + face[263].y) / 2 }

  return {
    face,
    blendshapes,
    mouthOpen: Math.max(jawOpen, clamp((mouthOpenGeometry - 0.035) / 0.12)),
    blinkLeft: Math.max(blinkLeft, clamp((0.19 - leftEye) / 0.15)),
    blinkRight: Math.max(blinkRight, clamp((0.19 - rightEye) / 0.15)),
    tongue,
    roll: Math.atan2(rightEyeCenter.y - leftEyeCenter.y, rightEyeCenter.x - leftEyeCenter.x),
  }
}

// Re-scales a signal so the user's calibrated resting value reads as 0.
const aboveRest = (value, rest = 0) => (rest >= 0.9 ? value : clamp((value - rest) / (1 - rest)))

function faceMetrics(faceResult, baseline) {
  const signals = faceSignals(faceResult)
  if (!signals) return null
  const { face } = signals
  return {
    face,
    nose: face[1] || face[4],
    mouthOpen: aboveRest(signals.mouthOpen, baseline?.mouthOpen),
    blinkLeft: aboveRest(signals.blinkLeft, baseline?.blinkLeft),
    blinkRight: aboveRest(signals.blinkRight, baseline?.blinkRight),
    tongue: aboveRest(signals.tongue, baseline?.tongue),
    roll: Math.abs(signals.roll - (baseline?.roll || 0)),
  }
}

// The neutral-face sample recorded during calibration.
export function calibrationSignals({ faceResult }) {
  const signals = faceSignals(faceResult)
  if (!signals) return null
  const { mouthOpen, blinkLeft, blinkRight, tongue, roll, blendshapes } = signals
  return { mouthOpen, blinkLeft, blinkRight, tongue, roll, blendshapes: Object.fromEntries(blendshapes.map(item => [item.categoryName, item.score])) }
}

function handScore(result, name) {
  return (result?.gestures || []).reduce((best, categories) => Math.max(best, categoryScore(categories, [name])), 0)
}

function isHeartHands(hands) {
  if (!hands || hands.length < 2) return 0
  const [a, b] = hands
  const palm = Math.max(distance(a[0], a[9]), distance(b[0], b[9]), 0.001)
  const indexTips = distance(a[8], b[8]) / palm
  const thumbTips = distance(a[4], b[4]) / palm
  const palmsSideBySide = Math.abs(a[9].y - b[9].y) < palm * 1.7
  if (!palmsSideBySide) return 0
  return clamp((0.72 - indexTips) / 0.72) * 0.55 + clamp((0.9 - thumbTips) / 0.9) * 0.45
}

function coverNose(hands, nose) {
  if (!nose || !hands?.length) return 0
  return hands.reduce((best, hand) => {
    const palm = distance(hand[9], nose)
    const index = distance(hand[8], nose)
    const wrist = distance(hand[0], nose)
    const score = Math.max(clamp((0.23 - palm) / 0.18), clamp((0.18 - index) / 0.14), clamp((0.35 - wrist) / 0.25) * 0.7)
    return Math.max(best, score)
  }, 0)
}

function thinkPose(hands, face) {
  if (!face?.face || !hands?.length) return 0
  const temples = [face.face[127], face.face[356]].filter(Boolean)
  return hands.reduce((best, hand) => {
    if (!hand[8] || !hand[6]) return best
    const extended = distance(hand[8], hand[0]) > distance(hand[6], hand[0]) * 1.12
    const nearTemple = Math.min(...temples.map(temple => distance(hand[8], temple)))
    return Math.max(best, extended ? clamp((0.25 - nearTemple) / 0.18) : 0)
  }, 0)
}

// Pose landmarks outside the frame are still returned, at guessed positions,
// with a low visibility score (~0.3–0.5 for hidden wrists, ~0.8+ for visible
// ones). Ignore those so a head-and-shoulders close-up cannot imply a raised
// hand or hands on the head.
const visible = landmark => Boolean(landmark) && (landmark.visibility === undefined || landmark.visibility >= 0.65)

function poseScores(poseResult, face) {
  const pose = poseResult?.landmarks?.[0]
  if (!pose) return { handsHead: 0, handUp: 0 }
  const nose = visible(pose[0]) ? pose[0] : face?.nose
  const shoulders = [pose[11], pose[12]].filter(visible)
  const wrists = [pose[15], pose[16]].filter(visible)
  if (!nose || shoulders.length < 2 || wrists.length < 1) return { handsHead: 0, handUp: 0 }
  const shoulderY = (shoulders[0].y + shoulders[1].y) / 2
  const raised = wrists.filter(wrist => wrist.y < shoulderY - 0.06).length
  const headHands = wrists.filter(wrist => wrist.y < nose.y + 0.13 && Math.abs(wrist.x - nose.x) < 0.42).length
  return {
    handsHead: wrists.length >= 2 && headHands >= 2 ? clamp((headHands - 1) / 1) : 0,
    handUp: raised ? clamp(0.55 + raised * 0.2) : 0,
  }
}

export function classifyVision({ handResult, faceResult, poseResult }, { baseline = null } = {}) {
  const hands = handResult?.landmarks || []
  const face = faceMetrics(faceResult, baseline)
  const pose = poseScores(poseResult, face)
  const candidates = [
    { id: 'hands_head', score: pose.handsHead },
    { id: 'cover_nose', score: coverNose(hands, face?.nose) },
    { id: 'heart_hands', score: isHeartHands(hands) },
    { id: 'wink_tilt', score: Math.max(thinkPose(hands, face), face ? Math.max(face.blinkLeft, face.blinkRight) * (1 - Math.min(face.blinkLeft, face.blinkRight)) * clamp((face.roll - 0.045) / 0.11) : 0) },
    { id: 'thumbs_up', score: handScore(handResult, 'Thumb_Up') },
    { id: 'open_palm', score: handScore(handResult, 'Open_Palm') },
    { id: 'hand_up', score: pose.handUp },
    { id: 'tongue_out', score: face?.tongue || 0 },
    { id: 'open_mouth', score: face?.mouthOpen || 0 },
    { id: 'eyes_closed', score: face ? Math.min(face.blinkLeft, face.blinkRight) : 0 },
  ]
  const candidate = candidates.sort((a, b) => b.score - a.score)[0]
  return candidate && candidate.score >= 0.52 ? candidate : { id: null, score: 0 }
}

// stableMs keeps the required hold time the same when the frame rate changes:
// three frames last ~230 ms at 13 FPS but only ~100 ms at 30 FPS.
export function createVisionGate({ stableFrames = 3, stableMs = 0, cooldownMs = 1200 } = {}) {
  let candidate = null
  let frames = 0
  let since = 0
  let armed = true
  let lastFired = -Infinity
  return (nextId, now = performance.now()) => {
    if (!nextId) {
      candidate = null
      frames = 0
      armed = true
      return null
    }
    if (nextId !== candidate) {
      candidate = nextId
      frames = 1
      since = now
    } else frames += 1
    if (armed && frames >= stableFrames && now - since >= stableMs && now - lastFired >= cooldownMs) {
      armed = false
      lastFired = now
      return nextId
    }
    return null
  }
}
