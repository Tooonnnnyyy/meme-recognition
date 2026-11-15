// Small-sample statistics for usability metrics, after Sauro & Lewis,
// "Quantifying the User Experience" (2nd ed., 2016). Usability tests often have
// 5–10 participants, so every estimate comes with a 95% interval that shows
// how little a small sample pins down.

// Two-tailed 95% t critical values for 1–30 degrees of freedom, then the
// usual table rows beyond, interpolated in 1/df (exact to about 0.001).
const T95 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042]
const T95_TAIL = [[30, 2.042], [40, 2.021], [60, 2], [120, 1.98], [Infinity, 1.96]]
export function tCritical(df) {
  if (!(df >= 1)) return null
  if (df <= 30) return T95[Math.floor(df) - 1]
  const upper = T95_TAIL.findIndex(([at]) => df <= at)
  const [[d0, t0], [d1, t1]] = [T95_TAIL[upper - 1], T95_TAIL[upper]]
  const share = (1 / d0 - 1 / df) / (1 / d0 - 1 / d1)
  return Math.round((t0 + (t1 - t0) * share) * 1000) / 1000
}

const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length
const sd = values => {
  const average = mean(values)
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1))
}

// Completion rate with the adjusted Wald interval, which stays sensible at
// 0/5 or 5/5, where the plain Wald interval collapses to a point.
export function completion(successes, n, z = 1.96) {
  if (!n) return null
  const adjusted = (successes + z * z / 2) / (n + z * z)
  const margin = z * Math.sqrt(adjusted * (1 - adjusted) / (n + z * z))
  return { rate: successes / n, low: Math.max(0, adjusted - margin), high: Math.min(1, adjusted + margin), successes, n }
}

// Mean with a t interval (rating scales such as SEQ and SUS). With one value
// there is no interval.
export function meanInterval(values, { min = -Infinity, max = Infinity } = {}) {
  if (!values.length) return null
  const average = mean(values)
  if (values.length < 2) return { mean: average, low: null, high: null, n: 1 }
  // All values equal: the sample shows no spread, so no interval can be
  // estimated (a zero-width interval would claim false certainty).
  if (sd(values) === 0) return { mean: average, low: null, high: null, n: values.length, noSpread: true }
  const margin = tCritical(values.length - 1) * sd(values) / Math.sqrt(values.length)
  return { mean: average, low: Math.max(min, average - margin), high: Math.min(max, average + margin), n: values.length }
}

// Task times are skewed (a few slow attempts), so the geometric mean is the
// better middle for small samples, with the interval taken on the logs.
export function timeInterval(milliseconds) {
  const values = milliseconds.filter(value => value > 0)
  if (!values.length) return null
  const logs = values.map(Math.log)
  const center = Math.exp(mean(logs))
  if (values.length < 2) return { geo: center, low: null, high: null, n: 1 }
  if (sd(logs) === 0) return { geo: center, low: null, high: null, n: values.length, noSpread: true }
  const margin = tCritical(values.length - 1) * sd(logs) / Math.sqrt(values.length)
  return { geo: center, low: Math.exp(mean(logs) - margin), high: Math.exp(mean(logs) + margin), n: values.length }
}
