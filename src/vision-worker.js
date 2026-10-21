import { loadVisionModels } from './vision-models'

// Background thread for MediaPipe inference. The page posts one camera frame
// at a time as a transferred ImageBitmap and receives plain landmark results,
// so heavy model work never blocks rendering or input.
let models = null

self.onmessage = async ({ data }) => {
  const { id, type } = data
  try {
    if (type === 'init') {
      // The ES-module WASM loader is the one that works inside module workers.
      models = await loadVisionModels({ ...data.options, moduleLoader: true, onStatus: message => self.postMessage({ type: 'status', message }) })
      self.postMessage({ id, type: 'ready', delegate: models.delegate })
    } else if (type === 'frame') {
      const started = performance.now()
      try {
        const result = await models.detect(data.frame, data.timestamp)
        self.postMessage({ id, type: 'result', result, delegate: models.delegate, inferenceMs: performance.now() - started })
      } finally {
        data.frame.close()
      }
    } else if (type === 'analyze') {
      self.postMessage({ id, type: 'analysis', results: await models.analyzeImages(data.images) })
    }
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error?.message || String(error) })
  }
}
