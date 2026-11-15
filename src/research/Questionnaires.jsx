import React, { useState } from 'react'
import { ThemeToggle } from '../ThemeToggle'
import { SEQ_ENDS, SEQ_QUESTION, SUS_SCALE, susItems, umuxLiteItems } from './questionnaire'

// After each task: the Single Ease Question, 1–7. Optional.
export function SeqRating({ taskNumber, outcome, onDone }) {
  const [value, setValue] = useState(null)
  return <div className="panel intro-card seq-card">
    {outcome && <span className="chip live">TASK {taskNumber} · {outcome.toUpperCase()}</span>}
    <span className="kicker">Quick rating</span>
    <fieldset className="seq">
      <legend><h2>{SEQ_QUESTION}</h2></legend>
      <div className="seq-scale">
        {[1, 2, 3, 4, 5, 6, 7].map(level => <label key={level} className={value === level ? 'on' : ''}>
          <input type="radio" name="seq" value={level} checked={value === level} onChange={() => setValue(level)} />
          <span>{level}</span>
        </label>)}
      </div>
      <div className="seq-ends muted small"><span>1 · {SEQ_ENDS[0]}</span><span>7 · {SEQ_ENDS[1]}</span></div>
    </fieldset>
    <div className="actions">
      <button className="btn primary" disabled={value == null} onClick={() => onDone(value)}>Continue</button>
      <button className="btn ghost" onClick={() => onDone(null)}>Skip this question</button>
    </div>
  </div>
}

// After the last task: the System Usability Scale. Optional, and it counts
// only when all ten items are answered.
export function SusForm({ study, participant, onDone }) {
  const items = susItems(study.kind === 'figma' ? 'prototype' : 'website')
  const [answers, setAnswers] = useState(Array(10).fill(null))
  const answered = answers.filter(Boolean).length
  return <div className="screen">
    <header className="topbar"><div className="brand"><span className="mark">◎</span><div><strong>Usability Copilot</strong><small>Study · {study.title} · participant {participant}</small></div></div><div className="actions"><span className="chip">CAMERA OFF</span><ThemeToggle /></div></header>
    <main className="sus">
      <span className="kicker">Last step · 10 questions · optional</span>
      <h1>How was it overall?</h1>
      <p className="lede">Answer with your first impression; there are no right answers. Some statements are positive and some negative, so read each one.</p>
      <ol className="sus-items">
        {items.map((text, index) => <li key={index} className="panel">
          <fieldset>
            <legend>{index + 1}. {text}</legend>
            <div className="sus-scale">
              {SUS_SCALE.map((label, choice) => <label key={label} className={answers[index] === choice + 1 ? 'on' : ''}>
                <input type="radio" name={`sus-${index}`} checked={answers[index] === choice + 1} onChange={() => setAnswers(current => current.map((answer, at) => (at === index ? choice + 1 : answer)))} />
                <span>{label}</span>
              </label>)}
            </div>
          </fieldset>
        </li>)}
      </ol>
      <div className="actions">
        <button className="btn primary" disabled={answered < 10} onClick={() => onDone(answers)}>{answered < 10 ? `Answer all 10 to submit (${answered}/10)` : 'Submit'}</button>
        <button className="btn ghost" onClick={() => onDone(null)}>Skip the questionnaire</button>
      </div>
    </main>
  </div>
}

// After the last task, as a short alternative to the SUS: UMUX-Lite, two
// 7-point statements. Optional; counts only when both are answered.
export function UmuxLiteForm({ study, participant, onDone }) {
  const items = umuxLiteItems(study.kind === 'figma' ? 'prototype' : study.kind === 'observed' ? 'product' : 'website')
  const [answers, setAnswers] = useState([null, null])
  return <div className="screen">
    <header className="topbar"><div className="brand"><span className="mark">◎</span><div><strong>Usability Copilot</strong><small>Study · {study.title} · participant {participant}</small></div></div><div className="actions"><ThemeToggle /></div></header>
    <main className="sus">
      <span className="kicker">Last step · 2 questions · optional</span>
      <h1>How was it overall?</h1>
      <p className="lede">Choose how much you agree, from 1 (strongly disagree) to 7 (strongly agree).</p>
      <ol className="sus-items">
        {items.map((text, index) => <li key={index} className="panel">
          <fieldset>
            <legend>{index + 1}. {text}</legend>
            <div className="seq-scale">
              {[1, 2, 3, 4, 5, 6, 7].map(level => <label key={level} className={answers[index] === level ? 'on' : ''}>
                <input type="radio" name={`umux-${index}`} checked={answers[index] === level} onChange={() => setAnswers(current => current.map((answer, at) => (at === index ? level : answer)))} />
                <span>{level}</span>
              </label>)}
            </div>
            <div className="seq-ends muted small"><span>1 · Strongly disagree</span><span>7 · Strongly agree</span></div>
          </fieldset>
        </li>)}
      </ol>
      <div className="actions">
        <button className="btn primary" disabled={answers.includes(null)} onClick={() => onDone(answers)}>{answers.includes(null) ? 'Answer both to submit' : 'Submit'}</button>
        <button className="btn ghost" onClick={() => onDone(null)}>Skip the questions</button>
      </div>
    </main>
  </div>
}
