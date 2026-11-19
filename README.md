# Usability Lab · Gesture Meme Studio

> Local-first tools that run entirely in the browser: **Usability Lab** plans, runs and reports usability tests; **Gesture Meme Studio** turns your webcam into a playful gesture controller. No account, no backend, nothing uploaded.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![MediaPipe](https://img.shields.io/badge/MediaPipe-Tasks-0F9D58)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Privacy](https://img.shields.io/badge/data-local%20only-D8F36B?labelColor=1B1B1A)

## Links

| What | Link |
| --- | --- |
| **Usability Lab** (researcher workspace) | https://tooonnnnyyy.github.io/meme-recognition/lab.html |
| Participant test (demo study) | https://tooonnnnyyy.github.io/meme-recognition/research.html |
| Review one session file | https://tooonnnnyyy.github.io/meme-recognition/research.html#review |
| Study report (many files) | https://tooonnnnyyy.github.io/meme-recognition/research.html#report |
| Figma study setup (link-based) | https://tooonnnnyyy.github.io/meme-recognition/research.html#setup |
| Gesture Meme Studio | https://tooonnnnyyy.github.io/meme-recognition/ |
| Figma prototype kit (practice prototype, Lab UI, components; owner's Figma team, ask for access) | https://www.figma.com/design/6SMUW9DjvtgLiGc8FjVY3C |
| Usability Lab guide | [docs/usability-lab.md](docs/usability-lab.md) |
| Usability Copilot details (signals, session file, own prototypes) | [docs/usability-copilot.md](docs/usability-copilot.md) |
| Product strategy (Chinese) | [docs/strategy/usability-lab-product-line.zh.md](docs/strategy/usability-lab-product-line.zh.md) |

Works best in a desktop Chrome or Edge. Data is stored only in your own browser; back it up with **Export**.

## How to use Usability Lab

### Try it in five minutes

1. Open [Usability Lab](https://tooonnnnyyy.github.io/meme-recognition/lab.html) and click **Try the demo study**.
2. Go to **Run** → **Run a pilot**. Tick the consent box and click **Begin session**.
3. Press **Enter** to start a task. While it runs, press **P** (problem), **Q** (quote), **N** (note), **A** (assist) or **E** (error), type the note and press **Enter** to add it (**Esc** leaves the note field). Add `#tags` to group notes across participants.
4. End the task with **1** success, **2** partial, **3** failed or gave up, **4** skipped. The participant rates how easy it was, and answers the SUS at the end.
5. Open **Results** → **Review** to see the session, or **Report** for the study as a whole.

### Run a real study (moderated, on your computer)

1. **New study → Plan.** Give it a title and choose:
   - **How sessions run:** *Moderated, on this computer*.
   - **What participants use:**
     - *Any prototype or app*: a live website, a mobile app, ProtoPie, Axure, or paper;
     - *Figma prototype*: paste the prototype link;
     - *Demo shop*.
2. **Tasks.** For each task, write what the participant reads and what success looks like, and set a time limit. Write the success criteria before the sessions, so every participant is judged the same way.
3. **Questions and design.**
   - Choose SEQ after each task, and SUS or UMUX-Lite at the end.
   - Turn on counterbalancing (Williams Latin square) for 2 or more tasks.
   - Set the number of planned participants (5 finds most big problems).
4. **Documents.** Fill in your name, institution, contact, purpose and ethics board, then download:
   - the **consent form** draft (TCPS 2 elements);
   - the **data management statement**.

   Adapt both to your ethics board's template, and fill in the parts in [brackets], such as the funder and any conflicts of interest.
5. **Run.**
   - Start with a pilot on yourself; pilots stay out of the report.
   - Then run P01, P02… Every note and outcome is saved as it happens.
6. **Results and Report.**
   - Review each session.
   - Open the report: completion (including partial success), time on task, ease (SEQ), SUS or UMUX-Lite, observed problems grouped by `#tag`, and quotes.
   - Export it as Markdown or CSV for your write-up.

### Run an unmoderated study (by link)

- **Figma:** in Plan choose *Unmoderated, by link* and *Figma prototype*, paste the prototype link and a **Figma client ID**, then copy the participant link from **Run**.
  - To get a client ID, create an app in Figma's developer settings and allow `https://tooonnnnyyy.github.io` as an embed origin.
- **Participants:** they open the link, work through the tasks, and download a results file at the end. Add the files under **Run → Add results files**.

### Practise with the Figma prototype kit

The [Figma prototype kit](https://www.figma.com/design/6SMUW9DjvtgLiGc8FjVY3C) holds a clickable "drop a course" prototype of a fictional university portal with five planted usability problems. Its **00 Guide** page lists:
- the tasks and their success criteria;
- an answer key for instructors;
- the steps to run it in Usability Lab.

### Move or back up your data

- **Export** on a study card saves the study and its sessions as one file.
- **Back up all** saves everything.
- **Import** restores a file on another computer.
- Clearing the browser's site data deletes the workspace, so export first.

## Gesture Meme Studio

Gesture Meme Studio turns a webcam into an expressive controller. Hold an illustrated action, let the on-device vision layer recognize it, and see a matching meme-style reaction appear — or switch to **Meme lookalike** and find out which meme face you are making. Open it at https://tooonnnnyyy.github.io/meme-recognition/, select **Enable camera**, and hold one of the ten actions until the reaction fires.

### What it does

- Detects face, hand, and pose signals from a live browser camera.
- Runs the models in a background **Web Worker**, on the **GPU** when real graphics hardware is available and on the CPU otherwise, so the page stays responsive.
- **Calibrates** to your resting face (2 seconds, press **C**) so mouth, eye, and head-tilt rules start from your neutral expression instead of a one-size-fits-all threshold.
- Smooths landmark jitter with a One Euro filter and ignores body points the pose model only guessed.
- Shows a visual line-art guide and plain-language instruction for each action.
- Uses a stability gate (a steady ~0.2 s hold) and cooldown so a held pose triggers once rather than repeatedly.
- Draws a local landmark overlay and exposes candidate, confidence, engine, and speed in the HUD.
- Keeps keyboard and button controls as clearly labelled **simulation** tools for UI review.

### Modes

**Meme reactions** — hold one of ten poses to fire a reaction card.

| Face | Hands / body |
| --- | --- |
| Open mouth · close both eyes · point to temple + tilt · stick out tongue | Heart hands · hand up · thumbs up · open palm · cover nose · hands on head |

**Meme lookalike** — your expression is compared with every meme face in [`src/meme-library.js`](src/meme-library.js) and the closest one is shown with a match score. Start the **5-second challenge** to copy a random meme as closely as you can. Photos of real faces are read automatically; for cartoons or animals, press **Use my face** to record your own version. To add a meme, drop an image into `public/reactions/` and add one line to the library.

## Usability Copilot (participant runtime)

`research.html` turns the same on-device vision engine into a usability-testing assistant. A participant works through tasks on a website while the page records clicks, page changes, approximate gaze areas and facial movement. Afterwards it flags the moments where they probably got stuck, so a researcher reviews those instead of a whole recording.

- **Participant flow:** consent, then a 1-minute calibration whose accuracy is measured on separate dots, then the tasks, then the participant downloads or deletes a results file. Gaze is used only when validation error is at most 3°; the camera is optional.
- **Signals:** unanswered clicks, rage clicks, going round in circles between pages and timeouts (strong); idle periods and visual search, where gaze jumps between areas without a click (medium); held brow lowering or leaning in (weak). A strong signal flags a moment on its own; medium and weak ones only together. Emotions are never inferred.
- **Researcher review:** open `research.html#review`, load a session file, confirm or reject each flagged moment with a 0–4 severity, and export the reviewed file. Files are read locally.
- **Demo:** a fictional shop in `public/research-site/` contains three planted usability problems for the demo study.

- **Usability Lab (`lab.html`):** the researcher workspace. Plan studies without code, run moderated sessions on this computer with a task console, quick keyboard notes (#tags), outcomes including partial success and counterbalanced task order, generate a TCPS 2 consent draft and a data management statement, and get a report that combines observed and detected problems. Everything stays in this browser; studies export as package files. See [docs/usability-lab.md](docs/usability-lab.md).
- **Questionnaires and study report:** an ease rating (SEQ) after each task and the System Usability Scale at the end, both optional. `research.html#report` combines every participant's file: completion rates, time on task and ease with 95% intervals, the SUS score and grade, and problems ranked by severity and frequency, exported as Markdown or CSV.
- **Figma prototypes:** open `research.html#setup`, paste a Figma prototype link and a client ID, write the tasks, and send participants the link it makes. Unanswered clicks come from Figma's own hotspot report; frames give page loops and goal completion.

Details, thresholds, the session file format and how to test your own prototype: [docs/usability-copilot.md](docs/usability-copilot.md).

## Run locally

```bash
npm install --prefer-offline --no-audit --no-fund
npm run dev -- --host 127.0.0.1 --port 4185 --strictPort
```

Open [http://127.0.0.1:4185/](http://127.0.0.1:4185/) in Chrome, select **Enable camera**, and copy one of the action guides. Hold a pose briefly until the HUD locks a candidate and the reaction fires. Usability Lab runs at [http://127.0.0.1:4185/lab.html](http://127.0.0.1:4185/lab.html) and the participant runtime at [http://127.0.0.1:4185/research.html](http://127.0.0.1:4185/research.html).

## Verify

```bash
npm test
npm run vision:check
npm run build
```

### Updating MediaPipe

The WASM runtime in `public/vision/wasm/` must come from the same `@mediapipe/tasks-vision` release as the JavaScript package. After bumping the package (for example a Dependabot PR), run `npm run vision:sync` and commit the copied files. CI runs `npm run vision:check` and fails while they differ.

## Free deployment

This repository includes a GitHub Actions workflow at `.github/workflows/deploy-pages.yml`.
After enabling **Settings → Pages → Source: GitHub Actions** once in the GitHub repository,
each push to `main` runs the tests, builds the app, and deploys it to:

```text
https://tooonnnnyyy.github.io/meme-recognition/
```

No GCP project, API key, database, or backend is required. The app is a static Vite build;
camera access works on the HTTPS GitHub Pages URL. Vercel, Netlify, and Cloudflare Pages are
also suitable free hosts, but their project settings should use the repository root, `npm ci`,
`npm run build`, and `dist` as the output directory.

The first Pages deployment still requires repository-owner access to enable Pages and accept
the workflow permission prompt. That setting is a GitHub repository configuration, not a GCP
configuration.

Detailed P0 metrics, acceptance criteria, and the manual test protocol live in [docs/gesture-validation.md](docs/gesture-validation.md).

## How it works

```text
camera frame ──ImageBitmap──▶ vision worker (src/vision-worker.js)
                               GestureRecognizer · FaceLandmarker · PoseLandmarker
                               GPU delegate when hardware WebGL exists, else CPU
             ◀──landmarks────┘
main thread: One Euro smoothing → rules (+ calibrated baseline) → stability gate → UI
                               └──────────▶ blendshape vector → cosine similarity → Meme lookalike
```

The browser loads MediaPipe Gesture Recognizer, Face Landmarker, and Pose Landmarker from the local `public/vision/` directory inside a module Web Worker. The page sends one camera frame at a time; a slow device simply processes fewer frames instead of queueing stale ones. If a worker cannot start (or fails on live frames), the same models load on the main thread instead.

A small rule layer maps the smoothed landmarks and blendshapes to the project’s ten action IDs. An action must be held for three frames and at least 0.2 s, and the user must release it before the same action may fire again.

Meme lookalike turns each face into 43 blendshape scores (MediaPipe’s 52 minus the neutral and eye-gaze scores) and ranks memes by cosine similarity. After calibration, the resting face is subtracted first; left/right are also compared mirrored, since people copy a photo from a mirrored preview.

### Troubleshooting

- The HUD **ENGINE** row shows where models run (`WORKER` or `MAIN THREAD`) and on what (`GPU` or `CPU`); **SPEED** shows processed frames per second and inference time.
- Add `?delegate=cpu` or `?delegate=gpu` to the URL to force a backend, or `?runtime=main` to skip the worker.
- MediaPipe needs WebGL to read camera frames. If WebGL is turned off in the browser, the camera status says so.

### Known limitations

- **Tongue out** only fires from the keyboard simulation: MediaPipe’s face model has no tongue blendshape, so the camera rule never scores it.

## Privacy

In Gesture Meme Studio, camera frames stay in the browser. It has no backend, analytics, recording, upload, persistence, or cloud inference path. The calibration baseline and any **Use my face** references live in memory for the current page visit only. **Stop camera** stops the media tracks and closes the vision tasks.

Usability Copilot keeps the same rule: no video or face images are stored or sent. Its session file holds clicks with the text or label of what was clicked, which form controls were changed or focused, the pages visited, scrolling, the times of mouse and key activity (never which keys), task times and outcomes, calibration accuracy, and with the camera on, gaze estimates and two face numbers per frame (brow lowering and face size). What is typed into fields of the tested site is never stored (text a page shows inside a button, link or label is stored as that control's label), and emotions are never labelled. Nothing is uploaded: the participant decides whether to download and share the file, and can stop and delete everything at any time. Deleting clears the page; a file already downloaded has to be deleted from the downloads folder.

Usability Lab keeps studies, sessions, notes and quotes in this browser's IndexedDB on the researcher's computer until you delete them; clearing the browser's site data deletes them too. Nothing is uploaded: **Export** and **Back up all** save a file you keep. In a Figma study the prototype is served by Figma: the participant's browser (or, in a moderated session, the researcher's) loads it from figma.com, so Figma receives that browser's IP address, browser details and what is done in the prototype. The generated consent form and data management statement say so.

`research.html` and `lab.html` do not show inside a frame on another site, so no other page can lay itself over the consent screen or the workspace. Send participants the link itself.

## Repository security

The Pages workflow runs tests before publishing and uses separate read-only build permissions and
deployment permissions. Keep the `main` branch protected, restrict the `github-pages` environment
to `main`, and review Dependabot pull requests before merging. See [SECURITY.md](SECURITY.md).

## Project layout

```text
src/                 React UI, vision engine, and gesture rules
  vision-engine.js   Frame loop, worker/main-thread backends, smoothing, calibration
  vision-worker.js   Background thread that runs MediaPipe
  vision-models.js   Loads the three MediaPipe tasks (GPU → CPU fallback)
  vision-rules.js    Landmarks → ten action scores, stability gate
  smoothing.js       One Euro filter for landmarks and blendshapes
  calibration.js     Neutral-face baseline (median of ~2 s)
  lookalike.js       Expression vectors, cosine similarity, ranking
  Lookalike.jsx      Meme lookalike panel, library, and challenge
  meme-library.js    Meme faces used by Meme lookalike
  research/          Usability Copilot (research.html): gaze, signals, recorder, review,
                     report, questionnaires, study model, Figma embed
  lab/               Usability Lab (lab.html): workspace store, studies, plan, console
public/vision/       Local MediaPipe models and WASM runtime
public/reactions/    Local reaction images
public/research-site/ Fictional shop used by the Usability Copilot demo study
scripts/             Security and MediaPipe runtime checks
tests/               Rule, smoothing, calibration, lookalike, gaze, signal and recorder tests
docs/                P0 validation protocol, Usability Copilot and Usability Lab guides,
                     product strategy
```

## Design system

Usability Lab and Usability Copilot follow [Orchard](https://orchard.georgia.gov/), the open-source design system of the State of Georgia (MIT License, copyright the State of Georgia). They use:

- Orchard's Foundation colour palette. The dark theme is built from Orchard's deep teals.
- Orchard's typefaces, Montserrat and Source Serif. Both are under the SIL Open Font License.
- Orchard's button, field and header styles.

Orchard's digital seal and the Georgia name are reserved for official State of Georgia sites, so this project does not use them. The font files and the licences are in `src/research/fonts/`. Gesture Meme Studio keeps its own look.

## License

Code is released under the [MIT License](LICENSE). The reaction images are included as prototype assets; replace them before any commercial release.
