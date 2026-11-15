import test from 'node:test'
import assert from 'node:assert/strict'
import { durationText, translate } from '../src/i18n/index.js'
import { productFor, questionsAsked, susItems, umuxLiteItems } from '../src/research/questionnaire.js'
import { decodeStudy, encodeStudy, runtimeContact } from '../src/research/studyLink.js'
import messages from '../src/i18n/messages/participant.js'

const figmaStudy = extra => ({
  kind: 'figma',
  title: 'Checkout',
  figma: { fileKey: 'AbCdEfGhIjKlMnOp', name: 'Checkout', startNodeId: '1:2', clientId: 'client_abcdef12' },
  tasks: [{ id: 'T1', prompt: 'Buy the boots.', start: null, successPage: null, limitSec: 30 }],
  ...extra,
})

// #8: what the consent screen says is asked follows the study's settings.
test('the consent names exactly the questionnaires the study asks', () => {
  const cases = [
    [{ seq: true, post: 'sus' }, { ask: 'seqSus', answers: 'both' }],
    [{ seq: true, post: 'umux-lite' }, { ask: 'seqUmux', answers: 'both' }],
    [{ seq: true, post: 'none' }, { ask: 'seq', answers: 'ratings' }],
    [{ seq: false, post: 'sus' }, { ask: 'sus', answers: 'final' }],
    [{ seq: false, post: 'umux-lite' }, { ask: 'umux', answers: 'final' }],
    [{ seq: false, post: 'none' }, { ask: null, answers: null }],
  ]
  for (const [questionnaire, expected] of cases) assert.deepEqual(questionsAsked({ questionnaire }), expected, JSON.stringify(questionnaire))
  // Links made before the setting travelled keep SEQ and SUS.
  assert.deepEqual(questionsAsked({}), { ask: 'seqSus', answers: 'both' })
  for (const lang of ['en', 'zh']) {
    for (const [, { ask, answers }] of cases) {
      if (ask) assert.notEqual(translate(lang, `participant.consent.ask.${ask}`), `participant.consent.ask.${ask}`)
      if (answers) assert.notEqual(translate(lang, `participant.consent.answers.${answers}`), `participant.consent.answers.${answers}`)
    }
  }
})

test('the consent lede reads well with and without the questions', () => {
  const lede = (lang, key, ask) => translate(lang, key, { count: 3, ask: ask ? translate(lang, `participant.consent.ask.${ask}`) : '' })
  const umux = lede('en', 'participant.consent.ledeFigma', 'seqUmux')
  assert.match(umux, /we are testing the design\. After each task you rate how easy it was, and at the end you answer 2 short questions; both are optional\. You can skip/)
  const none = lede('en', 'participant.consent.ledeSite', null)
  assert.doesNotMatch(none, /rate|questions|\s{2}/)
  assert.match(none, /we are testing the website\. You can skip a task/)
  assert.match(lede('en', 'participant.consent.ledeSite', 'sus'), /At the end you answer 10 short questions/)
  const zh = lede('zh', 'participant.consent.ledeFigma', null)
  assert.doesNotMatch(zh, /\{|评分|问题/)
  assert.match(lede('zh', 'participant.consent.ledeFigma', 'umux'), /最后还有2道简短的问题/)
  // The recorded list names only the answers the study collects.
  const records = translate('en', 'participant.consent.records', { what: 'Clicks.', answers: '' })
  assert.match(records, /^Clicks\. With the camera on: .+ as numbers\. We never label emotions\.$/)
  assert.match(translate('zh', 'participant.consent.records', { what: '点击。', answers: translate('zh', 'participant.consent.answers.ratings') }), /此外还会记录你的评分。我们不会/)
})

test('a link carries the questionnaire and the contact to the participant', () => {
  const study = decodeStudy(encodeStudy(figmaStudy({ questionnaire: { seq: false, post: 'umux-lite' }, contact: { researcher: 'Dr. Lee', contact: 'lee@example.org' } })))
  assert.deepEqual(questionsAsked(study), { ask: 'umux', answers: 'final' })
  assert.deepEqual(runtimeContact(study), { researcher: 'Dr. Lee', contact: 'lee@example.org' })
})

// #10: the finish screen says where to send the file in every case.
test('the finish screen names who gets the file', () => {
  assert.equal(translate('en', 'participant.finished.sendBoth', { researcher: 'Dr. Lee', contact: 'lee@example.org' }), 'Now send this file to <b>Dr. Lee</b> at <b>lee@example.org</b>.')
  assert.equal(translate('en', 'participant.finished.sendName', { researcher: 'Dr. Lee' }), 'Now send this file to <b>Dr. Lee</b>.')
  assert.equal(translate('en', 'participant.finished.sendContact', { contact: 'lee@example.org' }), 'Now send this file to <b>lee@example.org</b>.')
  assert.equal(translate('en', 'participant.finished.sendSender'), 'Now send this file to the person who sent you the link.')
  assert.equal(translate('zh', 'participant.finished.sendBoth', { researcher: '李老师', contact: 'lee@example.org' }), '现在请把这个文件发给<b>李老师</b>，联系方式：<b>lee@example.org</b>。')
})

// #13: the ends of a 1–7 scale have full names.
test('scale ends are named with their label', () => {
  assert.equal(translate('en', 'participant.scale.end', { n: 1, label: translate('en', 'participant.seq.difficult') }), '1, Very difficult')
  assert.equal(translate('zh', 'participant.scale.end', { n: 7, label: translate('zh', 'participant.seq.easy') }), '7，非常容易')
})

// #14: the time limit is the real one, not rounded to whole minutes.
test('the task intro states the exact time limit', () => {
  const intro = (lang, seconds) => translate(lang, 'participant.runner.introSite', { duration: durationText(lang, seconds) })
  assert.match(intro('en', 30), /You have up to 30 seconds\.$/)
  assert.match(intro('en', 60), /You have up to 1 minute\.$/)
  assert.match(intro('en', 90), /You have up to 1 min 30 s\.$/)
  assert.match(intro('en', 150), /You have up to 2 min 30 s\.$/)
  assert.match(translate('en', 'participant.runner.introFigma', { duration: durationText('en', 120) }), /up to 2 minutes\.$/)
  assert.match(intro('zh', 30), /你最多有30秒。$/)
  assert.match(intro('zh', 90), /你最多有1分30秒。$/)
})

// #15: an observed study's SUS asks about the product, not a website.
test('the SUS and UMUX-Lite use the study’s product word', () => {
  assert.equal(productFor({ kind: 'figma' }), 'prototype')
  assert.equal(productFor({ kind: 'observed' }), 'product')
  assert.equal(productFor({ id: 'northwind-returns', siteBase: 'research-site/' }), 'website')
  const items = susItems(productFor({ kind: 'observed' }))
  assert.equal(items[0], 'I think that I would like to use this product frequently.')
  assert.ok(items.every(item => !/website/.test(item)))
  assert.ok(susItems(productFor({ kind: 'observed' }), 'zh').every(item => item.includes('产品')))
  assert.equal(umuxLiteItems(productFor({ kind: 'observed' }))[1], 'This product is easy to use.')
})

// #101: the participant never sees a pass or a fail.
test('participant outcome labels are neutral', () => {
  for (const lang of ['en', 'zh']) {
    const keys = Object.keys(messages[lang]).filter(key => key.startsWith('outcome.')).sort()
    assert.deepEqual(keys, ['outcome.finished', 'outcome.skipped', 'outcome.timeout'])
  }
  const labels = Object.entries(messages.en).filter(([key]) => key.startsWith('outcome.')).map(([, value]) => value)
  assert.ok(labels.every(label => !/goal|complet|fail|success/i.test(label)), labels.join(', '))
})

// #99: an empty ?study= is a damaged link, which the page shows as broken.
test('an empty study parameter does not decode', () => {
  assert.throws(() => decodeStudy(''), error => error.key === 'researcher.link.damaged')
})

// #28: Figma studies say Figma shows the prototype.
test('Figma studies disclose Figma', () => {
  for (const lang of ['en', 'zh']) {
    const text = translate(lang, 'participant.consent.figma')
    assert.match(text, /figma\.com/)
    assert.match(text, /IP/)
    assert.match(text, /<link>[^<]+<\/link>/)
    assert.match(translate(lang, 'participant.processedFigma'), /Figma/i)
    assert.match(translate(lang, 'participant.runner.localFigma'), /Figma/i)
  }
})
