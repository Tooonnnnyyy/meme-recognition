// Figma prototypes, tested through Figma's Embed API. The prototype runs in a
// cross-origin frame, so the recorder cannot see its page. Instead the embed
// posts events to this page: which frame is showing, and each mouse press with
// whether it hit a hotspot. Events reach only the origins registered for the
// study's client ID in Figma.

export const FIGMA_ORIGIN = 'https://www.figma.com'
const EMBED = 'https://embed.figma.com'
const FIGMA_HOSTS = ['figma.com', 'www.figma.com', 'embed.figma.com']

export const isFileKey = value => typeof value === 'string' && /^[A-Za-z0-9]{10,64}$/.test(value)
export const isNodeId = value => typeof value === 'string' && /^\d+:\d+$/.test(value)
export const isClientId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value)

// '12-34', '12:34' and '12%3A34' (as links write a node) all give '12:34'.
export function toNodeId(raw) {
  if (raw == null) return null
  let text = String(raw).trim()
  try { text = decodeURIComponent(text) } catch { return null }
  const id = text.replace('-', ':')
  return isNodeId(id) ? id : null
}

// A prototype or design link: figma.com/proto/<file>/<name>?node-id=1-2.
// Returns { fileKey, name, nodeId, startNodeId } or null. A bare node id
// ('12:34' or '12-34') gives { nodeId } alone.
export function parseFigmaLink(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  const bare = toNodeId(raw)
  if (bare) return { nodeId: bare }
  let url
  try { url = new URL(raw) } catch { return null }
  if (url.protocol !== 'https:' || !FIGMA_HOSTS.includes(url.hostname)) return null
  const [, kind, fileKey, name] = url.pathname.split('/')
  if (!['proto', 'design', 'file'].includes(kind) || !isFileKey(fileKey)) return null
  return { fileKey, name: name ? decodeURIComponent(name) : 'Prototype', nodeId: toNodeId(url.searchParams.get('node-id')), startNodeId: toNodeId(url.searchParams.get('starting-point-node-id')) }
}

// The embed address for a prototype opened at nodeId. Hotspot hints are off,
// so a missed click is not answered by Figma flashing the hotspots, which
// would give the answer away.
export function embedUrl({ fileKey, name, clientId }, nodeId) {
  const params = new URLSearchParams({ 'embed-host': 'usability-copilot', 'hide-ui': '1', 'hotspot-hints': '0', scaling: 'scale-down' })
  if (clientId) params.set('client-id', clientId)
  if (nodeId) {
    params.set('node-id', nodeId.replace(':', '-'))
    params.set('starting-point-node-id', nodeId)
  }
  return `${EMBED}/proto/${fileKey}/${encodeURIComponent(name || 'Prototype')}?${params}`
}

// Turns embed messages into recorder actions. Figma reports a press and its
// release alike, the release repeating the press's node and position, so a
// repeat within RELEASE_MS is folded into its press: if either was on a
// hotspot, the click was handled.
const RELEASE_MS = 600
export function figmaTranslator() {
  let last = null
  return (message, t) => {
    if (!message || typeof message.type !== 'string') return null
    const data = message.data && typeof message.data === 'object' ? message.data : {}
    if (message.type === 'INITIAL_LOAD') return { type: 'ready' }
    if (message.type === 'PRESENTED_NODE_CHANGED') {
      const page = toNodeId(data.presentedNodeId)
      return page && { type: 'navigate', page }
    }
    if (message.type !== 'MOUSE_PRESS_OR_RELEASE') return null
    const node = toNodeId(data.targetNodeId) || String(data.targetNodeId ?? '').slice(0, 40)
    const position = data.nearestScrollingFrameMousePosition || data.targetNodeMousePosition || {}
    const x = Math.round(Number(position.x) || 0)
    const y = Math.round(Number(position.y) || 0)
    const handled = typeof data.handled === 'boolean' ? data.handled : null
    if (last && last.node === node && last.x === x && last.y === y && t - last.t < RELEASE_MS) {
      last = null
      return { type: 'release', handled }
    }
    last = { node, x, y, t }
    return { type: 'click', x, y, target: { selector: `figma:${node}`, label: '', interactive: handled === true, formField: false, aoi: null, handled } }
  }
}
