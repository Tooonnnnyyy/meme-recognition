// Standard post-task and post-test questionnaires.
//
// SEQ, the Single Ease Question (Sauro & Dumas 2009): one 7-point rating after
// each task. A mean around 5.5 is typical; tasks rated below 5 deserve a look.
//
// SUS, the System Usability Scale (Brooke 1996): ten 5-point items after the
// test. "System" is replaced by the product word, which keeps the scale valid
// (Lewis & Sauro 2009). Scores run 0–100; 68 is the average across products.

export const SEQ_QUESTION = 'Overall, how difficult or easy was this task?'
export const SEQ_ENDS = ['Very difficult', 'Very easy']
export const isSeq = value => Number.isInteger(value) && value >= 1 && value <= 7

export const SUS_SCALE = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree']
const SUS_TEXT = [
  'I think that I would like to use this {p} frequently.',
  'I found the {p} unnecessarily complex.',
  'I thought the {p} was easy to use.',
  'I think that I would need the support of a technical person to be able to use this {p}.',
  'I found the various functions in this {p} were well integrated.',
  'I thought there was too much inconsistency in this {p}.',
  'I would imagine that most people would learn to use this {p} very quickly.',
  'I found the {p} very cumbersome to use.',
  'I felt very confident using the {p}.',
  'I needed to learn a lot of things before I could get going with this {p}.',
]
export const susItems = product => SUS_TEXT.map(text => text.replace('{p}', product))

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
