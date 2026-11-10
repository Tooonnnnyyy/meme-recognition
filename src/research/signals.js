import { aoiHit, boxGap, detectFixations } from './fixations.js'

// Friction signals and "candidate moments" computed from a recorded session.
// Everything here is a pure function of the session file, so a session can be
// re-scored later with new thresholds and tested without a browser.
//
// Session times are milliseconds since the session started. Events:
//   click     { t, taskId, page, x, y, target: { selector, label, interactive, formField, aoi, controls? } }
//             controls: for a <label>, the selector of the field it labels
//   mutation  { t, taskId }            the page changed (DOM mutation)
//   change    { t, taskId, selector }  a form value changed (radio, checkbox, select, text)
//   focus     { t, taskId, selector }  an element took focus
//   scroll    { t, taskId, page, x, y } scroll position, for replay
//   navigate  { t, taskId, page }
//   activity  { t, taskId }            mouse move, key press or scroll
// Throttled events (mutation, scroll, activity) carry `last`, the time of the
// last event folded into them, when there was one.
// gaze: [{ t, page, x, y, sx, sy }] in page document coordinates, with the
// scroll offset at that moment
// aois: { [page]: [{ id, rect, fixed? }] }, rects in document coordinates, or in
// viewport coordinates when fixed
// face: [{ t, brow, scale }]; baseline: { brow, scale } from calibration, or
// from the first task frames ({ ..., from: 'tasks' }) when calibration gave none

export const STRONG = 'strong'
export const MEDIUM = 'medium'
export const WEAK = 'weak'

// Starting thresholds from industry definitions (Sprig, 2025) and the plan;
// pilot data should replace them.
export const DEFAULTS = {
  deadClickMs: 3500,
  rageClicks: 4,
  rageWindowMs: 2000,
  rageRadiusPx: 60,
  pageVisits: 3,
  idleMs: 8000,
  searchWindowMs: 10000,
  searchTransitions: 6,
  browDelta: 0.15,
  leanRatio: 1.15,
  faceMinMs: 2000,
  aoiMarginPx: 40,
}

const taskAt = (tasks, t) => tasks.find(task => t >= task.start && t <= (task.end ?? Infinity))?.id || null

const RESPONSES = ['mutation', 'change', 'navigate', 'focus']

function deadClicks(session, settings) {
  // In time order. The sort is stable, so events recorded in one millisecond
  // keep their order: a DOM change in the press's own millisecond follows it.
  const events = [...session.events].sort((a, b) => a.t - b.t)
  const signals = []
  events.forEach((click, index) => {
    // Form fields answer clicks natively (a select opens, a caret appears), a
    // click on the empty page background expects nothing, and a click between
    // tasks belongs to none.
    if (click.type !== 'click' || click.taskId == null || click.target?.selector === 'body' || click.target?.formField) return
    const selector = click.target?.selector
    // Selectors are not unique (three 'View details' links share one), so the
    // same element means the same selector and label, pressed close by.
    const same = other => other.target?.selector === selector && other.target?.label === click.target?.label && Math.hypot(other.x - click.x, other.y - click.y) <= settings.rageRadiusPx
    // A change counts only on the clicked field or the one a clicked label
    // controls: pressing a button also fires the change of the field typed in
    // before. Older files have no change selector.
    const ownChange = event => !event.selector || event.selector === selector || event.selector === click.target?.controls
    // The window for a response closes at the next click on another element,
    // since what follows may be that click's doing. Pressing the same element
    // again leaves it open: a dead element stays dead because it never
    // answers. A button or link taking focus on its own press is no response.
    let closes = click.t + settings.deadClickMs
    let answered = false
    for (let later = index + 1; later < events.length && events[later].t < closes; later += 1) {
      const event = events[later]
      if (event.type === 'click' && !same(event)) { closes = event.t; break }
      if (!RESPONSES.includes(event.type) || (event.type === 'focus' && event.selector === selector) || (event.type === 'change' && !ownChange(event))) continue
      answered = true
      break
    }
    if (answered) return
    // The task ended before the window closed, so there is nothing to judge.
    const task = session.tasks.find(item => item.id === click.taskId)
    if (task?.end != null && task.end < closes) return
    const previous = signals[signals.length - 1]
    if (previous && previous.taskId === click.taskId && previous.detail.selector === selector && previous.detail.label === click.target?.label && click.t - previous.end < 10000) {
      previous.end = click.t
      previous.count += 1
    } else {
      signals.push({ kind: 'dead-click', strength: STRONG, taskId: click.taskId, start: click.t, end: click.t, count: 1, detail: { selector, label: click.target?.label, aoi: click.target?.aoi || null } })
    }
  })
  return signals
}

function rageClicks(session, settings) {
  const signals = []
  const clicks = session.events.filter(event => event.type === 'click' && event.taskId != null)
  let index = 0
  while (index < clicks.length) {
    const first = clicks[index]
    const burst = clicks.slice(index).filter(click => click.taskId === first.taskId && click.t - first.t <= settings.rageWindowMs && Math.hypot(click.x - first.x, click.y - first.y) <= settings.rageRadiusPx)
    if (burst.length >= settings.rageClicks) {
      signals.push({ kind: 'rage-click', strength: STRONG, taskId: first.taskId, start: first.t, end: burst[burst.length - 1].t, count: burst.length, detail: { label: first.target?.label, aoi: first.target?.aoi || null } })
      index = clicks.indexOf(burst[burst.length - 1]) + 1
    } else index += 1
  }
  return signals
}

function pageLoops(session, settings) {
  const signals = []
  session.tasks.forEach(task => {
    const visits = new Map()
    const open = new Map()
    session.events.filter(event => event.type === 'navigate' && event.taskId === task.id).forEach(event => {
      const count = (visits.get(event.page) || 0) + 1
      visits.set(event.page, count)
      if (count === settings.pageVisits) {
        const signal = { kind: 'page-loop', strength: STRONG, taskId: task.id, start: event.t, end: event.t, count, detail: { page: event.page } }
        open.set(event.page, signal)
        signals.push(signal)
      } else if (count > settings.pageVisits) {
        open.get(event.page).count = count
        open.get(event.page).end = event.t
      }
    })
  })
  return signals
}

function timeouts(session) {
  return session.tasks.filter(task => task.outcome === 'timeout').map(task => ({ kind: 'timeout', strength: STRONG, taskId: task.id, start: Math.max(task.start, task.end - 5000), end: task.end, count: 1, detail: {} }))
}

function idlePeriods(session, settings) {
  const signals = []
  session.tasks.forEach(task => {
    // `last` is the end of a throttled burst of input, so idle starts there.
    const times = [task.start, ...session.events.filter(event => event.taskId === task.id && ['click', 'activity', 'navigate', 'focus', 'change', 'scroll'].includes(event.type)).flatMap(event => [event.t, event.last ?? event.t]), task.end ?? task.start]
    times.sort((a, b) => a - b)
    for (let index = 1; index < times.length; index += 1) {
      if (times[index] - times[index - 1] >= settings.idleMs) signals.push({ kind: 'idle', strength: MEDIUM, taskId: task.id, start: times[index - 1], end: times[index], count: 1, detail: { seconds: Math.round((times[index] - times[index - 1]) / 1000) } })
    }
  })
  return signals
}

// Many jumps between areas with no click in between: looking for something
// that is not where the participant expects it. A jump counts only between
// areas further apart than the gaze error (the AOI margin): gaze resting near
// the border of two adjacent or nested areas flips between them by noise.
function visualSearch(session, settings, fixations) {
  const signals = []
  const clicks = session.events.filter(event => event.type === 'click')
  const margin = aoiMargin(session, settings)
  const jump = (a, b) => a.aoi !== b.aoi && (!a.box || !b.box || boxGap(a.box, b.box) > margin)
  session.tasks.forEach(task => {
    const inTask = fixations.filter(fixation => fixation.taskId === task.id && fixation.aoi)
    let index = 0
    while (index < inTask.length) {
      const first = inTask[index]
      const window = inTask.slice(index).filter(fixation => fixation.start - first.start <= settings.searchWindowMs)
      const transitions = window.slice(1).filter((fixation, offset) => jump(window[offset], fixation)).length
      const end = window[window.length - 1].end
      const clicked = clicks.some(click => click.t >= first.start && click.t <= end)
      if (transitions >= settings.searchTransitions && !clicked) {
        signals.push({ kind: 'visual-search', strength: MEDIUM, taskId: task.id, start: first.start, end, count: transitions, detail: { areas: new Set(window.map(fixation => fixation.aoi)).size } })
        index += window.length
      } else index += 1
    }
  })
  return signals
}

// Continuous stretches (gaps under 500 ms) where the predicate holds for at
// least minMs.
function runs(samples, predicate, minMs) {
  const result = []
  let start = null
  let last = null
  const close = () => {
    if (start !== null && last - start >= minMs) result.push({ start, end: last })
    start = null
  }
  samples.forEach(sample => {
    if (!predicate(sample)) { close(); return }
    if (start !== null && sample.t - last > 500) close()
    if (start === null) start = sample.t
    last = sample.t
  })
  close()
  return result
}

function faceSignals(session, settings) {
  const baseline = session.baseline
  if (!baseline || !session.face?.length) return []
  const brow = runs(session.face, sample => sample.brow - baseline.brow >= settings.browDelta, settings.faceMinMs)
    .map(run => ({ kind: 'brow-lowered', strength: WEAK, taskId: taskAt(session.tasks, run.start), ...run, count: 1, detail: { seconds: Math.round((run.end - run.start) / 100) / 10 } }))
  const lean = runs(session.face, sample => sample.scale >= baseline.scale * settings.leanRatio, settings.faceMinMs)
    .map(run => ({ kind: 'lean-in', strength: WEAK, taskId: taskAt(session.tasks, run.start), ...run, count: 1, detail: { seconds: Math.round((run.end - run.start) / 100) / 10 } }))
  return [...brow, ...lean].filter(signal => signal.taskId)
}

// Areas grow by the measured gaze error, and at least by aoiMarginPx.
const aoiMargin = (session, settings) => Math.max(settings.aoiMarginPx, session.quality?.accuracy?.meanPx || 0)

// Fixations per page, labelled with their task and area of interest (aoi, and
// its box in page coordinates), in time order across pages.
export function sessionFixations(session, settings = DEFAULTS) {
  if (!session.quality?.gazeEnabled || !session.gaze?.length) return []
  const margin = aoiMargin(session, settings)
  const pages = [...new Set(session.gaze.map(point => point.page))]
  return pages.flatMap(page => detectFixations(session.gaze.filter(point => point.page === page)).map(fixation => {
    const hit = aoiHit(fixation, session.aois?.[page] || [], margin)
    return { ...fixation, page, taskId: taskAt(session.tasks, fixation.start), aoi: hit?.id || null, box: hit && { x: hit.x, y: hit.y, right: hit.right, bottom: hit.bottom } }
  })).sort((a, b) => a.start - b.start)
}

export function detectSignals(session, overrides = {}) {
  const settings = { ...DEFAULTS, ...overrides }
  const fixations = sessionFixations(session, settings)
  return [
    ...deadClicks(session, settings),
    ...rageClicks(session, settings),
    ...pageLoops(session, settings),
    ...timeouts(session),
    ...idlePeriods(session, settings),
    ...visualSearch(session, settings, fixations),
    ...faceSignals(session, settings),
  ].sort((a, b) => a.start - b.start)
}

// A strong signal opens a candidate on its own; a medium one needs a weak one
// within pairWindowMs. Overlapping windows in the same task merge, and every
// signal inside a window is kept as evidence.
//
// Reviews are stored by candidate id, so the id comes from the strongest
// signal that opened the moment (task, kind, start), not from its position:
// re-scoring with other thresholds keeps the ids of moments that remain. Ids
// are unique because each opener lies inside its own window and windows in a
// task do not overlap.
export function findCandidates(signals, { padMs = 2000, pairWindowMs = 5000 } = {}) {
  const windows = []
  const weak = signals.filter(signal => signal.strength === WEAK)
  signals.forEach(signal => {
    if (signal.strength === STRONG) windows.push({ taskId: signal.taskId, start: signal.start - padMs, end: signal.end + padMs, anchor: signal })
    if (signal.strength !== MEDIUM) return
    const partner = weak.find(item => item.taskId === signal.taskId && item.start <= signal.end + pairWindowMs && item.end >= signal.start - pairWindowMs)
    if (partner) windows.push({ taskId: signal.taskId, start: Math.min(signal.start, partner.start) - padMs, end: Math.max(signal.end, partner.end) + padMs, anchor: signal })
  })
  windows.sort((a, b) => (a.taskId === b.taskId ? a.start - b.start : String(a.taskId).localeCompare(String(b.taskId))))
  const merged = []
  windows.forEach(window => {
    const previous = merged[merged.length - 1]
    if (previous && previous.taskId === window.taskId && window.start <= previous.end) {
      previous.end = Math.max(previous.end, window.end)
      if (window.anchor.strength === STRONG && previous.anchor.strength !== STRONG) previous.anchor = window.anchor
    } else merged.push({ ...window, start: Math.max(0, window.start) })
  })
  return merged
    .map(({ anchor, ...window }) => {
      const evidence = signals.filter(signal => signal.taskId === window.taskId && signal.start <= window.end && signal.end >= window.start)
      const strong = evidence.filter(signal => signal.strength === STRONG).length
      const confidence = strong >= 2 || (strong === 1 && evidence.length > 1) ? 'high' : strong === 1 ? 'medium' : 'low'
      return { id: `${window.taskId}-${anchor.kind}-${anchor.start}`, ...window, signals: evidence, confidence }
    })
    .sort((a, b) => a.start - b.start)
}

// Plain-language evidence for one signal, as shown to the researcher.
// Where a click landed: the control's label, else its area of interest.
const clickPlace = detail => detail.label ? ` on “${detail.label}”` : detail.aoi ? ` in the ${detail.aoi} area` : ''

export function describeSignal(signal) {
  const times = signal.count > 1 ? ` ×${signal.count}` : ''
  switch (signal.kind) {
    case 'dead-click': return `No response to a click${times}${clickPlace(signal.detail)}`
    case 'rage-click': return `${signal.count} rapid clicks${clickPlace(signal.detail)}`
    case 'page-loop': return `Returned to ${signal.detail.page} ${signal.count - 1} times`
    case 'timeout': return 'Ran out of time on the task'
    case 'idle': return `No input for ${signal.detail.seconds} s`
    case 'visual-search': return `Looked across ${signal.detail.areas} areas (${signal.count} jumps) without clicking`
    case 'brow-lowered': return `Brow lowered for ${signal.detail.seconds} s`
    case 'lean-in': return `Leaned towards the screen for ${signal.detail.seconds} s`
    default: return signal.kind
  }
}
