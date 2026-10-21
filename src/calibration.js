const median = values => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length >> 1
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

// Collapses neutral-face samples into one resting baseline. The median ignores
// the few frames where the user blinks or twitches during calibration.
export function summarizeBaseline(samples) {
  const scalar = key => median(samples.map(sample => sample[key]))
  const names = [...new Set(samples.flatMap(sample => Object.keys(sample.blendshapes || {})))]
  return {
    mouthOpen: scalar('mouthOpen'),
    blinkLeft: scalar('blinkLeft'),
    blinkRight: scalar('blinkRight'),
    tongue: scalar('tongue'),
    roll: scalar('roll'),
    blendshapes: Object.fromEntries(names.map(name => [name, median(samples.map(sample => sample.blendshapes?.[name] || 0))])),
    samples: samples.length,
  }
}

// Records `durationMs` of frames. Each add() returns progress (0–1) and, once
// time is up, either the baseline or an error when too few frames had a face.
export function createCalibrationSession({ durationMs = 2000, minSamples = 8 } = {}) {
  let startedAt = null
  const samples = []
  return {
    add(signals, timestamp) {
      if (startedAt === null) startedAt = timestamp
      if (signals) samples.push(signals)
      const progress = Math.min(1, (timestamp - startedAt) / durationMs)
      if (progress < 1) return { progress }
      if (samples.length < minSamples) return { progress, error: 'No steady face found · face the camera and try again' }
      return { progress, baseline: summarizeBaseline(samples) }
    },
  }
}
