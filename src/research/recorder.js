import { FIGMA_ORIGIN, figmaTranslator } from './figma.js'

// Builds the session file while a participant works through the tasks. It
// watches the test page inside a same-origin iframe: clicks, page changes,
// form changes, scrolling and DOM updates, plus gaze and face numbers from the
// camera. A Figma prototype is watched through the events its embed posts
// instead (see figma.js). No images or video are stored.

const round = value => Math.round(value)
const round3 = value => Math.round(value * 1000) / 1000
// The median Calibration.jsx takes its baseline with.
const median = values => [...values].sort((a, b) => a - b)[values.length >> 1]
const BASELINE_FRAMES = 30

// A page's path under the study's site root, without .html: 'orders',
// 'cart/index'. The review screen loads `${siteBase}${page}.html` to replay it.
export function pageId(href, rootPath = '/') {
  const path = new URL(href).pathname
  const inside = path.startsWith(rootPath) ? path.slice(rootPath.length) : path.split('/').pop()
  return (inside === '' || inside.endsWith('/') ? `${inside}index.html` : inside).replace(/\.html$/, '')
}

// Inputs that are buttons: their value is the caption the page set.
const isButtonInput = node => node.tagName === 'INPUT' && /^(submit|button|reset|image)$/i.test(node.getAttribute('type'))
const isField = node => (/^(INPUT|SELECT|TEXTAREA)$/.test(node.tagName) && !isButtonInput(node)) || Boolean(node.isContentEditable)
const clean = text => (text || '').trim().replace(/\s+/g, ' ').slice(0, 60)
// Hidden parts of a control (a closed suggestion list, a screen-reader copy)
// can hold an echo of what was typed, and are not what the participant saw.
const isHidden = node => {
  if (node.hidden || node.getAttribute?.('aria-hidden') === 'true' || /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/.test(node.tagName)) return true
  const style = node.ownerDocument?.defaultView?.getComputedStyle?.(node)
  if (!style) return false
  if (style.display === 'none' || style.visibility === 'hidden') return true
  // Screen-reader-only text: clipped to a pixel or moved off screen.
  const box = node.getBoundingClientRect()
  return (box.width <= 1 && box.height <= 1) || box.right <= 0 || box.bottom <= 0
}
// An element's visible text without the fields and editable areas inside it,
// whose text is what the participant typed.
const textOf = node => [...node.childNodes].map(child => child.nodeType === 3 ? child.textContent : child.nodeType === 1 && !isField(child) && !isHidden(child) ? textOf(child) : '').join(' ')

// What a field is called, never what it holds: its value is what the
// participant typed or chose.
function fieldLabel(node) {
  const label = node.labels?.[0]
  return clean(node.getAttribute('aria-label') || clean(label && textOf(label)) || node.getAttribute('placeholder') || node.getAttribute('name') || node.getAttribute('type') || node.tagName.toLowerCase())
}

const INTERACTIVE = 'a, button, input, select, textarea, label, summary, [role="button"], [data-track]'
const selectorOf = node => node.tagName.toLowerCase() + (node.id ? `#${node.id}` : '') + [...node.classList].map(name => `.${name}`).join('')

// Controls are named by their text. Other elements are named only by
// aria-label: their text may echo what was typed (a new list item, a search).
function controlLabel(node, interactive) {
  if (isButtonInput(node)) return clean(node.getAttribute('aria-label') || node.value || node.getAttribute('alt') || node.getAttribute('type'))
  return clean(node.getAttribute('aria-label') || (interactive ? textOf(node) : ''))
}

export function describeTarget(element, doc) {
  const interactive = element.closest(INTERACTIVE)
  const node = interactive || element
  if (node === doc.body || node === doc.documentElement) return { selector: 'body', label: '', interactive: false, formField: false, aoi: null }
  const formField = isField(node)
  const label = formField ? fieldLabel(node) : controlLabel(node, Boolean(interactive))
  // A label's press changes the field it labels, which answers the press.
  const controls = node.tagName === 'LABEL' && node.control ? { controls: selectorOf(node.control) } : {}
  return { selector: selectorOf(node), label, interactive: Boolean(interactive), formField, aoi: node.closest('[data-aoi]')?.dataset.aoi || null, ...controls }
}

// Areas inside a position: fixed element stay put on screen as the page
// scrolls, so they are kept in viewport coordinates and flagged.
const isFixed = (element, win) => {
  for (let node = element; node && node.nodeType === 1; node = node.parentElement) if (win.getComputedStyle(node).position === 'fixed') return true
  return false
}

export function createRecorder({ study, participant }) {
  const origin = performance.now()
  const now = () => round(performance.now() - origin)
  const session = {
    version: 1,
    study: study.kind === 'figma'
      ? { id: study.id, kind: 'figma', title: study.title, figma: { fileKey: study.figma.fileKey, name: study.figma.name, clientId: study.figma.clientId } }
      : { id: study.id, title: study.title, siteBase: study.siteBase },
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
  let clicked = false
  // A cross-origin Figma frame: its scroll position cannot be read.
  let crossOrigin = false
  const kept = {}
  // A throttled event is folded into the last kept one of its type, which
  // records its time as `last`, so the end of a burst of input is not lost.
  const push = (type, data = {}, throttleMs = 0) => {
    const t = now()
    const taskId = task?.id ?? null
    const previous = kept[type]
    if (throttleMs && previous && previous.taskId === taskId && t - previous.t < throttleMs) { previous.last = t; return null }
    kept[type] = { type, t, taskId, ...data }
    session.events.push(kept[type])
    return kept[type]
  }

  // Call on every iframe load: records the page and wires up its listeners.
  const attachFrame = iframe => {
    detach()
    crossOrigin = false
    frame = iframe
    const win = iframe.contentWindow
    const doc = iframe.contentDocument
    if (!win || !doc) return
    page = pageId(win.location.href, new URL(study.siteBase, document.baseURI).pathname)
    session.viewport = { width: iframe.clientWidth, height: iframe.clientHeight }
    session.aois[page] = [...doc.querySelectorAll('[data-aoi]')].map(element => {
      const rect = element.getBoundingClientRect()
      const fixed = isFixed(element, win)
      const [x, y] = fixed ? [rect.left, rect.top] : [rect.left + win.scrollX, rect.top + win.scrollY]
      // Edges are rounded, not sizes, so a child flush with its container's
      // edge does not stick out of it by a pixel.
      const [left, top] = [round(x), round(y)]
      return { id: element.dataset.aoi, rect: { x: left, y: top, width: round(x + rect.width) - left, height: round(y + rect.height) - top }, ...(fixed && { fixed: true }) }
    })
    push('navigate', { page })
    // pointerdown, not click: disabled buttons swallow click events, and a
    // press on a disabled button is exactly the friction we want to see.
    const onPointer = event => {
      if (event.button !== 0) return
      push('click', { page, x: round(event.pageX), y: round(event.pageY), target: describeTarget(event.target, doc) })
      clicked = true
    }
    const onActivity = () => push('activity', {}, 1000)
    const onScroll = () => { push('scroll', { page, x: round(win.scrollX), y: round(win.scrollY) }, 250); onActivity() }
    // The selector shows which field changed: pressing a button blurs the
    // field typed in before, whose change is not the button's response.
    const onChange = event => push('change', { selector: selectorOf(event.target) })
    // The selector (built as for clicks) shows whether focus went to the
    // clicked element itself.
    const onFocus = event => push('focus', { selector: selectorOf(event.target.closest(INTERACTIVE) || event.target) })
    // The first DOM change after a click, even in the same millisecond, is
    // never throttled away: it may be the click's only response.
    const observer = new MutationObserver(() => {
      push('mutation', {}, clicked ? 0 : 100)
      clicked = false
    })
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

  // Call when a task opens the Figma embed in iframe. onPage(page) is called
  // with each frame shown, so the caller can see the task's goal reached.
  const attachFigma = (iframe, { onPage } = {}) => {
    detach()
    crossOrigin = true
    frame = iframe
    session.viewport = { width: iframe.clientWidth, height: iframe.clientHeight }
    session.quality.figmaEvents ??= 0
    const translate = figmaTranslator()
    let lastClick = null
    const onMessage = event => {
      if (event.origin !== FIGMA_ORIGIN || event.source !== iframe.contentWindow) return
      const action = translate(event.data, now())
      if (!action) return
      session.quality.figmaEvents += 1
      if (action.type === 'navigate') {
        page = action.page
        session.aois[page] ??= []
        push('navigate', { page })
        onPage?.(page)
      } else if (action.type === 'click' && page) {
        lastClick = push('click', { page, x: action.x, y: action.y, target: action.target })
      } else if (action.type === 'release' && lastClick && action.handled) {
        lastClick.target.handled = true
        lastClick.target.interactive = true
      }
    }
    addEventListener('message', onMessage)
    detach = () => removeEventListener('message', onMessage)
  }

  // Gaze arrives in viewport pixels of the whole app; keep only points that
  // land on the test page, converted to its document coordinates, with the
  // scroll offset so areas on fixed elements can be matched in the viewport.
  const recordGaze = point => {
    if (!task || !frame?.contentWindow || !page) return
    const rect = frame.getBoundingClientRect()
    if (point.x < rect.left || point.x > rect.right || point.y < rect.top || point.y > rect.bottom) return
    const [sx, sy] = crossOrigin ? [0, 0] : [frame.contentWindow.scrollX, frame.contentWindow.scrollY]
    session.gaze.push({ t: now(), page, x: round(point.x - rect.left + sx), y: round(point.y - rect.top + sy), sx: round(sx), sy: round(sy) })
  }

  // With no baseline from calibration (skipped, or too few face frames), the
  // first task frames give it, so brow and lean signals still work.
  const early = []
  const recordFace = sample => {
    if (!task) return
    session.quality.frames += 1
    if (!sample) return
    session.quality.faceFrames += 1
    const face = { t: now(), brow: round3(sample.brow), scale: round3(sample.scale) }
    session.face.push(face)
    if (session.baseline || early.push(face) < BASELINE_FRAMES) return
    session.baseline = { brow: median(early.map(item => item.brow)), scale: median(early.map(item => item.scale)), from: 'tasks' }
  }

  return {
    session,
    now,
    attachFrame,
    attachFigma,
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
