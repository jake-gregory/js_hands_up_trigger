import util from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { exec } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import grandi from 'grandi';
import sharp from 'sharp';
import * as tf from '@tensorflow/tfjs-node';
import * as poseDetection from '@tensorflow-models/pose-detection';
import {
  CAM_CONFIGS,
  COOLDOWN_MS,
  DETECTION_THRESHOLDS,
  TRIGGER_SCRIPT,
  LOOP_DELAY_MS,
  MODEL_INPUT_SIZE,
  STABLE_FRAMES_REQUIRED,
  type CameraConfig,
} from './config.js';
import { isHandRaised } from './detection.js';

const utilCompat = util as unknown as Record<string, unknown>;
utilCompat.isNullOrUndefined = (val: unknown) => val === null || val === undefined;
utilCompat.isArray = Array.isArray;

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type Receiver = Awaited<ReturnType<typeof grandi.receive>>;

interface ActiveCamera {
  receiver: Receiver;
  config: CameraConfig;
  lastResult: boolean;
}

async function createPoseDetector(): Promise<poseDetection.PoseDetector> {
  const modelUrl = `file://${path.join(PROJECT_ROOT, 'models', 'movenet', 'model.json')}`;
  return poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
    modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
    modelUrl,
  });
}

//Print every visible NDI source
function printSourceListing(sources: { name: string }[]): void {
  if (sources.length === 0) {
    console.log('📡 No NDI source(s) visible yet...');
    return;
  }

  console.log('\n📡 Available NDI source(s):');
  for (const source of [...sources].sort((a, b) => a.name.localeCompare(b.name))) {
    const marker = CAM_CONFIGS.some((c) => c.name === source.name) ? '  ✅ configured' : '';
    console.log(`   • ${source.name}${marker}`);
  }
}

async function waitForCameras(): Promise<ActiveCamera[]> {
  console.log('🔍 Searching for NDI source(s)...');
  const finder = await grandi.find({ showLocalSources: true });
  const startedAt = Date.now();
  let lastListing: string | null = null;

  function exitScript() {
    finder.destroy();
    process.exit(1);
  }

  if (CAM_CONFIGS.length === 0) {
    console.log(
      '\n❌ There no values specified in src/config.ts CAM_CONFIGS. Please check and try again.\n',
    );
    exitScript();
  }

  let sources = finder.sources();
  while (!CAM_CONFIGS.every((config) => sources.some((s) => s.name === config.name))) {
    if (Date.now() - startedAt >= 30_000) {
      const seconds = Math.round(30_000 / 1000);
      console.error(
        `\n❌ No NDI sources found after ${seconds}s. Check that your NDI source(s) are powered on and on the same network, then try again.\n`,
      );
    }

    await sleep(1000);
    sources = finder.sources();

    const listing = sources
      .map((s) => s.name)
      .sort()
      .join('|');
    if (listing !== lastListing) {
      lastListing = listing;
      printSourceListing(sources);
    }

    if (
      sources.length > 0 &&
      !CAM_CONFIGS.every((config) => sources.some((s) => s.name === config.name))
    ) {
      console.log(
        '\n⚠️  Sources found but are not specified in src/config.ts. Add the required source(s) name from above to CAM_CONFIGS and restart the script.\n',
      );
      exitScript();
    }
  }

  const activeCameras: ActiveCamera[] = [];
  for (const config of CAM_CONFIGS) {
    const source = sources.find((s) => s.name === config.name);
    if (!source) continue;
    const receiver = await grandi.receive({ source, colorFormat: grandi.COLOR_FORMAT_BGRX_BGRA });
    activeCameras.push({ receiver, config, lastResult: false });
  }
  finder.destroy();

  console.log('\n✅ All NDI source(s) connected\n');
  return activeCameras;
}

async function cameraSeesHand(
  detector: poseDetection.PoseDetector,
  cam: ActiveCamera,
): Promise<boolean | null> {
  const frame = await cam.receiver.video();
  if (!frame?.data) return null;

  //NDI delivers BGRX/BGRA — swap blue and red so sharp receives RGBA
  const buf = frame.data;
  for (let i = 0; i < buf.length; i += 4) {
    const b = buf[i];
    buf[i] = buf[i + 2];
    buf[i + 2] = b;
  }

  const jpegBuffer = await sharp(buf, {
    raw: { width: frame.xres, height: frame.yres, channels: 4 },
  })
    .rotate(cam.config.rotate)
    .resize(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0 },
    })
    .jpeg()
    .toBuffer();

  const imageTensor = tf.node.decodeImage(jpegBuffer, 3) as tf.Tensor3D;
  try {
    const poses = await detector.estimatePoses(imageTensor);
    return poses.length > 0 && isHandRaised(poses[0].keypoints, DETECTION_THRESHOLDS);
  } finally {
    imageTensor.dispose();
  }
}

function runTriggerScript(scriptPath: string): void {
  exec(scriptPath, (error) => {
    if (error) console.error(error);
  });
}

async function run(): Promise<void> {
  console.log(`🚀 Initializing MoveNet (${MODEL_INPUT_SIZE}x${MODEL_INPUT_SIZE})...`);
  const detector = await createPoseDetector();
  const activeCameras = await waitForCameras();

  let stableHandFrames = 0;
  let loopCount = 0;
  let lastTriggerTime = 0;

  while (true) {
    loopCount++;
    let anyCameraSeesHand = false;
    const now = Date.now();
    const onCooldown = now - lastTriggerTime < COOLDOWN_MS;

    for (let i = 0; i < activeCameras.length; i++) {
      const cam = activeCameras[i];

      if (loopCount % activeCameras.length !== i) {
        if (cam.lastResult) anyCameraSeesHand = true;
        continue;
      }

      try {
        const result = await cameraSeesHand(detector, cam);
        if (result !== null) cam.lastResult = result;
      } catch (error) {
        console.error(`\nFrame error from ${cam.config.name}:`, error);
        cam.lastResult = false;
      }
      if (cam.lastResult) anyCameraSeesHand = true;
    }

    if (anyCameraSeesHand && !onCooldown) {
      stableHandFrames++;
    } else {
      stableHandFrames = 0;
    }

    if (onCooldown) {
      const secondsLeft = Math.ceil((COOLDOWN_MS - (now - lastTriggerTime)) / 1000);
      process.stdout.write(`\r🧊 COOLDOWN: ${secondsLeft}s remaining...  `);
    } else {
      const hand = anyCameraSeesHand ? 'YES' : 'NO';
      process.stdout.write(
        `\r🔥 LIVE: Stability ${stableHandFrames}/${STABLE_FRAMES_REQUIRED} | Hand: ${hand}   `,
      );
    }

    if (stableHandFrames >= STABLE_FRAMES_REQUIRED) {
      console.log('\n Hand up!');
      runTriggerScript(TRIGGER_SCRIPT);
      lastTriggerTime = Date.now();
      stableHandFrames = 0;
    }

    await sleep(LOOP_DELAY_MS);
  }
}

run().catch(console.error);
