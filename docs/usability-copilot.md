# Usability Copilot

A local-first assistant for usability tests. It does not replace the researcher: it flags moments worth reviewing, with the evidence for each, and the researcher confirms or rejects them.

Open `research.html` for the participant flow and `research.html#review` to review session files. On GitHub Pages: `/meme-recognition/research.html`.

## What is and isn't validated yet

| Part | Status |
| --- | --- |
| Signal detectors and candidate fusion | Unit-tested against hand-built sessions (`tests/research-signals.test.js`). |
| Gaze regression, accuracy measurement, fixations | Unit-tested on synthetic data (`tests/research-gaze.test.js`). |
| Whole participant and review flow | Run end to end in headless Chromium with a fake webcam. |
| Gaze accuracy with real people | **Not yet measured.** Literature suggests 2–4° for webcam trackers; the app measures each session and turns gaze off above 3°. |
| Whether flagged moments match real usability problems | **Not yet measured.** Needs the pilot below. |

## Session flow

1. **Consent:** what is recorded, what stays on the device, and what is sent. Camera signals are optional.
2. **Calibration (about 1 minute):** the participant looks at and clicks 9 dots, then 9 different dots. The first set fits the gaze model; the second measures its error. Gaze is used only when the mean error is at most 3° (about 141 CSS pixels; one CSS pixel is about 0.0213° at arm's length). Two retries are allowed, then the study continues without gaze.
3. **Tasks:** each task starts from a button. Clicking it doubles as a drift check, because people look at a button when they click it. A task ends on reaching its success page, on "I'm done", on "Skip task", or at its time limit.
4. **Finished:** the participant downloads the results file, opens the researcher review, or deletes everything.

## Signals

| Strength | Signal | Starting definition |
| --- | --- | --- |
| Strong | No response to a click | No DOM change, form change, focus or navigation within 3.5 s. Clicks on form fields and on empty page background are ignored. |
| Strong | Rage clicks | At least 4 clicks within 2 s and 60 px. |
| Strong | Going round in circles | Third visit to the same page within one task. |
| Strong | Timeout | The task's time limit was reached. |
| Medium | Idle | 8 s with no mouse, keyboard, scroll or click input. |
| Medium | Visual search | 6 or more jumps between areas within 10 s, with no click. Needs gaze. |
| Weak | Brow lowered | Brow-lowering score at least 0.15 above the calibrated baseline for 2 s or more. |
| Weak | Leaning in | Face at least 15% larger than the baseline for 2 s or more. |

A **candidate moment** is opened by any strong signal, or by a medium signal with a weak one within 5 s. Windows are padded by 2 s and overlapping windows in the same task merge. Confidence: **high** with two strong signals or a strong one plus anything else, **medium** with one strong signal, **low** with only medium plus weak.

These thresholds come from industry definitions (Sprig's rage and dead clicks) and the research plan. They are starting points, so replace them with values from pilot data. They live in `DEFAULTS` in `src/research/signals.js`, and sessions can be re-scored at any time because detection runs on the saved file.

## Testing your own prototype

1. Put the prototype's HTML pages under `public/` (for example `public/my-study/`). They must be served from the same origin so the recorder can see clicks and page changes.
2. Mark areas you want gaze data for with `data-aoi="name"`, such as the navigation, a button or the footer.
3. Describe the tasks in `src/research/study.js`: the start page, the success page (or `null` for "I'm done") and a time limit.

Figma prototypes are cross-origin, so the recorder cannot see inside them. Support through Figma's Embed Kit is planned.

## Session file

JSON, version 1. Times are milliseconds since the session started.

| Field | Contents |
| --- | --- |
| `study`, `participant`, `startedAt` | Study id and title, random participant code, start time. |
| `viewport` | Size of the test page frame, used to replay positions. |
| `quality` | `gazeEnabled`, gaze `accuracy` (px and degrees), frames with and without a face, `driftChecks`. |
| `baseline` | Median brow-lowering score and face size from calibration. |
| `tasks` | Id, prompt, start, end and outcome (`success`, `self-reported`, `unverified`, `skipped`, `timeout`). |
| `events` | `click`, `navigate`, `mutation`, `change`, `focus`, `scroll`, `activity`. |
| `gaze` | `{ t, page, x, y }` in page document coordinates. |
| `face` | `{ t, brow, scale }`. |
| `aois` | Areas of interest per page, in document coordinates. |
| `reviews` | Added by the review screen: status and 0–4 severity per moment. |

## Pilot protocol

1. Get ethics approval first (course-based research with video or face analysis usually needs it).
2. Run 5–8 participants on the study.
3. Two researchers independently mark usability problems from their own observation. Agree on ground truth when Cohen's κ ≥ 0.6.
4. Compare with the flagged moments: aim for recall ≥ 0.8 on severity 3–4 problems and precision ≥ 0.5.
5. Measure review time with and without the Copilot, alternating the order.
6. Report gaze accuracy by lighting, glasses, skin tone and camera type, and note any group where it is worse.
