# Gesture Meme Studio

> A local-first computer-vision playground where your face, hands, and body trigger playful reaction cards.

**Privacy-first · Ten actions · Built with MediaPipe**

Gesture Meme Studio turns a webcam into an expressive controller. Hold an illustrated action, let the on-device vision layer recognize it, and see a matching meme-style reaction appear. It is an experimental interaction prototype for testing gesture clarity, responsiveness, and playful feedback.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![MediaPipe](https://img.shields.io/badge/MediaPipe-Tasks-0F9D58)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Privacy](https://img.shields.io/badge/camera-local%20only-D8F36B?labelColor=1B1B1A)

## What it does

- Detects face, hand, and pose signals from a live browser camera.
- Shows a visual line-art guide and plain-language instruction for each action.
- Uses a stability gate and cooldown so a held pose triggers once rather than repeatedly.
- Draws a local landmark overlay and exposes candidate action/confidence in the HUD.
- Keeps keyboard and button controls as clearly labelled **simulation** tools for UI review.

## Actions

| Face | Hands / body |
| --- | --- |
| Open mouth · close both eyes · point to temple + tilt · stick out tongue | Heart hands · hand up · thumbs up · open palm · cover nose · hands on head |

## Run locally

```bash
npm install --prefer-offline --no-audit --no-fund
npm run dev -- --host 127.0.0.1 --port 4185 --strictPort
```

Open [http://127.0.0.1:4185/](http://127.0.0.1:4185/) in Chrome, select **Enable camera**, and copy one of the action guides. Hold a pose briefly until the HUD locks a candidate and the reaction fires.

## Verify

```bash
npm test
npm run build
```

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

The browser loads MediaPipe Gesture Recognizer, Face Landmarker, and Pose Landmarker from the local `public/vision/` directory. A small rule layer maps their landmarks and blendshapes to the project’s ten action IDs. The UI requires three stable frames and a release before the same action may fire again.

## Privacy

Camera frames stay in the browser. This project has no backend, analytics, recording, upload, persistence, or cloud inference path. **Stop camera** stops the media tracks and closes the vision tasks.

## Project layout

```text
src/                 React UI, vision engine, and gesture rules
public/vision/       Local MediaPipe models and WASM runtime
public/reactions/    Local reaction images
tests/               Rule and stability-gate tests
docs/                P0 validation protocol
```

## License

Code is released under the [MIT License](LICENSE). The reaction images are included as prototype assets; replace them before any commercial release.
