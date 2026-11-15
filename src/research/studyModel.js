import { isClientId, isFileKey, isNodeId } from './figma.js'
import { DEMO_STUDY, demoTasks } from './study.js'
import { LINK_LIMITS, runtimeContact, runtimeQuestionnaire } from './studyLink.js'
import { isLang, LANGS, translate } from '../i18n/index.js'

// The study definition the researcher workspace (lab.html) builds and keeps.
// One format for every method: a moderated session run on the researcher's
// computer, or an unmoderated one sent as a link. The participant runtime
// (research.html) gets a slimmer copy from toRuntimeStudy().

export const STUDY_FORMAT = 'usability-lab/study@1'
export const METHODS = { moderated: 'Moderated, on this computer', unmoderated: 'Unmoderated, by link' }
// What the participant uses. "none": any app, site, prototype or object the
// moderator observes; nothing is embedded or recorded automatically.
export const SOURCES = { none: 'Any prototype or app (observed)', figma: 'Figma prototype (embedded, recorded)', demo: 'Demo shop (embedded, recorded)' }
export const POST_SURVEYS = { sus: 'SUS, 10 questions', 'umux-lite': 'UMUX-Lite, 2 questions', none: 'None' }
// Moderated outcomes; unmoderated sessions use the runtime's own outcomes.
export const OUTCOMES = { success: 'Success', partial: 'Partial success', failed: 'Failed or gave up', skipped: 'Skipped' }
// These English labels name the options; screens show study.method.<id>,
// study.source.<kind>, study.post.<id> and study.outcome.<id> instead.

const langOf = lang => (isLang(lang) ? lang : 'en')

const isText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max
const createdId = () => `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

// How many tasks, and how long each, a study can have. An unmoderated study
// travels in a link, which carries less.
export const LIMITS = { moderated: { tasks: 12, limitSec: 3600 }, unmoderated: LINK_LIMITS }
export const limitsFor = study => LIMITS[study?.method === 'unmoderated' ? 'unmoderated' : 'moderated']

export const newTask = number => ({ id: `T${number}`, prompt: '', success: '', limitSec: 300, start: null, successPage: null })

// overrides.lang (the participants' language) also sets the language of the
// default retention period.
export function newStudy(overrides = {}) {
  const now = new Date().toISOString()
  const lang = langOf(overrides.lang)
  return {
    format: STUDY_FORMAT,
    id: createdId(),
    title: '',
    // The language participants see: consent, instructions and questionnaires.
    // Task wording is written by the researcher in this language.
    lang: 'en',
    method: 'moderated',
    source: { kind: 'none' },
    tasks: [newTask(1)],
    questionnaire: { seq: true, post: 'sus' },
    counterbalance: false,
    plannedParticipants: 5,
    consent: { researcher: '', institution: '', contact: '', supervisor: '', ethicsBoard: '', ethicsNumber: '', purpose: '', durationMin: 30, compensation: '', retention: translate(lang, 'study.retentionDefault') },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

// The demo shop as a ready-made study, so a first-time researcher can try the
// whole flow in a minute. lang is the participants' language; the demo task
// wording comes in English and Chinese. The refund task has no success page;
// its prompt leaves out the runtime's "I'm done" button, which a moderated
// console does not have, so it reads right whichever method is chosen.
export const demoStudy = (lang = 'en') => {
  const language = langOf(lang)
  const t = (key, vars) => translate(language, `study.demo.${key}`, vars)
  return newStudy({
    lang: language,
    title: t('title'),
    source: { kind: 'demo' },
    tasks: demoTasks(language).map(task => ({ id: task.id, prompt: task.successPage ? task.prompt : t('refundPrompt'), success: task.successPage ? t('successPage', { page: task.successPage }) : t('successRefund'), limitSec: task.limitSec, start: task.start, successPage: task.successPage })),
    consent: { ...newStudy({ lang: language }).consent, purpose: t('purpose') },
  })
}

// Problems that block running or sharing the study, in plain words, in the
// reader's language. An empty list means it is ready.
export function studyProblems(study, lang = 'en') {
  const t = (key, vars) => translate(lang, `study.problem.${key}`, vars)
  const problems = []
  if (!isText(study.title, 120)) problems.push(t('title'))
  const limits = limitsFor(study)
  if (!study.tasks.length) problems.push(t('noTasks'))
  else if (study.tasks.length > limits.tasks) problems.push(t('taskCount', { max: limits.tasks }))
  study.tasks.forEach((task, index) => {
    const number = index + 1
    if (!isText(task.prompt, 300)) problems.push(t('taskPrompt', { number }))
    if (!Number.isInteger(task.limitSec) || task.limitSec < 30 || task.limitSec > limits.limitSec) problems.push(t('taskLimit', { number, max: limits.limitSec / 60 }))
    if (study.source.kind === 'figma' && ((task.start && !isNodeId(task.start)) || (task.successPage && !isNodeId(task.successPage)))) problems.push(t('taskFrame', { number }))
  })
  if (study.source.kind === 'figma') {
    const { figma } = study.source
    if (!figma || !isFileKey(figma.fileKey)) problems.push(t('figmaLink'))
    else if (study.method === 'unmoderated' && !isClientId(figma.clientId)) problems.push(t('figmaClientId'))
    // Optional when moderating, but a typed one must be a real client ID.
    else if (figma.clientId && !isClientId(figma.clientId)) problems.push(t('figmaClientIdFormat'))
  }
  if (study.method === 'unmoderated' && study.source.kind === 'none') problems.push(t('unmoderatedSource'))
  return problems
}

// Williams design: a balanced Latin square in which every task comes first
// equally often and follows every other task equally often (first-order
// carry-over balanced). An odd number of tasks needs the mirrored rows too.
export function williamsSquare(n) {
  if (n < 1) return []
  const first = [0]
  for (let low = 1, high = n - 1; first.length < n; low += 1, high -= 1) {
    first.push(low)
    if (first.length < n) first.push(high)
  }
  const rows = Array.from({ length: n }, (_, shift) => first.map(value => (value + shift) % n))
  return n % 2 ? [...rows, ...rows.map(row => [...row].reverse())] : rows
}

// The task order for the participant at index (0-based). Without
// counterbalancing every participant gets the defined order.
export function taskOrder(study, index) {
  if (!study.counterbalance || study.tasks.length < 2) return study.tasks.map(task => task.id)
  const rows = williamsSquare(study.tasks.length)
  return rows[index % rows.length].map(position => study.tasks[position].id)
}

export const participantId = index => `P${String(index + 1).padStart(2, '0')}`

// The copy the participant runtime (TaskRunner, recorder) works with.
export function toRuntimeStudy(study, order = study.tasks.map(task => task.id)) {
  const lang = isLang(study.lang) ? study.lang : 'en'
  const tasks = order.map(id => study.tasks.find(task => task.id === id)).filter(Boolean)
    .map(task => ({ id: task.id, prompt: task.prompt.trim(), start: task.start || null, successPage: task.successPage || null, limitSec: task.limitSec }))
  // The questionnaires to ask, and who an unmoderated participant sends the
  // results file to (from the consent fields).
  const questionnaire = runtimeQuestionnaire(study)
  const contact = runtimeContact({ contact: { researcher: study.consent?.researcher, contact: study.consent?.contact } })
  const shared = { lang, questionnaire, ...(contact ? { contact } : {}) }
  if (study.source.kind === 'figma') {
    const { figma } = study.source
    // No client ID is null, not '': session files are checked with isClientId.
    return { id: study.id, kind: 'figma', ...shared, title: study.title.trim(), figma: { fileKey: figma.fileKey, name: figma.name, startNodeId: figma.startNodeId || null, clientId: isClientId(figma.clientId) ? figma.clientId : null }, tasks }
  }
  if (study.source.kind === 'demo') return { id: study.id, ...shared, title: study.title.trim(), siteBase: DEMO_STUDY.siteBase, tasks: tasks.map(task => ({ ...task, start: task.start || 'orders.html' })) }
  return { id: study.id, kind: 'observed', ...shared, title: study.title.trim(), tasks }
}

// Text typed into a consent field, or null when it is empty.
const typed = value => (value && String(value).trim() ? String(value).trim() : null)
// A default we wrote (not the researcher) follows the document's language,
// so a study switched to another participant language does not keep it in
// the old one.
const ours = (lang, key, value) => (LANGS.some(other => value === translate(other, key)) ? translate(lang, key) : value)

// A consent form draft with the elements TCPS 2 (Article 3.2) asks for. It is
// a starting point: the researcher adapts it to their ethics board's template.
// What only the researcher knows (funder, conflicts of interest,
// commercialization, limits of confidentiality) is left as a [hint] to fill
// in. It is written in the participants' language; what the researcher typed
// is used as it is.
export function consentDocument(study, lang = study.lang || 'en') {
  const t = (key, vars) => translate(lang, `study.${key}`, vars)
  const hint = key => `[${t(key)}]`
  const field = (key, value) => t('doc.field', { label: t(`consent.${key}`), value: typed(value) || hint(`consent.${key}Hint`) })
  const c = study.consent
  const unmoderated = study.method === 'unmoderated'
  const figma = study.source.kind === 'figma'
  const minutes = Number(c.durationMin) || 30
  const tasks = study.tasks.length
  const post = study.questionnaire.post === 'sus' ? t('consent.postSus') : study.questionnaire.post === 'umux-lite' ? t('consent.postUmux') : null
  const product = t(figma ? 'consent.productFigma' : study.source.kind === 'demo' ? 'consent.productDemo' : 'consent.productOther')
  // An unmoderated session has no moderator taking notes, and the participant
  // runtime offers the webcam (on unless the participant turns it off).
  const recorded = t(study.source.kind === 'none' ? 'consent.recordedObserved' : unmoderated ? 'consent.recordedLink' : 'consent.recordedEmbedded')
  const purpose = typed(ours(lang, 'study.demo.purpose', c.purpose))
  const board = typed(c.ethicsBoard) || hint('consent.boardHint')
  const file = typed(c.ethicsNumber)
  return `# ${t('consent.heading', { title: study.title || hint('doc.studyTitle') })}

> ${t('consent.draft')}

${t('consent.invite')}

## ${t('consent.whoHeading')}
${field('researcher', c.researcher)}
${field('institution', c.institution)}
${field('contact', c.contact)}
${field('supervisor', c.supervisor)}
${field('funder', c.funder)}

## ${t('consent.whyHeading')}
${t('consent.purpose', { purpose: purpose || hint('consent.purposeHint') })}

## ${t('consent.whatHeading')}
- ${t('consent.tasks', { count: tasks, product })}
${study.questionnaire.seq ? `- ${t('consent.seq')}\n` : ''}${post ? `- ${t('consent.post', { post })}\n` : ''}- ${t('consent.duration', { minutes })}

## ${t('consent.recordedHeading')}
- ${t('consent.recorded', { what: recorded })}
${unmoderated ? `- ${t('consent.camera')}\n` : ''}- ${t('consent.noMedia')}
- ${t('consent.code')}

## ${t('consent.risksHeading')}
${t('consent.risks')}

## ${t('consent.voluntaryHeading')}
${t('consent.voluntary')}

${t('consent.newInfo')}

## ${t('consent.protectedHeading')}
- ${t(unmoderated ? 'consent.storedOrFile' : 'consent.stored')}
- ${t('consent.access')}
${figma ? `- ${t('consent.figma')}\n` : ''}${field('retention', ours(lang, 'study.retentionDefault', c.retention))}
${field('confidentiality', c.confidentiality)}
- ${t('consent.reporting')}

## ${t('consent.compensationHeading')}
${typed(c.compensation) || hint('consent.compensationHint')}
${hint('consent.injuryHint')}

## ${t('consent.interestsHeading')}
${field('conflicts', c.conflicts)}
${field('commercialization', c.commercialization)}

## ${t('consent.questionsHeading')}
${file ? t('consent.questionsFile', { board, file }) : t('consent.questions', { board })}

## ${t('consent.consentHeading')}
${t('consent.rights')}

- [ ] ${t('consent.agreeRead')}
- [ ] ${t('consent.agreeTakePart')}
- [ ] ${t('consent.agreeStop')}

${t('consent.signLine')}
`
}

// What happens to the data, for the ethics application's data management
// part, in the same language as the consent form. An unmoderated session has
// no moderator notes, and the participant runtime may use the webcam. In a
// Figma study the prototype comes from Figma, which therefore receives the
// browser's address and what is done in the prototype.
export function dataFlowStatement(study, lang = study.lang || 'en') {
  const t = (key, vars) => translate(lang, `study.data.${key}`, vars)
  const moderated = study.method === 'moderated'
  const embedded = study.source.kind !== 'none'
  const figma = study.source.kind === 'figma'
  const kept = ours(lang, 'study.retentionDefault', study.consent.retention) || `[${t('retentionHint')}]`
  const row = cells => `| ${cells.join(' | ')} |`
  const team = t('team')
  const stored = moderated ? t('researcherComputer') : t('resultsFile')
  const rows = [
    [t('timings'), moderated ? t('enteredByModerator') : t('recordedByBrowser'), moderated ? t('researcherBrowser') : t('resultsFileSent'), team, kept],
    moderated && [t('notes'), t('typedByModerator'), t('researcherComputer'), team, kept],
    [t('answers', { scale: study.questionnaire.post === 'none' ? 'SEQ' : study.questionnaire.post.toUpperCase() }), t('answeredOnScreen'), stored, team, kept],
    embedded && [t('clicks'), t('recordedAutomatically'), stored, team, kept],
    !moderated && [t('gaze'), t('gazeHow'), stored, team, kept],
    figma && [t('figmaData'), t('figmaHow'), t('figmaWhere'), t('figmaWho'), t('figmaKept')],
  ].filter(Boolean)
  return `# ${t('heading', { title: study.title || `[${translate(lang, 'study.doc.studyTitle')}]` })}

> ${t('generated')}

${row([t('colData'), t('colHow'), t('colWhere'), t('colWho'), t('colKept')])}
|---|---|---|---|---|
${rows.map(row).join('\n')}

- ${t('noMedia')}
- ${t(figma ? 'noUploadFigma' : 'noUpload')}
${figma ? `- ${t('figma')}\n` : ''}- ${t('codes')}
- ${t('export')}
`
}
