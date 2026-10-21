import React, { useEffect, useRef, useState } from 'react'
import { averageVectors, createLeaderTracker, EXPRESSION_KEYS, expressionDelta, expressionStrength, expressionVector, rankMatches } from './lookalike'
import { MEME_LIBRARY } from './meme-library'

const ASSET_BASE = import.meta.env.BASE_URL
const CHALLENGE_MS = 5000
const CAPTURE_MS = 1200
const UPDATE_MS = 100
// Below this (calibrated) expression strength the face is effectively neutral.
const NEUTRAL_STRENGTH = 0.25

const imageUrl = meme => `${ASSET_BASE}${meme.image}`
const percent = score => `${Math.round(Math.max(0, score) * 100)}%`
const vectorOf = reference => reference?.you || reference?.photo || null
const noLiveFace = { face: false, ranking: [], leader: null, strength: 0, calibrated: false }

// Shared state for the lookalike panel and library: reference vectors per meme,
// the live ranking, the record-your-own capture, and the timed challenge.
export function useLookalike({ active, cameraState, subscribeFrames, analyzeImages }) {
  const [references, setReferences] = useState({})
  const [analysis, setAnalysis] = useState('idle')
  const [live, setLive] = useState(noLiveFace)
  const [capture, setCapture] = useState(null)
  const [challenge, setChallenge] = useState(null)
  const session = useRef({ references, capture: null, challenge: null, analysis: 'idle' })
  const tracker = useRef(createLeaderTracker()).current
  session.current.references = references

  useEffect(() => {
    if (cameraState !== 'live') setLive(noLiveFace)
  }, [cameraState])

  // Meme photos are analysed once per page visit; a failed attempt (e.g. the
  // camera stopped mid-way) retries the next time the camera goes live.
  useEffect(() => {
    if (!active || cameraState !== 'live' || session.current.analysis === 'running' || session.current.analysis === 'done') return
    session.current.analysis = 'running'
    setAnalysis('running')
    const images = MEME_LIBRARY.map(meme => ({ id: meme.id, url: new URL(imageUrl(meme), location.href).href }))
    analyzeImages(images)
      .then(results => {
        setReferences(current => {
          const next = { ...current }
          results.forEach(({ id, categories, error }) => {
            next[id] = { ...next[id], photo: categories ? expressionVector(categories) : null, error: categories ? null : error || 'No face found' }
          })
          return next
        })
        session.current.analysis = 'done'
        setAnalysis('done')
      })
      .catch(error => {
        console.warn('Meme photo analysis failed', error)
        session.current.analysis = 'failed'
        setAnalysis('failed')
      })
  }, [active, cameraState, analyzeImages])

  useEffect(() => {
    if (!active) return undefined
    let lastUpdate = 0
    return subscribeFrames(frame => {
      const state = session.current
      const now = frame.timestamp
      const categories = frame.faceResult?.faceBlendshapes?.[0]?.categories
      const vector = categories?.length ? expressionVector(categories) : null
      const rest = frame.baseline?.blendshapes ? expressionVector(frame.baseline.blendshapes) : null

      if (state.capture) {
        if (vector) state.capture.samples.push(vector)
        const progress = Math.min(1, (now - state.capture.startedAt) / CAPTURE_MS)
        if (progress >= 1) {
          const { id, samples } = state.capture
          state.capture = null
          if (samples.length >= 3) setReferences(current => ({ ...current, [id]: { ...current[id], you: averageVectors(samples) } }))
          setCapture(samples.length >= 3 ? null : { id, progress: 0, error: 'No face seen · try again' })
        } else setCapture({ id: state.capture.id, progress })
      }

      const pool = MEME_LIBRARY.filter(meme => vectorOf(state.references[meme.id])).map(meme => ({ id: meme.id, vector: vectorOf(state.references[meme.id]) }))
      const ranking = vector ? rankMatches(vector, pool, rest) : []
      const leader = tracker(ranking)

      let challengeChanged = false
      if (state.challenge && !state.challenge.done) {
        const current = ranking.find(match => match.id === state.challenge.id)?.score || 0
        state.challenge.current = current
        state.challenge.best = Math.max(state.challenge.best, current)
        state.challenge.remaining = Math.max(0, state.challenge.endsAt - now)
        if (now >= state.challenge.endsAt) { state.challenge.done = true; challengeChanged = true }
      }

      if (now - lastUpdate < UPDATE_MS && !challengeChanged) return
      lastUpdate = now
      setLive(vector ? { face: true, ranking, leader, strength: expressionStrength(expressionDelta(vector, rest)), calibrated: Boolean(rest) } : noLiveFace)
      if (state.challenge) setChallenge({ ...state.challenge })
    })
  }, [active, subscribeFrames, tracker])

  const startChallenge = () => {
    const ready = MEME_LIBRARY.filter(meme => vectorOf(session.current.references[meme.id]))
    if (!ready.length) return
    const options = ready.length > 1 ? ready.filter(meme => meme.id !== session.current.challenge?.id) : ready
    const target = options[Math.floor(Math.random() * options.length)]
    const now = performance.now()
    session.current.challenge = { id: target.id, endsAt: now + CHALLENGE_MS, remaining: CHALLENGE_MS, best: 0, current: 0, done: false }
    setChallenge({ ...session.current.challenge })
  }
  const endChallenge = () => {
    session.current.challenge = null
    setChallenge(null)
  }
  const captureReference = id => {
    session.current.capture = { id, startedAt: performance.now(), samples: [] }
    setCapture({ id, progress: 0 })
  }
  const resetReference = id => setReferences(current => ({ ...current, [id]: { ...current[id], you: null } }))

  return { references, analysis, live, capture, challenge, startChallenge, endChallenge, captureReference, resetReference }
}

function RankedList({ ranking, references }) {
  const missing = MEME_LIBRARY.filter(meme => !vectorOf(references[meme.id]))
  return <ol className="lookalike-ranking">
    {ranking.map(match => {
      const meme = MEME_LIBRARY.find(item => item.id === match.id)
      return <li key={match.id}><img src={imageUrl(meme)} alt="" /><span>{meme.title}</span><span className="match-bar"><i style={{ width: percent(match.score) }} /></span><b>{percent(match.score)}</b></li>
    })}
    {missing.map(meme => <li key={meme.id} className="is-missing"><img src={imageUrl(meme)} alt="" /><span>{meme.title}</span><span className="match-bar" /><b>record ↓</b></li>)}
  </ol>
}

function ChallengeView({ challenge, onNext, onEnd }) {
  const meme = MEME_LIBRARY.find(item => item.id === challenge.id)
  return <div className="lookalike-match is-challenge">
    <img src={imageUrl(meme)} alt={meme.title} />
    <div className="lookalike-copy">
      <span className="panel-kicker">{challenge.done ? 'CHALLENGE COMPLETE' : 'COPY THIS FACE'}</span>
      <strong>{meme.title}</strong>
      <p>{meme.hint}</p>
      {challenge.done
        ? <><div className="lookalike-score">{percent(challenge.best)}</div><small>best match in 5 seconds</small><div className="lookalike-actions"><button className="primary-button" onClick={onNext}>Next face</button><button className="secondary-button" onClick={onEnd}>Done</button></div></>
        : <><div className="lookalike-score">{Math.ceil(challenge.remaining / 1000)}s</div><small>now {percent(challenge.current)} · best {percent(challenge.best)}</small><span className="match-bar is-large"><i style={{ width: percent(challenge.current) }} /></span></>}
    </div>
  </div>
}

export function LookalikePanel({ lookalike, cameraState }) {
  const { analysis, live, references, challenge } = lookalike
  const ready = MEME_LIBRARY.some(meme => vectorOf(references[meme.id]))
  const leader = MEME_LIBRARY.find(meme => meme.id === live.leader)
  const leaderMatch = live.ranking.find(match => match.id === live.leader)
  const neutral = live.calibrated && live.strength < NEUTRAL_STRENGTH

  let stage
  if (cameraState !== 'live') stage = <div className="empty-reaction"><span>◎</span><p>Enable the camera to compare<br />your face with the memes</p></div>
  else if (analysis === 'running' || analysis === 'idle') stage = <div className="empty-reaction"><span>◌</span><p>Reading the meme faces…</p></div>
  else if (!ready) stage = <div className="empty-reaction"><span>◎</span><p>No meme face could be read.<br />Record your own version below.</p></div>
  else if (challenge) stage = <ChallengeView challenge={challenge} onNext={lookalike.startChallenge} onEnd={lookalike.endChallenge} />
  else if (!live.face) stage = <div className="empty-reaction"><span>◎</span><p>Looking for your face…</p></div>
  else stage = <div className="lookalike-match">
    {leader && <img src={imageUrl(leader)} alt={leader.title} />}
    <div className="lookalike-copy">
      <span className="panel-kicker">{neutral ? 'RESTING FACE' : 'YOU LOOK LIKE'}</span>
      <strong>{neutral ? 'Make an expression' : leader?.title}</strong>
      <p>{neutral ? 'Your face is close to its calibrated resting state.' : leaderMatch?.mirrored ? 'Matched as a mirror image.' : leader?.hint}</p>
      {!neutral && leaderMatch && <div className="lookalike-score">{percent(leaderMatch.score)}</div>}
      <RankedList ranking={live.ranking} references={references} />
    </div>
  </div>

  const badge = cameraState !== 'live' ? 'WAITING' : challenge && !challenge.done ? 'CHALLENGE' : live.face ? 'MATCHING' : 'SEARCHING'
  return <section className="reaction-panel lookalike-panel panel">
    <div className="panel-heading"><div><span className="panel-kicker">MEME LOOKALIKE</span><h2>Which meme are you?</h2></div><span className={`status-badge ${live.face ? 'fired' : ''}`}>{badge}</span></div>
    <div className="reaction-stage">{stage}</div>
    <div className="reaction-footer"><span>{live.calibrated ? 'Calibrated · resting face removed' : 'Tip · calibrate first for sharper matches'}</span>{challenge ? <button className="text-button" onClick={lookalike.endChallenge}>End challenge ↗</button> : <button className="text-button" disabled={!ready || cameraState !== 'live'} onClick={lookalike.startChallenge}>Start 5-second challenge ↗</button>}</div>
  </section>
}

export function LookalikeLibrary({ lookalike, cameraState }) {
  const { references, analysis, capture, captureReference, resetReference } = lookalike
  const live = cameraState === 'live'
  const sourceLabel = reference => {
    if (reference?.you) return 'Using your recorded version'
    if (reference?.photo) return 'Read from the photo'
    if (reference?.error) return 'No face found in this image · record yours'
    return analysis === 'running' ? 'Reading…' : 'Waiting for the camera'
  }
  return <section className="lookalike-library panel">
    <div className="panel-heading"><div><span className="panel-kicker">MEME LIBRARY</span><h2>Reference faces</h2></div><span className="log-caption">{EXPRESSION_KEYS.length} expression scores · local only</span></div>
    <div className="library-grid">{MEME_LIBRARY.map(meme => {
      const reference = references[meme.id]
      const capturing = capture?.id === meme.id
      return <article className="library-card" key={meme.id}>
        <img src={imageUrl(meme)} alt={meme.title} />
        <div>
          <strong>{meme.title}</strong>
          <p>{meme.hint}</p>
          <small className={reference?.error && !reference?.you ? 'is-warning' : ''}>{capturing && capture.error ? capture.error : sourceLabel(reference)}</small>
          <div className="library-actions">
            <button className="secondary-button" disabled={!live || Boolean(capture && !capture.error)} onClick={() => captureReference(meme.id)}>{capturing && !capture.error ? `Hold it… ${percent(capture.progress)}` : 'Use my face'}</button>
            {reference?.you && <button className="text-button" onClick={() => resetReference(meme.id)}>Reset</button>}
          </div>
        </div>
      </article>
    })}</div>
    <p className="library-note">How matching works · each face becomes a list of {EXPRESSION_KEYS.length} muscle-movement scores (blendshapes). Cosine similarity compares the direction of two lists, so a small smile and a big smile still match. Calibrating first subtracts your resting face, and left/right are also compared mirrored.</p>
  </section>
}
