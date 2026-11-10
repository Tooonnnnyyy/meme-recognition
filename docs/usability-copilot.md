# Usability Copilot

A local-first assistant for usability tests. It does not replace the researcher: it flags moments worth reviewing, with the evidence for each, and the researcher confirms or rejects them.

Open `research.html` for the participant flow and `research.html#review` to review session files. On GitHub Pages: `/meme-recognition/research.html`.

## What is and isn't validated yet

| Part | Status |
| --- | --- |
| Signal detectors and candidate fusion | Unit-tested against hand-built sessions (`tests/research-signals.test.js`). |
| Recorder: page names, click labels, fixed areas, face baseline | Unit-tested with stand-in pages, no browser (`tests/research-recorder.test.js`). |
| Gaze regression, accuracy measurement, fixations, gaze areas | Unit-tested on synthetic data (`tests/research-gaze.test.js`). |
| Whole participant and review flow | Run end to end in headless Chromium with a fake webcam. |
| Gaze accuracy with real people | **Not yet measured.** Literature suggests 2–4° for webcam trackers; the app measures each session and turns gaze off above 3°. |
| Whether flagged moments match real usability problems | **Not yet measured.** Needs the pilot below. |

## Session flow

1. **Consent:** what is recorded, what stays on the device, and what is sent. Camera signals are optional.
2. **Calibration (about 1 minute):** the participant looks at and clicks 9 dots, then 9 different dots. The first set fits the gaze model; the second measures its error. Gaze is used only when the mean error is at most 3° (about 141 CSS pixels; one CSS pixel is about 0.0213° at arm's length). Two retries are allowed, then the study continues without gaze.
3. **Tasks:** each task starts from a button. Clicking it doubles as a drift check, because people look at a button when they click it. A task ends on reaching its success page, on "I'm done", on "Skip task", or at its time limit. "Stop and delete" ends the session at any time. If the camera stops, the session goes on without it.
4. **Finished:** the participant downloads the results file, opens the researcher review, or deletes their data. "Delete my data" clears the page but cannot remove a file already downloaded; the deleted screen says so.

The session exists only in the tab, so from the start of recording until the file is downloaded the page asks before a reload or close. `#review` switches to the review screen and Back returns, except while a session is being recorded. Unexported reviews survive Back and Forward, and the page asks before a reload or close while any are unexported. "Delete my data" and "Stop and delete" also close the review screen, dropping its unexported reviews. Each press of "Review this session" offers the session just recorded, asking first if the open file has unexported reviews.

## Signals

| Strength | Signal | Starting definition |
| --- | --- | --- |
| Strong | No response to a click | No DOM change, form change, navigation, or focus on another element after the click, within 3.5 s and before the next click on a different element. "After" goes by event order, so a change in the press's own millisecond counts. A form change counts only on the clicked field or the field a clicked `<label>` controls, not on a field the press made lose focus. The same element means the same selector and label, pressed within 60 px: pressing it again does not close the window, and repeats on it (within 60 px and 10 s) merge. Clicks outside tasks, on form fields and on the page `<body>` itself are ignored; clicks on text and other non-interactive elements count, and are described by their area when they have no label. A click is not judged if the task ends before its window closes. |
| Strong | Rage clicks | At least 4 clicks within 2 s and 60 px, in one task. |
| Strong | Going round in circles | Third visit to the same page within one task. |
| Strong | Timeout | The task's time limit was reached. |
| Medium | Idle | 8 s with no mouse, keyboard, scroll or click input and no navigation, counted from the end of the last burst of input. |
| Medium | Visual search | 6 or more jumps between areas within 10 s, with no click. Only jumps between areas further apart than the AOI margin count, since gaze error cannot tell adjacent or nested areas apart. Needs gaze. |
| Weak | Brow lowered | Brow-lowering score at least 0.15 above the baseline for 2 s or more. |
| Weak | Leaning in | Face at least 15% larger than the baseline for 2 s or more. |

The face **baseline** is the median of the calibration frames when calibration saw at least 15 with a face. Otherwise it is taken from the first 30 task frames with a face (marked `from: 'tasks'`), so the face signals still work.

**Gaze areas.** Each fixation is matched to one area (`data-aoi`). Areas grow by the session's measured gaze error, at least 40 px, and the smallest area in reach wins, the nearest on ties. A fixation inside an area is not taken by a grown neighbour, only by an area nested inside it, so a near miss on a button in a form still goes to the button. Nesting allows 2 px of slack, and area edges are recorded rounded, so a child flush with its container's edge still counts as inside it. A fixation on a fixed area, such as a fixed footer, ignores the areas scrolling under it.

A **candidate moment** is opened by any strong signal, or by a medium signal with a weak one within 5 s. Windows are padded by 2 s and overlapping windows in the same task merge. Confidence: **high** with two strong signals or a strong one plus anything else, **medium** with one strong signal, **low** with only medium plus weak. A moment's id is `<taskId>-<kind>-<start ms>` of the signal that opened it, a strong one if there is one (for example `T2-dead-click-48210`), so saved reviews stay with their moments when a session is re-scored.

These thresholds come from industry definitions (Sprig's rage and dead clicks) and the research plan. They are starting points, so replace them with values from pilot data. They live in `DEFAULTS` in `src/research/signals.js`, and sessions can be re-scored at any time because detection runs on the saved file.

## Testing your own prototype

1. Put the prototype's HTML pages in a folder under `public/`, for example `public/my-study/`. Sub-folders are fine. The pages must be served from the same origin so the recorder can see clicks and page changes.
2. Mark areas you want gaze data for with `data-aoi="name"`, such as the navigation, a button or the footer.
3. In `src/research/study.js`, set `siteBase` to the folder's path under `public/`, with a trailing slash (`'my-study/'`). Then describe each task:
   - `start`: the file the task opens, relative to `siteBase` (`'index.html'`).
   - `successPage`: the page whose arrival completes the task, as its page id: its path under `siteBase` without `.html` (`'checkout/done'` for `public/my-study/checkout/done.html`, `'cart/index'` for `cart/` or `cart/index.html`). Use `null` to let the participant click "I'm done". Any visit to that page counts as success, so make it reachable only by doing the task right.
   - `limitSec`: the time limit in seconds.

Figma prototypes are cross-origin, so the recorder cannot see inside them. Support through Figma's Embed Kit is planned.

## Session file

JSON, version 1. Times are milliseconds since the session started. Pages are named by their page id, their path under `siteBase` without `.html`, such as `order-48213` or `cart/index`.

| Field | Contents |
| --- | --- |
| `study`, `participant`, `startedAt` | Study id, title and `siteBase`, random participant code, start time. |
| `viewport` | Size of the test page frame, used to replay positions. |
| `quality` | `gazeEnabled`, gaze `accuracy` (px and degrees), `frames` and `faceFrames` (camera frames during tasks, and those with a face), `driftChecks`, and `cameraLost` `{ t, taskId, reason }` if the camera stopped. There are no gaze or face samples after `t`, and the review screen shows when the camera was lost. |
| `baseline` | `{ brow, scale }`, the face baseline (see Signals), with `from: 'tasks'` when it came from the tasks; `null` without one. |
| `tasks` | Id, prompt, start, end and outcome (`success`, `self-reported`, `unverified`, `skipped`, `timeout`). |
| `events` | `click`, `navigate`, `mutation`, `change`, `focus`, `scroll`, `activity`, each with `t` and `taskId` (`null` between tasks). A click keeps its position and a `target`: selector, label, whether it is interactive or a form field, its area, and for a `<label>` the selector of the field it `controls`. `change` and `focus` have the changed or focused element's `selector`. `scroll` has the scroll offset. `activity` (mouse movement, key presses, scrolling) is a time only. Throttled events (`mutation`, `scroll`, `activity`) carry `last`, the time of the last event folded into them. |
| `gaze` | `{ t, page, x, y, sx, sy }`: x, y in the page's document coordinates; sx, sy its scroll offset at that moment. |
| `face` | `{ t, brow, scale }`. |
| `aois` | Areas of interest per page, `{ id, rect }`, in document coordinates. Areas inside a `position: fixed` element are in viewport coordinates and marked `fixed: true`, so scrolling does not move them. Sticky elements are treated as in-flow. |
| `reviews` | Added by the review screen, keyed by moment id: `status` (`open`, `confirmed`, `rejected`), `severity` 0–4 or `null`, and `moment` `{ taskId, start, end, signals }` (signal kinds), the moment as it was when reviewed. |

Typed text and text-field values are never stored. For a choice (radio, checkbox, option button) the label of the option clicked is stored, as for any click. A click label is the visible text of the button, link or other control (without any fields, editable areas or hidden or screen-reader-only parts inside it) or its `aria-label`; for a form field, its `aria-label`, associated `<label>`, placeholder or name. Button-type inputs use their caption (`value`). Other elements are named only by `aria-label`, since their text may echo what was typed. If a prototype shows typed text inside a control (a to-do item rendered as a `<label>`, a search suggestion link), that text is stored as the control's label; give such controls an `aria-label` if that matters for the study.

The review screen checks every field before opening a file and says which one is missing or not in the expected format. Page names and `siteBase` must stay inside the study site, since the replay loads them.

## Pilot protocol

1. Get ethics approval first (course-based research with video or face analysis usually needs it).
2. Run 5–8 participants on the study.
3. Two researchers independently mark usability problems from their own observation. Agree on ground truth when Cohen's κ ≥ 0.6.
4. Compare with the flagged moments: aim for recall ≥ 0.8 on severity 3–4 problems and precision ≥ 0.5.
5. Measure review time with and without the Copilot, alternating the order.
6. Report gaze accuracy by lighting, glasses, skin tone and camera type, and note any group where it is worse.
