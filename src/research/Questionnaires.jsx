import React, { useEffect, useRef, useState } from 'react'
import { ViewToggles } from '../ThemeToggle'
import { useT } from '../i18n/react.jsx'
import { productFor, seqEnds, seqQuestion, susItems, susScale, umuxLiteItems, umuxLiteScale } from './questionnaire'

// The forms are worded in the interface language, which the participant
// runtime pins to the study's language. Callers record that language with
// the answers (currentLang()).

// The accessible name of a 1–7 radio: the two ends carry their label
// ("1, Very difficult"), so a screen reader says which way the scale runs.
const levelName = (t, level, ends) => (level === 1 || level === 7 ? t('participant.scale.end', { n: level, label: ends[level === 1 ? 0 : 1] }) : undefined)

// After each task: the Single Ease Question, 1–7. Optional. outcome is a
// neutral label for how the task ended. With autoFocus the question takes
// the focus when it appears, so a keyboard or screen-reader user starts there.
export function SeqRating({ taskNumber, outcome, onDone, autoFocus = false }) {
  const t = useT()
  const [value, setValue] = useState(null)
  const headingRef = useRef(null)
  useEffect(() => { if (autoFocus) headingRef.current?.focus() }, [autoFocus])
  const ends = seqEnds(t.lang)
  return <div className="panel intro-card seq-card">
    {outcome && <span className="chip live">{t('participant.seq.chip', { n: taskNumber, outcome: outcome.toUpperCase() })}</span>}
    <span className="kicker">{t('participant.seq.kicker')}</span>
    <fieldset className="seq">
      <legend><h2 ref={headingRef} tabIndex={-1}>{seqQuestion(t.lang)}</h2></legend>
      <div className="seq-scale">
        {[1, 2, 3, 4, 5, 6, 7].map(level => <label key={level} className={value === level ? 'on' : ''}>
          <input type="radio" name="seq" value={level} checked={value === level} onChange={() => setValue(level)} aria-label={levelName(t, level, ends)} />
          <span>{level}</span>
        </label>)}
      </div>
      <div className="seq-ends muted small"><span>1 · {ends[0]}</span><span>7 · {ends[1]}</span></div>
    </fieldset>
    <div className="actions">
      <button className="btn primary" disabled={value == null} onClick={() => onDone(value)}>{t('participant.seq.continue')}</button>
      <button className="btn ghost" onClick={() => onDone(null)}>{t('participant.seq.skip')}</button>
    </div>
  </div>
}

// After the last task: the System Usability Scale. Optional, and it counts
// only when all ten items are answered.
export function SusForm({ study, participant, onDone }) {
  const t = useT()
  const items = susItems(productFor(study), t.lang)
  const scale = susScale(t.lang)
  const [answers, setAnswers] = useState(Array(10).fill(null))
  const answered = answers.filter(Boolean).length
  return <div className="screen">
    <header className="topbar"><div className="brand"><span className="mark">◎</span><div><strong>Usability Copilot</strong><small>{t('participant.studyLine', { title: study.title, participant })}</small></div></div><div className="actions"><span className="chip">{t('participant.cameraOffChip')}</span><ViewToggles pinnedLang /></div></header>
    <main className="sus">
      <span className="kicker">{t('participant.sus.kicker')}</span>
      <h1>{t('participant.post.title')}</h1>
      <p className="lede">{t('participant.sus.lede')}</p>
      <ol className="sus-items">
        {items.map((text, index) => <li key={index} className="panel">
          <fieldset>
            <legend>{index + 1}. {text}</legend>
            <div className="sus-scale">
              {scale.map((label, choice) => <label key={choice} className={answers[index] === choice + 1 ? 'on' : ''}>
                <input type="radio" name={`sus-${index}`} checked={answers[index] === choice + 1} onChange={() => setAnswers(current => current.map((answer, at) => (at === index ? choice + 1 : answer)))} />
                <span>{label}</span>
              </label>)}
            </div>
          </fieldset>
        </li>)}
      </ol>
      <div className="actions">
        <button className="btn primary" disabled={answered < 10} onClick={() => onDone(answers)}>{answered < 10 ? t('participant.sus.submitCount', { answered }) : t('participant.submit')}</button>
        <button className="btn ghost" onClick={() => onDone(null)}>{t('participant.sus.skip')}</button>
      </div>
    </main>
  </div>
}

// After the last task, as a short alternative to the SUS: UMUX-Lite, two
// 7-point statements. Optional; counts only when both are answered.
export function UmuxLiteForm({ study, participant, onDone }) {
  const t = useT()
  const items = umuxLiteItems(productFor(study), t.lang)
  const scale = umuxLiteScale(t.lang)
  const ends = [scale[0], scale[6]]
  const [answers, setAnswers] = useState([null, null])
  return <div className="screen">
    <header className="topbar"><div className="brand"><span className="mark">◎</span><div><strong>Usability Copilot</strong><small>{t('participant.studyLine', { title: study.title, participant })}</small></div></div><div className="actions"><ViewToggles pinnedLang /></div></header>
    <main className="sus">
      <span className="kicker">{t('participant.umux.kicker')}</span>
      <h1>{t('participant.post.title')}</h1>
      <p className="lede">{t('participant.umux.lede')}</p>
      <ol className="sus-items">
        {items.map((text, index) => <li key={index} className="panel">
          <fieldset>
            <legend>{index + 1}. {text}</legend>
            <div className="seq-scale">
              {[1, 2, 3, 4, 5, 6, 7].map(level => <label key={level} className={answers[index] === level ? 'on' : ''}>
                <input type="radio" name={`umux-${index}`} checked={answers[index] === level} onChange={() => setAnswers(current => current.map((answer, at) => (at === index ? level : answer)))} aria-label={levelName(t, level, ends)} />
                <span>{level}</span>
              </label>)}
            </div>
            <div className="seq-ends muted small"><span>1 · {scale[0]}</span><span>7 · {scale[6]}</span></div>
          </fieldset>
        </li>)}
      </ol>
      <div className="actions">
        <button className="btn primary" disabled={answers.includes(null)} onClick={() => onDone(answers)}>{answers.includes(null) ? t('participant.umux.submitBoth') : t('participant.submit')}</button>
        <button className="btn ghost" onClick={() => onDone(null)}>{t('participant.umux.skip')}</button>
      </div>
    </main>
  </div>
}
