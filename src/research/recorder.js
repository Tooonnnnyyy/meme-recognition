// Builds the session file while a participant works through the tasks. It
// watches the test page inside a same-origin iframe: clicks, page changes,
// form changes, scrolling and DOM updates, plus gaze and face numbers from the
// camera. No images or video are stored.

const round = value => Math.round(value)
const round3 = value => Math.round(value * 1000) / 1000

export const pageId = href => (new URL(href).pathname.split('/').pop() || 'index.html').replace(/\.html$/, '')

function describeTarget(element, doc) {
  const interactive = element.closest('a, button, input, select, textarea, label, [role="button"], [data-track]')
  const node = interactive || element
  if (node === doc.body || node === doc.documentElement) return { selector: 'body', label: '', interactive: false, formField: false, aoi: null }
  const label = (node.getAttribute('aria-label') || node.innerText || node.value || '').trim().replace(/\s+/g, ' ').slice(0, 60)
  const selector = node.tagName.toLowerCase() + (node.id ? `#${node.id}` : '') + [...node.classList].map(name => `.${name}`).join('')
  return { selector, label, interactive: Boolean(interactive), formField: /^(INPUT|SELECT|TEXTAREA)$/.test(node.tagName), aoi: node.closest('[data-aoi]')?.dataset.aoi || null }
}

export function createRecorder({ study, participant }) {
  const origin = performance.now()
  const now = () => round(performance.now() - origin)
  const session = {
    version: 1,
    study: { id: study.id, title: study.title, siteBase: study.siteBase },
    participant,
    startedAt: new Date().toISOString(),
    viewport: null,
    quality: { gazeEnabled: false, accuracy: null, frames: 0, faceFrames: 0, driftChecks: [] },
    baseline: null,
    tasks: [],
    events: [],
    gaze: [],
    face: [],
    aois: {},
  }
  let task = null
  let page = null
  let frame = null
  let detach = () => {}
  const lastAt = {}
  const push = (type, data = {}, throttleMs = 0) => {
    const t = now()
    if (throttleMs && t - (lastAt[type] ?? -Infinity) < throttleMs) return
    lastAt[type] = t
    session.events.push({ type, t, taskId: task?.id ?? null, ...data })
  }

  // Call on every iframe load: records the page and wires up its listeners.
  const attachFrame = iframe => {
    detach()
    frame = iframe
    const win = iframe.contentWindow
    const doc = iframe.contentDocument
    if (!win || !doc) return
    page = pageId(win.location.href)
    session.viewport = { width: iframe.clientWidth, height: iframe.clientHeight }
    session.aois[page] = [...doc.querySelectorAll('[data-aoi]')].map(element => {
      const rect = element.getBoundingClientRect()
      return { id: element.dataset.aoi, rect: { x: round(rect.left + win.scrollX), y: round(rect.top + win.scrollY), width: round(rect.width), height: round(rect.height) } }
    })
    push('navigate', { page })
    // pointerdown, not click: disabled buttons swallow click events, and a
    // press on a disabled button is exactly the friction we want to see.
    const onPointer = event => { if (event.button === 0) push('click', { page, x: round(event.pageX), y: round(event.pageY), target: describeTarget(event.target, doc) }) }
    const onActivity = () => push('activity', {}, 1000)
    const onScroll = () => { push('scroll', { page, x: round(win.scrollX), y: round(win.scrollY) }, 250); onActivity() }
    const onChange = () => push('change')
    const onFocus = () => push('focus')
    const observer = new MutationObserver(() => push('mutation', {}, 100))
    doc.addEventListener('pointerdown', onPointer, true)
    doc.addEventListener('mousemove', onActivity, true)
    doc.addEventListener('keydown', onActivity, true)
    doc.addEventListener('change', onChange, true)
    doc.addEventListener('focusin', onFocus, true)
    win.addEventListener('scroll', onScroll)
    observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true })
    detach = () => {
      observer.disconnect()
      doc.removeEventListener('pointerdown', onPointer, true)
      doc.removeEventListener('mousemove', onActivity, true)
      doc.removeEventListener('keydown', onActivity, true)
      doc.removeEventListener('change', onChange, true)
      doc.removeEventListener('focusin', onFocus, true)
      win.removeEventListener('scroll', onScroll)
    }
    return page
  }

  // Gaze arrives in viewport pixels of the whole app; keep only points that
  // land on the test page, converted to its document coordinates.
  const recordGaze = point => {
    if (!task || !frame?.contentWindow || !page) return
    const rect = frame.getBoundingClientRect()
    if (point.x < rect.left || point.x > rect.right || point.y < rect.top || point.y > rect.bottom) return
    const win = frame.contentWindow
    session.gaze.push({ t: now(), page, x: round(point.x - rect.left + win.scrollX), y: round(point.y - rect.top + win.scrollY) })
  }

  const recordFace = sample => {
    if (!task) return
    session.quality.frames += 1
    if (!sample) return
    session.quality.faceFrames += 1
    session.face.push({ t: now(), brow: round3(sample.brow), scale: round3(sample.scale) })
  }

  return {
    session,
    now,
    attachFrame,
    recordGaze,
    recordFace,
    startTask(definition) {
      task = { id: definition.id, prompt: definition.prompt, start: now(), end: null, outcome: null }
      session.tasks.push(task)
    },
    endTask(outcome) {
      if (!task) return
      task.end = now()
      task.outcome = outcome
      task = null
    },
    get currentPage() { return page },
    stop() { detach() },
  }
}
