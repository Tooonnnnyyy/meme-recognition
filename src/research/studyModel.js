import { isClientId, isFileKey, isNodeId } from './figma.js'
import { DEMO_STUDY, demoTasks } from './study.js'
import { isLang } from '../i18n/index.js'

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

const isText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max
const createdId = () => `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

export const newTask = number => ({ id: `T${number}`, prompt: '', success: '', limitSec: 300, start: null, successPage: null })

export function newStudy(overrides = {}) {
  const now = new Date().toISOString()
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
    consent: { researcher: '', institution: '', contact: '', supervisor: '', ethicsBoard: '', ethicsNumber: '', purpose: '', durationMin: 30, compensation: '', retention: '12 months after the study ends' },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

// The demo shop as a ready-made study, so a first-time researcher can try the
// whole flow in a minute.
export const demoStudy = () => newStudy({
  title: 'Northwind returns (demo)',
  source: { kind: 'demo' },
  tasks: DEMO_STUDY.tasks.map(task => ({ id: task.id, prompt: task.prompt, success: task.successPage ? `Reaches the ${task.successPage} page` : 'Says the refund takes 5–7 business days', limitSec: task.limitSec, start: task.start, successPage: task.successPage })),
  consent: { ...newStudy().consent, purpose: 'to find out how easy it is to return an online order' },
})

// Problems that block running or sharing the study, in plain words. An empty
// list means it is ready.
export function studyProblems(study) {
  const problems = []
  if (!isText(study.title, 120)) problems.push('Give the study a title.')
  if (!study.tasks.length) problems.push('Add at least one task.')
  study.tasks.forEach((task, index) => {
    if (!isText(task.prompt, 300)) problems.push(`Task ${index + 1} needs instructions for the participant.`)
    if (!Number.isInteger(task.limitSec) || task.limitSec < 30 || task.limitSec > 3600) problems.push(`Task ${index + 1} needs a time limit from 30 seconds to 60 minutes.`)
    if (study.source.kind === 'figma' && ((task.start && !isNodeId(task.start)) || (task.successPage && !isNodeId(task.successPage)))) problems.push(`Task ${index + 1} has a frame that is not a Figma frame.`)
  })
  if (study.source.kind === 'figma') {
    const { figma } = study.source
    if (!figma || !isFileKey(figma.fileKey)) problems.push('Paste the link to the Figma prototype.')
    else if (study.method === 'unmoderated' && !isClientId(figma.clientId)) problems.push('An unmoderated Figma study needs a Figma client ID, so clicks and screens reach the results.')
  }
  if (study.method === 'unmoderated' && study.source.kind === 'none') problems.push('An unmoderated study needs a prototype the participant can open: choose Figma or the demo shop.')
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
  if (study.source.kind === 'figma') {
    const { figma } = study.source
    return { id: study.id, kind: 'figma', lang, title: study.title.trim(), figma: { fileKey: figma.fileKey, name: figma.name, startNodeId: figma.startNodeId || null, clientId: figma.clientId || '' }, tasks }
  }
  if (study.source.kind === 'demo') return { id: study.id, lang, title: study.title.trim(), siteBase: DEMO_STUDY.siteBase, tasks: tasks.map(task => ({ ...task, start: task.start || 'orders.html' })) }
  return { id: study.id, kind: 'observed', lang, title: study.title.trim(), tasks }
}

const line = (label, value, fallback) => `- **${label}:** ${value && String(value).trim() ? String(value).trim() : `[${fallback}]`}`

// A consent form draft with the elements TCPS 2 (Article 3.2) asks for. It is
// a starting point: the researcher adapts it to their ethics board's template.
export function consentDocument(study) {
  const c = study.consent
  const minutes = Number(c.durationMin) || 30
  const tasks = study.tasks.length
  const post = study.questionnaire.post === 'sus' ? 'ten short statements about the experience (the System Usability Scale)' : study.questionnaire.post === 'umux-lite' ? 'two short statements about the experience (UMUX-Lite)' : null
  const recorded = study.source.kind === 'none'
    ? 'the researcher’s typed notes about what you do and say, how long each task takes and whether it was completed'
    : 'the researcher’s notes, how long each task takes and whether it was completed, and the clicks and screens in the prototype'
  return `# Consent to take part in a usability study: ${study.title || '[study title]'}

> Draft generated by Usability Lab from the study settings. Check it against your research ethics board’s template before use.

You are invited to take part in a research study. Please read this form and ask any questions before you decide.

## Who is doing this study
${line('Researcher', c.researcher, 'name')}
${line('Institution', c.institution, 'institution')}
${line('Contact', c.contact, 'email or phone')}
${line('Supervisor', c.supervisor, 'supervisor name and contact, if a student study')}

## Why we are doing this study
The purpose is ${c.purpose && c.purpose.trim() ? c.purpose.trim() : '[purpose of the study]'}. We are testing the design, not you. There are no right or wrong answers.

## What you will be asked to do
- Try ${tasks} short ${tasks === 1 ? 'task' : 'tasks'} with ${study.source.kind === 'figma' ? 'a prototype' : study.source.kind === 'demo' ? 'a demo website' : 'a product or prototype'} while thinking aloud if you are comfortable doing so.
${study.questionnaire.seq ? '- After each task, rate how easy it was on a scale from 1 to 7.\n' : ''}${post ? `- At the end, answer ${post}.\n` : ''}- The session takes about ${minutes} minutes.

## What is recorded
- We record ${recorded}.
- We do not record video, audio or images of you, and nothing you type into the prototype is stored.
- Your name is not stored with your results; you are identified by a participant code such as P01.

## Risks and benefits
There are no known risks beyond those of everyday computer use. You may feel some frustration if a task is hard; that is information about the design, not about you. You may not benefit directly; the results will help improve the design.

## Taking part is voluntary
You can skip any task or question, take a break, or stop at any time without giving a reason and without any consequence. If you stop, you can ask for your data to be deleted. After the results are combined and anonymised, it may no longer be possible to remove them.

## How your information is protected
- Results are stored on the researcher’s computer${study.method === 'unmoderated' ? ' or in the results file you choose to send' : ''}, not on a third-party server.
${line('Retention', c.retention, 'how long data are kept, then destroyed')}
- Results may be reported in a course assignment, presentation or publication without any information that identifies you.

## Compensation
${c.compensation && c.compensation.trim() ? c.compensation.trim() : '[compensation, or “There is no compensation for taking part.”]'}

## Questions and concerns
For questions about the study, contact the researcher above. For concerns about your rights as a participant, contact ${c.ethicsBoard && c.ethicsBoard.trim() ? c.ethicsBoard.trim() : '[research ethics board and its contact]'}${c.ethicsNumber && c.ethicsNumber.trim() ? ` (file ${c.ethicsNumber.trim()})` : ''}.

## Consent
- [ ] I have read this information and my questions have been answered.
- [ ] I agree to take part in this study.
- [ ] I understand I can stop at any time.

Participant code: ________  Date: ________  Researcher initials: ________
`
}

// What happens to the data, for the ethics application's data management part.
export function dataFlowStatement(study) {
  const moderated = study.method === 'moderated'
  const embedded = study.source.kind !== 'none'
  return `# Data management: ${study.title || '[study title]'}

> Generated by Usability Lab from the study settings.

| Data | Collected how | Stored where | Who can see it | Kept for |
|---|---|---|---|---|
| Task times, outcomes and ease ratings | ${moderated ? 'Entered by the moderator during the session' : 'Recorded by the browser as the participant works'} | ${moderated ? 'The researcher’s browser (IndexedDB) on the researcher’s computer' : 'A results file on the participant’s computer, then sent to the researcher'} | The research team | ${study.consent.retention || '[retention]'} |
| Observation notes and quotes | Typed by the moderator | The researcher’s computer | The research team | ${study.consent.retention || '[retention]'} |
| Questionnaire answers (${study.questionnaire.post === 'none' ? 'SEQ' : study.questionnaire.post.toUpperCase()}) | Answered on screen by the participant | ${moderated ? 'The researcher’s computer' : 'The results file'} | The research team | ${study.consent.retention || '[retention]'} |
${embedded ? `| Clicks and screens in the prototype | Recorded automatically in the browser | ${moderated ? 'The researcher’s computer' : 'The results file'} | The research team | ${study.consent.retention || '[retention]'} |\n` : ''}
- No video, audio, photos or face images are stored. If the webcam is used for gaze estimation, frames are processed in the browser and discarded; only numbers are kept.
- No data are sent to Usability Lab or any third-party server. The app is a static web page; all processing happens in the browser.
${study.source.kind === 'figma' ? '- The prototype is shown through Figma’s embed (figma.com). Figma serves the prototype to the participant’s browser; the study’s click and screen events go only to this page.\n' : ''}- Participants are identified by codes (P01, P02…). Any list linking codes to names is kept separately by the researcher, outside this tool.
- The researcher can export the study as a file for backup and delete it from the browser at any time. Deleting a participant’s session removes it from the workspace.
`
}
