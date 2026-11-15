import { isClientId, isFileKey, isNodeId } from './figma.js'
import { TextError, isLang } from '../i18n/index.js'

// A Figma study travels in the participant link (?study=...), so nothing has
// to be hosted or stored: the researcher builds it on the setup screen.

// What a link can carry. The Lab's Plan tab applies the same limits to
// unmoderated studies (studyModel.limitsFor).
export const LINK_LIMITS = { tasks: 10, limitSec: 1800 }
const MAX_TASKS = LINK_LIMITS.tasks
export const POST_IDS = ['sus', 'umux-lite', 'none']
const isText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max
const optionalNode = value => value == null || isNodeId(value)
const optionalText = (value, max) => value == null || isText(value, max)

// The questionnaires a runtime study asks: the SEQ after each task, and one
// post-test form (or none). Links made before the setting travelled have
// none, and keep the old behaviour: SEQ and SUS.
export function runtimeQuestionnaire(study) {
  const q = study && typeof study.questionnaire === 'object' && study.questionnaire ? study.questionnaire : {}
  return { seq: q.seq !== false, post: POST_IDS.includes(q.post) ? q.post : 'sus' }
}

// Who the participant sends the results file to, from the consent fields;
// null when the researcher typed neither.
export function runtimeContact(study) {
  const c = study && typeof study.contact === 'object' && study.contact ? study.contact : {}
  const clean = value => (typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : null)
  const researcher = clean(c.researcher)
  const contact = clean(c.contact)
  return researcher || contact ? { researcher, contact } : null
}

// Throws a TextError (its message is the English text) when the study is not
// usable, so a screen can show it in the reader's language.
export function checkStudy(study) {
  if (!study || typeof study !== 'object') throw new TextError('researcher.link.empty')
  if (study.kind !== 'figma') throw new TextError('researcher.link.notFigma')
  if (!isText(study.title, 120)) throw new TextError('researcher.link.title')
  const { figma } = study
  if (!figma || !isFileKey(figma.fileKey) || !isText(figma.name, 200) || !optionalNode(figma.startNodeId)) throw new TextError('researcher.link.prototype')
  if (!isClientId(figma.clientId)) throw new TextError('researcher.link.clientId')
  if (!Array.isArray(study.tasks) || !study.tasks.length || study.tasks.length > MAX_TASKS) throw new TextError('researcher.link.taskCount', { max: MAX_TASKS })
  study.tasks.forEach((task, index) => {
    if (task.id !== `T${index + 1}`) throw new TextError('researcher.link.taskId', { number: index + 1 })
    if (!isText(task.prompt, 300)) throw new TextError('researcher.link.taskPrompt', { number: index + 1 })
    if (!optionalNode(task.start) || !optionalNode(task.successPage)) throw new TextError('researcher.link.taskFrame', { number: index + 1 })
    if (!Number.isInteger(task.limitSec) || task.limitSec < 30 || task.limitSec > LINK_LIMITS.limitSec) throw new TextError('researcher.link.taskLimit', { number: index + 1 })
  })
  const q = study.questionnaire
  if (q != null && (typeof q !== 'object' || (q.seq != null && typeof q.seq !== 'boolean') || (q.post != null && !POST_IDS.includes(q.post)))) throw new TextError('researcher.link.questionnaire')
  const c = study.contact
  if (c != null && (typeof c !== 'object' || !optionalText(c.researcher, 200) || !optionalText(c.contact, 200))) throw new TextError('researcher.link.contact')
  return study
}

// A short FNV-1a hash of the study's title and tasks.
function fingerprint(study) {
  const text = JSON.stringify([study.title.trim(), study.tasks.map(task => [task.prompt.trim(), task.start || null, task.successPage || null, task.limitSec])])
  let hash = 0x811c9dc5
  for (const char of text) hash = Math.imul(hash ^ char.codePointAt(0), 0x01000193) >>> 0
  return hash.toString(36)
}

// Only the fields a study uses are kept, so a link carries nothing else.
const pick = study => ({
  // Two studies on one Figma file get different ids (title and tasks are
  // part of the id), so the report can tell them apart.
  id: `figma-${study.figma.fileKey}-${fingerprint(study)}`,
  kind: 'figma',
  lang: isLang(study.lang) ? study.lang : 'en',
  title: study.title.trim(),
  figma: { fileKey: study.figma.fileKey, name: study.figma.name, startNodeId: study.figma.startNodeId || null, clientId: study.figma.clientId },
  tasks: study.tasks.map(task => ({ id: task.id, prompt: task.prompt.trim(), start: task.start || null, successPage: task.successPage || null, limitSec: task.limitSec })),
  questionnaire: runtimeQuestionnaire(study),
  ...(runtimeContact(study) ? { contact: runtimeContact(study) } : {}),
})

const toBase64Url = text => btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromBase64Url = text => new TextDecoder().decode(Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0)))

export const encodeStudy = study => toBase64Url(JSON.stringify(pick(checkStudy(study))))

export function decodeStudy(param) {
  let data
  try { data = JSON.parse(fromBase64Url(param)) } catch { throw new TextError('researcher.link.damaged') }
  return pick(checkStudy(data))
}

export const studyLink = (study, base = location.origin + location.pathname) => `${base}?study=${encodeStudy(study)}`

// The Lab's demo-shop study runs the built-in tasks, so its link carries only
// the options: the language, the questionnaires (when they differ from SEQ
// and SUS) and who to send the results file to.
export function demoLink(study, base) {
  const url = new URL(base)
  url.search = ''
  url.searchParams.set('lang', isLang(study.lang) ? study.lang : 'en')
  const q = runtimeQuestionnaire(study)
  if (!q.seq) url.searchParams.set('seq', '0')
  if (q.post !== 'sus') url.searchParams.set('post', q.post)
  const contact = runtimeContact(study)
  if (contact?.researcher) url.searchParams.set('researcher', contact.researcher)
  if (contact?.contact) url.searchParams.set('contact', contact.contact)
  return url.href
}

// The options of a demo link (see demoLink), with defaults for anything
// missing or not understood.
export function demoOptions(search) {
  const params = new URLSearchParams(search)
  const lang = params.get('lang')
  return {
    lang: isLang(lang) ? lang : null,
    questionnaire: runtimeQuestionnaire({ questionnaire: { seq: params.get('seq') !== '0', post: params.get('post') } }),
    contact: runtimeContact({ contact: { researcher: params.get('researcher'), contact: params.get('contact') } }),
  }
}
