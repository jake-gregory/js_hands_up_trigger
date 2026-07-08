import type { HandRaiseThresholds } from './detection.js';

export interface CameraConfig {
  name: string;
  rotate: number;
}

//The NDI sources to monitor. Multiple sources can be used here
//Rotation can be set depending on camera orientation
export const CAM_CONFIGS: CameraConfig[] = [
  { name: 'DEVICE_NAME', rotate: 90 },
  { name: 'DEVICE_NAME_1', rotate: 180 },
  { name: 'DEVICE_NAME_2', rotate: 360 },
];

//Execute this shell command when hand up gesture is recognised
//Example command: open -a Music.app
export const TRIGGER_SCRIPT = 'COMMAND_HERE';

//Minimum time between triggers
export const COOLDOWN_MS = 15_000;

//Consecutive hand up frames required before a trigger fires
export const STABLE_FRAMES_REQUIRED = 1;

//Pose detection sensitivity
export const DETECTION_THRESHOLDS: HandRaiseThresholds = {
  minNoseScore: 0.5,
  minWristScore: 0.4,
  wristAboveNoseMargin: 20,
};

//MoveNet SinglePose Lightning expects square 192x192 input
export const MODEL_INPUT_SIZE = 192;

//Pause duration between loop iterations
export const LOOP_DELAY_MS = 5;
