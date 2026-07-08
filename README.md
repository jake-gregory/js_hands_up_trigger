# js_hands_up_trigger

This Node.js script watches one or more **NDI®** camera feeds (e.g. Mevo cameras) and runs Google's **MoveNet**
pose-detection model on the frames. When a hand is detected above the thresholds (configurable in src/config.ts),
the specified shell command is executed (also configurable in src/config.ts).

This can be used to trigger system events hands-free, such changing a scene on a live stream or pressing special keys.
If you can do it in a shell, you can trigger it with this script.

Written in TypeScript using TensorFlow.js (`@tensorflow/tfjs-node`).

## How it works

1. **Discover** — finds NDI sources on the network
2. **Capture** — captures one frame per loop iteration.
3. **Preprocess** — ensures images are the correct shape
   for the model using [sharp](https://sharp.pixelplumbing.com/).
4. **Detect** — MoveNet SinglePose Lightning estimates when a
   wrist is confidently above the nose.
5. **Trigger** — if the model believes it has seen a "hand up", the
   `TRIGGER_SCRIPT` (configurable in src/config.ts) is run.

## Requirements

- **Node.js 20.19.5+**
- **Xcode Command Line Tools** (`xcode-select --install`) — `@tensorflow/tfjs-node` compiles a
  native addon on install
- Camera(s) publishing an **NDI** stream on the same network (the NDI runtime is bundled via
  [grandi](https://github.com/tux-tn/grandi), nothing extra to install)

## Getting started

```bash
git clone https://github.com/jake-gregory/js_hands_up_trigger.git
cd js_hands_up_trigger
npm install
npm run start
```

On a fresh clone, `CAM_CONFIGS` in `src/config.ts` contains placeholder device names. The first run will list
every NDI source it can find and will then exit. Replace the placeholder device names with your camera's
exact name that is printed and restart the script.

```
📡 Available NDI source(s):
   • NDI-XXXX (NDI-XXXX)  <- copy this to CAM_CONFIGS in src/config.ts
```

## Configuration

All adjustable parameters are in [`src/config.ts`](src/config.ts).

| Setting                  | Default                  | What it does                                                    |
| ------------------------ | ------------------------ | --------------------------------------------------------------- |
| `CAM_CONFIGS`            | placeholder, rotated 90° | NDI source names to watch + per-camera rotation                 |
| `TRIGGER_SCRIPT`         | placeholder              | Shell command executed when a "hand up" detected                |
| `COOLDOWN_MS`            | `15000`                  | How long to wait between triggers                               |
| `STABLE_FRAMES_REQUIRED` | `1`                      | How many frames before triggering - higher = less sensitive     |
| `DETECTION_THRESHOLDS`   | `0.4, 0.5, 20`           | How high/ low your hand should be raised for a detection        |
| `MODEL_INPUT_SIZE`       | `192`                    | MoveNet input size. Leave at 192 for the bundled model          |
| `LOOP_DELAY_MS`          | `5`                      | Pause between processing-loop iterations - raise if CPU is slow |

Raise `DETECTION_THRESHOLDS` scores to cut false positives. Lower them (or reduce
`wristAboveNoseMargin`) if genuine hand raises aren't picked up.

## License & acknowledgements

MIT licensed, see [LICENSE](LICENSE). Uses Google's
[MoveNet](https://www.tensorflow.org/hub/tutorials/movenet) (Apache-2.0) for pose estimation, NDI®
receiving via [grandi](https://github.com/tux-tn/grandi) (bundles the proprietary NDI® runtime, ©
Vizrt NDI AB), and [sharp](https://sharp.pixelplumbing.com/) for image processing. NDI® is a
registered trademark of Vizrt NDI AB.
