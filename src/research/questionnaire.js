// Standard post-task and post-test questionnaires.
//
// SEQ, the Single Ease Question (Sauro & Dumas 2009): one 7-point rating after
// each task. A mean around 5.5 is typical; tasks rated below 5 deserve a look.
//
// SUS, the System Usability Scale (Brooke 1996): ten 5-point items after the
// test. "System" is replaced by the product word, which keeps the scale valid
// (Lewis & Sauro 2009). Scores run 0–100; 68 is the average across products.
//
// The wording comes from the participant messages (participant.seq.*,
// participant.sus.*, participant.umux.*), in English or Chinese. The Chinese
// follows the SUS translation in common use, not the validated revision by
// Wang, Lei & Liu (2019); see docs/i18n.md. Each function takes the language
// (default English); the constants are the English wording.
import { translate } from '../i18n/index.js'
import { runtimeQuestionnaire } from './studyLink.js'

// What a runtime study asks besides the tasks, for the consent screen: ask
// names the sentence (participant.consent.ask.<id>: seqSus, seqUmux, seq,
// sus, umux, or null when nothing is asked) and answers names which answers
// the results file keeps (participant.consent.answers.<id>: both, ratings,
// final, or null).
export function questionsAsked(study) {
  const { seq, post } = runtimeQuestionnaire(study)
  const end = { sus: 'Sus', 'umux-lite': 'Umux', none: '' }[post]
  const ask = seq ? `seq${end}` : end ? end.toLowerCase() : null
  const answers = seq && end ? 'both' : seq ? 'ratings' : end ? 'final' : null
  return { ask, answers }
}

export const seqQuestion = (lang = 'en') => translate(lang, 'participant.seq.question')
export const seqEnds = (lang = 'en') => [translate(lang, 'participant.seq.difficult'), translate(lang, 'participant.seq.easy')]
export const SEQ_QUESTION = seqQuestion()
export const SEQ_ENDS = seqEnds()
export const isSeq = value => Number.isInteger(value) && value >= 1 && value <= 7

export const susScale = (lang = 'en') => [1, 2, 3, 4, 5].map(n => translate(lang, `participant.sus.scale${n}`))
export const SUS_SCALE = susScale()
// The product word ('prototype', 'website', 'product') in the given
// language; any other word is used as it is.
const productWord = (product, lang) => {
  const key = `participant.product.${product}`
  const word = translate(lang, key)
  return word === key ? product : word
}
// The product word for a runtime study: a Figma study tests a prototype, the
// demo shop a website, and an observed study (an app, a ProtoPie or Axure
// prototype, paper…) a product.
export const productFor = study => (study?.kind === 'figma' ? 'prototype' : study?.kind === 'observed' ? 'product' : 'website')
export const susItems = (product, lang = 'en') => Array.from({ length: 10 }, (_, index) => translate(lang, `participant.sus.item${index + 1}`, { p: productWord(product, lang) }))

// Odd items are positive (answer − 1), even items negative (5 − answer); the
// sum of the ten contributions times 2.5 gives 0–100. Null unless all ten
// items are answered 1–5.
export function susScore(answers) {
  if (!Array.isArray(answers) || answers.length !== 10 || !answers.every(answer => Number.isInteger(answer) && answer >= 1 && answer <= 5)) return null
  return answers.reduce((sum, answer, index) => sum + (index % 2 === 0 ? answer - 1 : 5 - answer), 0) * 2.5
}

// The Sauro–Lewis curved grading scale (2016), from about 500 studies: a C is
// average (68), an A is the top 10%.
const GRADES = [[84.1, 'A+'], [80.8, 'A'], [78.9, 'A−'], [77.2, 'B+'], [74.1, 'B'], [72.6, 'B−'], [71.1, 'C+'], [65, 'C'], [62.7, 'C−'], [51.7, 'D']]
export const susGrade = score => (score == null ? null : (GRADES.find(([floor]) => score >= floor)?.[1] || 'F'))

// UMUX-Lite (Lewis, Utesch & Maher 2013): two 7-point items, a short
// alternative to the SUS when time is tight. The raw score runs 0–100; the
// regression 0.65 × raw + 22.9 puts it on the SUS scale, so the same grades
// apply.
// The scale names only its ends.
export const umuxLiteScale = (lang = 'en') => [translate(lang, 'participant.sus.scale1'), '', '', '', '', '', translate(lang, 'participant.sus.scale5')]
export const UMUX_LITE_SCALE = umuxLiteScale()
export const umuxLiteItems = (product, lang = 'en') => [1, 2].map(n => translate(lang, `participant.umux.item${n}`, { p: productWord(product, lang) }))
export function umuxLiteScore(answers) {
  if (!Array.isArray(answers) || answers.length !== 2 || !answers.every(answer => Number.isInteger(answer) && answer >= 1 && answer <= 7)) return null
  const raw = ((answers[0] - 1) + (answers[1] - 1)) / 12 * 100
  return { raw: Math.round(raw * 10) / 10, sus: Math.round((0.65 * raw + 22.9) * 10) / 10 }
}
