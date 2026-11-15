import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRecorder } from '../src/research/recorder.js'
import { participantId } from '../src/research/studyModel.js'
import { isFinished } from '../src/research/sessionStatus.js'
import { durationText, translate } from '../src/i18n/index.js'

// The console's slot helpers are one-line pure functions in a .jsx file,
// which node cannot import: read them from the source and build them here.
const source = readFileSync('src/lab/Console.jsx', 'utf8')
const helper = name => {
  const body = source.match(new RegExp(`^const ${name} = (.+)$`, 'm'))?.[1]
  assert.ok(body, `${name} is defined in Console.jsx`)
  return new Function('participantId', 'isFinished', `return ${body}`)(participantId, isFinished)
}
const finishedCodes = helper('finishedCodes')
const openSlot = helper('openSlot')
const session = (participant, extra = {}) => ({ participant, mode: 'moderated', startedAt: '2026-11-01T10:00:00Z', tasks: [], ...extra })
const done = { finishedAt: '2026-11-01T10:30:00Z' }

test('Next participant goes to the first slot without a finished session, not to index + 1', () => {
  // P02 ran first (P01 was a no-show), then P01 came: the next one is P03.
  const sessions = [session('P02', done), session('P01', done)]
  assert.equal(openSlot(5, finishedCodes(sessions)), 2)
  // With P01 and P03 done, P02 is next.
  assert.equal(openSlot(5, finishedCodes([session('P01', done), session('P03', done)])), 1)
  // Every planned slot done: no next participant.
  assert.equal(openSlot(2, finishedCodes([session('P01', done), session('P02', done)])), -1)
})

test('a pilot or an unfinished session does not take a slot', () => {
  const sessions = [
    session('P01', { pilot: true, ...done }),
    // Left with browser Back mid-task: saved, never finished.
    session('P01', { tasks: [{ id: 'T1', start: 0, end: null }] }),
  ]
  assert.deepEqual([...finishedCodes(sessions)], [])
  assert.equal(openSlot(3, finishedCodes(sessions)), 0)
  // Only a finished session warns at setup that the code is taken.
  assert.ok(finishedCodes([session('P02', done)]).has('P02'))
  assert.ok(!finishedCodes([session('P02')]).has('P02'))
})

test('a note typed between tasks is filed under the task about to start', () => {
  const recorder = createRecorder({ study: { id: 's', title: 'Study', siteBase: 'research-site/' }, participant: 'P01' })
  // Before task 1 (the console passes the upcoming task's id).
  recorder.addNote('quote', 'I never return things online', 'T1')
  recorder.startTask({ id: 'T1', prompt: 'Find the order' })
  recorder.addNote('note', 'Found it fast #orders')
  recorder.endTask('success')
  // Rating screen: no id passed, so the note stays with the task just ended.
  recorder.addNote('note', 'Rated it easy')
  // Intro of task 2.
  recorder.addNote('problem', 'Misread the task wording #wording', 'T2')
  recorder.startTask({ id: 'T2', prompt: 'Start a return' })
  // While a task runs, the running task wins over any id passed.
  recorder.addNote('note', 'Looking in the footer', 'T3')
  assert.deepEqual(recorder.session.notes.map(note => [note.taskId, note.kind, note.text]), [
    ['T1', 'quote', 'I never return things online'],
    ['T1', 'note', 'Found it fast'],
    ['T1', 'note', 'Rated it easy'],
    ['T2', 'problem', 'Misread the task wording'],
    ['T2', 'note', 'Looking in the footer'],
  ])
})

test('the over-time chip names the limit as set, in both languages', () => {
  const chip = (lang, seconds) => translate(lang, 'console.over', { limit: durationText(lang, seconds).toUpperCase() })
  assert.equal(chip('en', 30), 'OVER THE LIMIT · 30 SECONDS')
  assert.equal(chip('en', 60), 'OVER THE LIMIT · 1 MINUTE')
  assert.equal(chip('en', 90), 'OVER THE LIMIT · 1 MIN 30 S')
  assert.equal(chip('en', 300), 'OVER THE LIMIT · 5 MINUTES')
  assert.equal(chip('zh', 30), '超出30秒时限')
  assert.equal(chip('zh', 90), '超出1分30秒时限')
  assert.equal(chip('zh', 300), '超出5分钟时限')
})

test('the new console messages read in both languages', () => {
  assert.equal(translate('en', 'console.setup.taken', { code: 'P02' }), 'P02 already has a finished session. Beginning again saves a second session as P02.')
  assert.equal(translate('zh', 'console.setup.taken', { code: 'P02' }), 'P02 已有一个已完成的场次。再次开始会以 P02 另存一个新场次。')
  assert.equal(translate('zh', 'console.setup.openSlot', { code: 'P03' }), '改为开始场次 P03')
  for (const key of ['console.leave', 'console.panel.paused']) {
    assert.notEqual(translate('en', key), key)
    assert.match(translate('zh', key), /\p{Script=Han}/u)
  }
  // The paused note says how to get the keys back.
  assert.match(translate('en', 'console.panel.paused'), /Click anywhere in this panel/)
})
