import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { embedUrl, parseFigmaLink } from '../src/research/figma.js'
import { consentDocument, dataFlowStatement, demoStudy, newStudy, studyProblems, toRuntimeStudy } from '../src/research/studyModel.js'
import { demoStudyIn } from '../src/research/study.js'
import { encodeStudy } from '../src/research/studyLink.js'

const MAIN = 'AbCdEf1234567890'
const BRANCH = 'XyZbRaNcH9876543'
const figmaSource = { kind: 'figma', figma: { fileKey: MAIN, name: 'Shop', clientId: 'Qh4pDELgOVadrxPT' } }
const study = (lang, overrides = {}) => ({ ...demoStudy(lang), ...overrides })

test('a Figma branch link gives the branch, not the main file', () => {
  for (const kind of ['design', 'file', 'proto']) {
    const link = parseFigmaLink(`https://www.figma.com/${kind}/${MAIN}/branch/${BRANCH}/Checkout?node-id=1-2`)
    assert.deepEqual(link, { fileKey: BRANCH, name: 'Checkout', nodeId: '1:2', startNodeId: null }, kind)
    assert.match(embedUrl(link, link.nodeId), new RegExp(`^https://embed\\.figma\\.com/proto/${BRANCH}/Checkout\\?`))
  }
  // A branch link without a name, and a file that is simply named "branch".
  assert.equal(parseFigmaLink(`https://www.figma.com/design/${MAIN}/branch/${BRANCH}`).name, 'Prototype')
  assert.deepEqual(parseFigmaLink(`https://www.figma.com/proto/${MAIN}/branch?node-id=1-2`), { fileKey: MAIN, name: 'branch', nodeId: '1:2', startNodeId: null })
  assert.equal(parseFigmaLink(`https://www.figma.com/design/x/branch/${BRANCH}/Checkout`), null)
  assert.equal(parseFigmaLink(`https://www.figma.com/design/${MAIN}/branch/x/Checkout`).fileKey, MAIN)
})

test('an unmoderated consent draft names the optional webcam and has no moderator notes', () => {
  const en = consentDocument(study('en', { method: 'unmoderated' }))
  assert.match(en, /If you leave the camera on: an estimate of where on the screen you look/)
  assert.match(en, /The camera is optional: you can turn it off before you start/)
  assert.doesNotMatch(en, /researcher’s notes/)
  const zh = consentDocument(study('zh', { method: 'unmoderated' }))
  assert.match(zh, /如果你开启摄像头：每秒多次估计你看向屏幕的哪个位置/)
  assert.doesNotMatch(zh, /研究者的笔记/)
  // A moderated session uses no camera, and the moderator takes notes.
  const moderated = consentDocument(study('en'))
  assert.doesNotMatch(moderated, /camera/i)
  assert.match(moderated, /the researcher’s notes/)
})

test('an unmoderated data statement lists the webcam numbers and drops the moderator notes', () => {
  const rowsOf = text => text.split('\n').filter(line => line.startsWith('| ') && !line.startsWith('| Data') && !line.startsWith('| 数据'))
  const unmoderated = dataFlowStatement(study('en', { method: 'unmoderated' }))
  assert.ok(rowsOf(unmoderated).some(row => row.startsWith('| Gaze estimates and face-movement numbers (optional webcam) | Worked out in the participant’s browser')))
  assert.doesNotMatch(unmoderated, /Observation notes|Typed by the moderator/)
  const moderated = dataFlowStatement(study('en'))
  assert.match(moderated, /\| Observation notes and quotes \| Typed by the moderator \|/)
  assert.doesNotMatch(moderated, /Gaze estimates/)
  assert.equal(rowsOf(moderated).length, 4)
  const zh = dataFlowStatement(study('zh', { method: 'unmoderated' }))
  assert.match(zh, /\| 视线估计和面部动作数值（来自摄像头，可选） \|/)
  assert.doesNotMatch(zh, /观察笔记/)
  // Every row has the five columns, so the Markdown table renders.
  for (const text of [unmoderated, moderated, zh]) rowsOf(text).forEach(row => assert.equal(row.split(' | ').length, 5, row))
})

test('a Figma study says what Figma receives, instead of "no third-party server"', () => {
  for (const method of ['moderated', 'unmoderated']) {
    const figma = study('en', { method, source: figmaSource })
    const consent = consentDocument(figma)
    assert.match(consent, /The prototype is shown by Figma \(figma\.com\), a company based in the United States\. Figma receives the internet \(IP\) address and browser details/)
    const data = dataFlowStatement(figma)
    assert.match(data, /\| IP address, browser details and use of the prototype \| Received by Figma when the browser loads the prototype from figma\.com \| Figma’s servers \(Figma, Inc\., a US company\) \| Figma \|/)
    assert.match(data, /Apart from what Figma receives \(see the table\), no data are sent/)
    assert.doesNotMatch(data, /^- No data are sent to Usability Lab or any third-party server/m)
    assert.doesNotMatch(data, /go only to this page/)
    const zh = study('zh', { method, source: figmaSource })
    assert.match(consentDocument(zh), /原型由 Figma（figma\.com）显示/)
    assert.match(dataFlowStatement(zh), /\| IP 地址、浏览器信息和原型的使用情况 \|/)
  }
  // Without Figma nothing changes.
  const demo = dataFlowStatement(study('en', { method: 'unmoderated' }))
  assert.match(demo, /^- No data are sent to Usability Lab or any third-party server\./m)
  assert.doesNotMatch(demo, /Figma/)
  assert.doesNotMatch(consentDocument(study('en')), /Figma/)
})

test('the consent draft has the TCPS 2 Article 3.2 elements it lacked, with hints to fill in', () => {
  const en = consentDocument(study('en'))
  assert.match(en, /- \*\*Funder or sponsor:\*\* \[funder or sponsor, or “This study has no funder or sponsor\.”\]/) // 3.2(b)
  assert.match(en, /If we learn anything during the study that might affect your decision to continue, we will tell you promptly\./) // 3.2(d)
  assert.match(en, /## Conflicts of interest and commercialization\n- \*\*Conflicts of interest:\*\* \[.+\]\n- \*\*Commercialization:\*\* \[.+\]/) // 3.2(e)
  assert.match(en, /- \*\*Limits of confidentiality:\*\* \[anyone who may have a duty to disclose information/) // 3.2(i)
  assert.match(en, /- Only the research team can see your results and any list that links your name to your participant code\./) // 3.2(i)
  assert.match(en, /## Consent\nBy consenting, you have not waived any rights to legal recourse in the event of research-related harm\./) // 3.2(k)
  const zh = consentDocument(study('zh'))
  for (const part of ['**资助方或赞助方**：[', '会及时告诉你。', '## 利益冲突与商业化\n', '**利益冲突**：[', '**商业化**：[', '**保密的限度**：[', '只有研究团队可以查看你的结果','寻求法律救济的任何权利。']) assert.ok(zh.includes(part), part)
  assert.doesNotMatch(zh, /\b(?:the|and|you)\b/i)
  // No space is left between Chinese sentences.
  assert.doesNotMatch(zh, /[。，：] /)
  // What the researcher types later in these fields is used as it is.
  assert.match(consentDocument(study('en', { consent: { ...demoStudy().consent, funder: 'NSERC' } })), /\*\*Funder or sponsor:\*\* NSERC/)
})

test('the Lab demo study does not point to an "I’m done" button; the runtime demo keeps it', () => {
  for (const lang of ['en', 'zh']) {
    const prompts = demoStudy(lang).tasks.map(task => task.prompt)
    assert.ok(prompts.every(prompt => !/I’m done|我完成了/.test(prompt)), prompts.join(' / '))
    assert.ok(demoStudyIn(lang).tasks.some(task => /I’m done|我完成了/.test(task.prompt)), lang)
  }
  assert.equal(demoStudy().tasks[2].prompt, 'Find out how long a refund takes to reach your card.')
  assert.equal(demoStudy('zh').tasks[2].prompt, '查一查退款要多久才能退回你的银行卡。')
  assert.deepEqual(studyProblems(demoStudy()), [])
})

test('an unmoderated Figma study that Plan calls ready always gets a participant link', () => {
  const figma = (tasks, limitSec) => newStudy({
    title: 'Checkout',
    method: 'unmoderated',
    source: figmaSource,
    tasks: Array.from({ length: tasks }, (_, index) => ({ id: `T${index + 1}`, prompt: 'Buy it.', success: '', limitSec, start: null, successPage: null })),
  })
  for (const tasks of [1, 10, 11, 12]) {
    for (const limitSec of [30, 1800, 1830, 2400, 3600]) {
      const plan = figma(tasks, limitSec)
      if (studyProblems(plan).length) assert.throws(() => encodeStudy(toRuntimeStudy(plan)), `${tasks} tasks, ${limitSec} s`)
      else assert.doesNotThrow(() => encodeStudy(toRuntimeStudy(plan)), `${tasks} tasks, ${limitSec} s`)
    }
  }
})

test('the frame guard is loaded first by the researcher and participant pages, and the ignored meta directives are gone', () => {
  for (const page of ['research.html', 'lab.html', 'index.html']) {
    const html = readFileSync(page, 'utf8')
    const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)[1]
    assert.doesNotMatch(csp, /frame-ancestors/, page)
    assert.match(csp, /script-src 'self'/, page)
    assert.doesNotMatch(html, /http-equiv="Permissions-Policy"/, page)
    if (page === 'index.html') continue
    // After the CSP (so it applies) and before any other script.
    const guard = html.indexOf('<script src="/frame-guard.js"></script>')
    assert.ok(guard > html.indexOf('Content-Security-Policy'), page)
    assert.equal(html.indexOf('<script'), guard, page)
  }
})
