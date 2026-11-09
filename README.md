# Gesture Meme Studio

> A local-first computer-vision playground where your face, hands, and body trigger playful reaction cards.

**Privacy-first · Ten actions · Meme lookalike · Built with MediaPipe**

Gesture Meme Studio turns a webcam into an expressive controller. Hold an illustrated action, let the on-device vision layer recognize it, and see a matching meme-style reaction appear — or switch to **Meme lookalike** and find out which meme face you are making. It is an experimental interaction prototype for testing gesture clarity, responsiveness, and playful feedback.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![MediaPipe](https://img.shields.io/badge/MediaPipe-Tasks-0F9D58)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Privacy](https://img.shields.io/badge/camera-local%20only-D8F36B?labelColor=1B1B1A)

## What it does

- Detects face, hand, and pose signals from a live browser camera.
- Runs the models in a background **Web Worker**, on the **GPU** when real graphics hardware is available and on the CPU otherwise, so the page stays responsive.
- **Calibrates** to your resting face (2 seconds, press **C**) so mouth, eye, and head-tilt rules start from your neutral expression instead of a one-size-fits-all threshold.
- Smooths landmark jitter with a One Euro filter and ignores body points the pose model only guessed.
- Shows a visual line-art guide and plain-language instruction for each action.
- Uses a stability gate (a steady ~0.2 s hold) and cooldown so a held pose triggers once rather than repeatedly.
- Draws a local landmark overlay and exposes candidate, confidence, engine, and speed in the HUD.
- Keeps keyboard and button controls as clearly labelled **simulation** tools for UI review.

## Modes

**Meme reactions** — hold one of ten poses to fire a reaction card.

| Face | Hands / body |
| --- | --- |
| Open mouth · close both eyes · point to temple + tilt · stick out tongue | Heart hands · hand up · thumbs up · open palm · cover nose · hands on head |

**Meme lookalike** — your expression is compared with every meme face in [`src/meme-library.js`](src/meme-library.js) and the closest one is shown with a match score. Start the **5-second challenge** to copy a random meme as closely as you can. Photos of real faces are read automatically; for cartoons or animals, press **Use my face** to record your own version. To add a meme, drop an image into `public/reactions/` and add one line to the library.

## Usability Copilot

`research.html` turns the same on-device vision engine into a usability-testing assistant. A participant works through tasks on a website while the page records clicks, page changes, approximate gaze areas and facial movement. Afterwards it flags the moments where they probably got stuck, so a researcher reviews those instead of a whole recording.

- **Participant flow:** consent, then a 1-minute calibration whose accuracy is measured on separate dots, then the tasks, then the participant downloads or deletes a results file. Gaze is used only when validation error is at most 3°; the camera is optional.
- **Signals:** unanswered clicks, rage clicks, going round in circles between pages, timeouts and idle periods (strong or medium), plus searching gaze and held brow lowering or leaning in (weak, never used alone). Emotions are never inferred.
- **Researcher review:** open `research.html#review`, load a session file, and confirm or reject each flagged moment with a 0–4 severity. Files are read locally.
- **Demo:** a fictional shop in `public/research-site/` contains three planted usability problems for the demo study.

Details, thresholds, the session file format and how to test your own prototype: [docs/usability-copilot.md](docs/usability-copilot.md).

## Run locally

```bash
npm install --prefer-offline --no-audit --no-fund
npm run dev -- --host 127.0.0.1 --port 4185 --strictPort
```

Open [http://127.0.0.1:4185/](http://127.0.0.1:4185/) in Chrome, select **Enable camera**, and copy one of the action guides. Hold a pose briefly until the HUD locks a candidate and the reaction fires.

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

Camera frames stay in the browser. This project has no backend, analytics, recording, upload, persistence, or cloud inference path. The calibration baseline and any **Use my face** references live in memory for the current page visit only. **Stop camera** stops the media tracks and closes the vision tasks.

Usability Copilot keeps the same rule: no video or face images are stored. Its session file holds timestamps, clicks, page names, gaze coordinates and two face numbers per frame (brow lowering and face size). The participant decides whether to download and share it, and can stop and delete everything at any time.

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
  research/          Usability Copilot (research.html): gaze, signals, recorder, UI
public/vision/       Local MediaPipe models and WASM runtime
public/reactions/    Local reaction images
public/research-site/ Fictional shop used by the Usability Copilot demo study
scripts/             Security and MediaPipe runtime checks
tests/               Rule, smoothing, calibration, lookalike, gaze and signal tests
docs/                P0 validation protocol, Usability Copilot guide
```

## License

Code is released under the [MIT License](LICENSE). The reaction images are included as prototype assets; replace them before any commercial release.
