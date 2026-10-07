# Gesture Meme Studio — P0 validation

## North Star metric

**Correct reaction rate per intentional pose:** the user holds the illustrated pose and the mapped reaction appears once within 1.5 seconds, without uploading camera frames. The first release target is at least **90% recall** across 20 attempts per action and **95% precision** during five minutes of neutral movement.

## P0 acceptance criteria

- **Deterministic mapping:** each action ID maps to exactly one reaction. The five local meme assets currently map to `open_mouth`, `eyes_closed`, `wink_tilt`, `tongue_out`, and `hands_head`.
- **Fast feedback:** p95 time from a stable pose to `EVENT FIRED` is ≤500 ms on the local Chrome setup. The engine samples at ~13 FPS and requires three stable frames to reduce accidental triggers.
- **Release gate:** holding a pose fires once; the same pose cannot fire again until the user releases it. Cooldown is 1.2 seconds.
- **Low false positives:** no more than one event during five minutes of neutral face, normal blinking, and ordinary hand movement.
- **Model readiness:** the page loads the local WASM runtime and all three local `.task` files. A model failure is visible in the camera status rather than silently presenting a live preview.
- **Privacy:** no camera frame, landmark, or reaction event is sent to a server. Stopping the camera stops all tracks and closes the three MediaPipe tasks.
- **Usability:** every action card has a line-art guide, plain-language instruction, source label, and keyboard simulation fallback.

## Manual test protocol

1. Open `http://127.0.0.1:4185/` in Chrome and click **Enable camera**.
2. Confirm the status changes from `LOADING` to `LIVE`, HUD `PROCESSING` is `LOCAL`, and landmarks change from `SEARCHING` to `TRACKING`.
3. Perform each illustrated pose for three seconds, then relax for two seconds. Record whether the expected reaction fired once, latency, and any competing reaction.
4. Repeat the set at a nearer/farther distance and under brighter/dimmer light. Repeat the neutral five-minute test.
5. Use keys `1–0` only to verify reaction rendering; event log must label these as `keyboard / demo`.

## Reference basis

The runtime follows the public MediaPipe Tasks web samples for Gesture Recognizer and Face Landmarker: camera frames are processed in `VIDEO` mode with local model assets and normalized landmarks. The project adds a local rule layer, stability gate, overlay, and reaction mapping on top of those task outputs.
