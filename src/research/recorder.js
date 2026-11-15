import { FIGMA_ORIGIN, figmaTranslator } from './figma.js'
import { areasAt } from './fixations.js'
import { isSeq, susScore, umuxLiteScore } from './questionnaire.js'
import { isLang } from '../i18n/index.js'
import { runtimeQuestionnaire } from './studyLink.js'

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
  // Screen-reader-only text: clipped to a pixel or moved off the page. The box
  // is put back where it sits with nothing scrolled, so a part only scrolled
  // out of view, in the page or in a scroll pane, still names the control.
  const box = node.getBoundingClientRect()
  if (box.width <= 1 && box.height <= 1) return true
  let [right, bottom] = [box.right, box.bottom]
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    right += parent.scrollLeft || 0
    bottom += parent.scrollTop || 0
  }
  return right <= 0 || bottom <= 0
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

// The page's areas of interest as laid out now, in the page's coordinates.
// An area hidden now has no box (its rect is all zeros, at the page's top
// left corner), and an empty one has no area to look at: both are left out
// until they show, or they would win every nearby fixation as the smallest.
function measureAreas(doc, win) {
  return [...doc.querySelectorAll('[data-aoi]')].flatMap(element => {
    const rect = element.getBoundingClientRect()
    if (!(rect.width > 0 && rect.height > 0) || win.getComputedStyle(element).visibility === 'hidden') return []
    const fixed = isFixed(element, win)
    const [x, y] = fixed ? [rect.left, rect.top] : [rect.left + win.scrollX, rect.top + win.scrollY]
    // Edges are rounded, not sizes, so a child flush with its container's
    // edge does not stick out of it by a pixel.
    const [left, top] = [round(x), round(y)]
    return [{ id: element.dataset.aoi, rect: { x: left, y: top, width: round(x + rect.width) - left, height: round(y + rect.height) - top }, ...(fixed && { fixed: true }) }]
  })
}

// Brings a page's stored areas up to date with layout, measured at time t.
// An area that moved or went away gets `to: t`; one that appeared or moved
// is added with `from: t`; one unchanged keeps its entry. Areas measured on
// the page's first load have neither, so older files read the same way.
const sameArea = (a, b) => a.id === b.id && Boolean(a.fixed) === Boolean(b.fixed) && ['x', 'y', 'width', 'height'].every(key => a.rect[key] === b.rect[key])
function updateAreas(stored, layout, t) {
  if (!stored) return layout
  const fresh = [...layout]
  areasAt(stored, t).forEach(area => {
    const index = fresh.findIndex(item => sameArea(item, area))
    if (index >= 0) fresh.splice(index, 1)
    else area.to = t
  })
  return [...stored, ...fresh.map(area => ({ ...area, from: t }))]
}

// A press on an element's own scrollbar scrolls it: it is input, not a click.
// Inline elements (no client box) have no scrollbars; the page's own
// scrollbar is beyond the root's client box.
function onScrollbar(node, event, win) {
  if (!(node.clientWidth > 0 && node.clientHeight > 0)) return false
  if (node === node.ownerDocument.documentElement) return event.clientX >= node.clientWidth || event.clientY >= node.clientHeight
  const style = win.getComputedStyle(node)
  const border = side => parseFloat(style[`border${side}Width`]) || 0
  const barWidth = node.offsetWidth - node.clientWidth - border('Left') - border('Right')
  const barHeight = node.offsetHeight - node.clientHeight - border('Top') - border('Bottom')
  return (barWidth > 2 && (event.offsetX >= node.clientWidth || event.offsetX < 0)) || (barHeight > 2 && event.offsetY >= node.clientHeight)
}

// Whether a followed link opens a new tab or window rather than this frame.
function opensTab(link, event, doc) {
  const target = (link.getAttribute('target') ?? doc.querySelector('base[target]')?.getAttribute('target') ?? '').toLowerCase()
  return event.ctrlKey || event.metaKey || event.shiftKey || !['', '_self', '_parent', '_top'].includes(target)
}

// The element a link to `fragment` on this page jumps to (by id, or an
// <a name>), as the browser finds it, or null.
function jumpTarget(fragment, doc) {
  if (!fragment) return null
  const named = name => doc.getElementById(name) || [...doc.getElementsByName(name)].find(node => node.tagName === 'A') || null
  try { return named(fragment) || named(decodeURIComponent(fragment)) } catch { return named(fragment) }
}

// Whether outer is inner or holds it.
const holds = (outer, inner) => {
  for (let node = inner; node; node = node.parentElement) if (node === outer) return true
  return false
}

export function createRecorder({ study, participant }) {
  const origin = performance.now()
  const now = () => round(performance.now() - origin)
  const session = {
    version: 1,
    // The questionnaires the study asked go with the file, so a report made
    // from files alone knows whether a SUS was asked.
    study: {
      ...(study.kind === 'figma'
        ? { id: study.id, kind: 'figma', title: study.title, figma: { fileKey: study.figma.fileKey, name: study.figma.name, clientId: study.figma.clientId } }
        : study.kind === 'observed' ? { id: study.id, kind: 'observed', title: study.title } : { id: study.id, title: study.title, siteBase: study.siteBase }),
      questionnaire: runtimeQuestionnaire(study),
    },
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
    // The interface languages the questionnaires were answered in, so the
    // report can tell when language versions of a scale were mixed.
    questionnaireLangs: [],
  }
  const answeredIn = lang => { if (isLang(lang) && !session.questionnaireLangs.includes(lang)) session.questionnaireLangs.push(lang) }
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
    const here = pageId(win.location.href, new URL(study.siteBase, document.baseURI).pathname)
    page = here
    session.viewport = { width: iframe.clientWidth, height: iframe.clientHeight }
    // Areas are measured on load, and again once the layout settles after it
    // changes (DOM changes, a pane scrolled, a resize, an animation ending, a
    // late image), from the time the change began, so a fixation is matched
    // with the areas on screen at its time.
    session.aois[here] = updateAreas(session.aois[here], measureAreas(doc, win), now())
    let changedAt = null
    let measuring = null
    const remeasure = () => {
      if (measuring) return
      changedAt = now()
      measuring = setTimeout(() => {
        measuring = null
        session.aois[here] = updateAreas(session.aois[here], measureAreas(doc, win), changedAt)
      }, 300)
    }
    push('navigate', { page })
    // The element last pressed: focus that lands on it or on a container
    // holding it (a tabindex wrapper, a dialog) is the press's own doing.
    let pressed = null
    // pointerdown, not click: disabled buttons swallow click events, and a
    // press on a disabled button is exactly the friction we want to see.
    const onPointer = event => {
      if (event.button !== 0) return
      if (onScrollbar(event.target, event, win)) { onActivity(); return }
      pressed = event.target
      push('click', { page, x: round(event.pageX), y: round(event.pageY), target: describeTarget(event.target, doc) })
      clicked = true
    }
    const onActivity = () => push('activity', {}, 1000)
    const onScroll = () => { push('scroll', { page, x: round(win.scrollX), y: round(win.scrollY) }, 250); onActivity() }
    // Scrolling inside a pane: its scroll event does not reach the window,
    // and wheel turns move no mouse, but both are input.
    const onPaneScroll = event => {
      if (event.target === doc) return
      onActivity()
      remeasure()
    }
    // A link the browser follows without loading this frame again (no
    // 'navigate'): a jump to a place on this page, or a new tab. A jump to a
    // named place counts even when the page scrolls there itself (default
    // prevented). '#' and '#top' jump to the top, which shows only on a
    // scrolled page: a placeholder href="#" on a page at its top does nothing.
    const onFollow = event => {
      if (event.button !== 0) return
      const link = event.target.closest?.('a[href], area[href]')
      if (!link || typeof link.href !== 'string') return
      if (opensTab(link, event, doc)) {
        if (!event.defaultPrevented) push('new-tab', { page })
        return
      }
      const [address, ...rest] = link.href.split('#')
      if (!rest.length || address !== win.location.href.split('#')[0]) return
      const fragment = rest.join('#')
      const toTop = !event.defaultPrevented && (fragment === '' || fragment.toLowerCase() === 'top') && (win.scrollX > 0 || win.scrollY > 0)
      if (jumpTarget(fragment, doc) || toTop) push('fragment', { page })
    }
    // The selector shows which field changed: pressing a button blurs the
    // field typed in before, whose change is not the button's response.
    const onChange = event => push('change', { selector: selectorOf(event.target) })
    // The selector (built as for clicks) shows whether focus went to the
    // clicked element itself; own, that the press put it there.
    const onFocus = event => push('focus', { selector: selectorOf(event.target.closest(INTERACTIVE) || event.target), ...(pressed && holds(event.target, pressed) && { own: true }) })
    // The first DOM change after a click, even in the same millisecond, is
    // never throttled away: it may be the click's only response.
    const observer = new MutationObserver(() => {
      push('mutation', {}, clicked ? 0 : 100)
      clicked = false
      remeasure()
    })
    doc.addEventListener('pointerdown', onPointer, true)
    doc.addEventListener('mousemove', onActivity, true)
    doc.addEventListener('keydown', onActivity, true)
    doc.addEventListener('wheel', onActivity, { capture: true, passive: true })
    doc.addEventListener('change', onChange, true)
    doc.addEventListener('focusin', onFocus, true)
    doc.addEventListener('scroll', onPaneScroll, true)
    ;['transitionend', 'animationend', 'load'].forEach(type => doc.addEventListener(type, remeasure, true))
    win.addEventListener('scroll', onScroll)
    win.addEventListener('resize', remeasure)
    win.addEventListener('click', onFollow)
    observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true })
    detach = () => {
      observer.disconnect()
      clearTimeout(measuring)
      doc.removeEventListener('pointerdown', onPointer, true)
      doc.removeEventListener('mousemove', onActivity, true)
      doc.removeEventListener('keydown', onActivity, true)
      doc.removeEventListener('wheel', onActivity, true)
      doc.removeEventListener('change', onChange, true)
      doc.removeEventListener('focusin', onFocus, true)
      doc.removeEventListener('scroll', onPaneScroll, true)
      ;['transitionend', 'animationend', 'load'].forEach(type => doc.removeEventListener(type, remeasure, true))
      win.removeEventListener('scroll', onScroll)
      win.removeEventListener('resize', remeasure)
      win.removeEventListener('click', onFollow)
    }
    return page
  }

  // Call when a task opens the Figma embed in iframe. onPage(page) is called
  // with each frame shown, so the caller can see the task's goal reached, and
  // onReady() once, when the prototype first answers: the running task records
  // that time as `ready`, so time on task leaves out Figma's loading time.
  const attachFigma = (iframe, { onPage, onReady } = {}) => {
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
      if (task && task.ready == null && ['ready', 'navigate'].includes(action.type)) {
        task.ready = now()
        onReady?.()
      }
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
    // The Single Ease Question for the task just ended, 1–7, or null if skipped.
    // lang is the interface language the question was shown in.
    rateTask(value, lang) {
      const last = session.tasks.at(-1)
      if (last && last.end != null) last.seq = isSeq(value) ? value : null
      if (isSeq(value)) answeredIn(lang)
    },
    // The ten SUS answers (1–5 each), or null if skipped.
    setSus(answers, lang) {
      const score = susScore(answers)
      session.sus = score == null ? null : { answers: [...answers], score }
      if (score != null) answeredIn(lang)
    },
    // The two UMUX-Lite answers (1–7 each), or null if skipped.
    setUmuxLite(answers, lang) {
      const score = umuxLiteScore(answers)
      session.umuxLite = score && { answers: [...answers], ...score }
      if (score) answeredIn(lang)
    },
    // A moderator's note, stamped with the time and the running (or last) task.
    // Between tasks the console passes the upcoming task's id as taskId.
    // #words in the text become tags, which group notes across participants.
    addNote(kind, text, taskId) {
      const clean = text.trim()
      if (!clean) return null
      const tags = [...new Set((clean.match(/#[\p{L}\p{N}_-]+/gu) || []).map(tag => tag.slice(1).toLowerCase()))]
      const note = { t: now(), taskId: task?.id ?? taskId ?? session.tasks.at(-1)?.id ?? null, kind, text: clean.replace(/\s*#[\p{L}\p{N}_-]+/gu, '').trim() || clean, tags }
      session.notes ??= []
      session.notes.push(note)
      return note
    },
    removeNote(note) {
      session.notes = (session.notes || []).filter(item => item !== note)
    },
    get currentPage() { return page },
    stop() { detach() },
  }
}
