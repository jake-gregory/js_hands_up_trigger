import type { Keypoint } from '@tensorflow-models/pose-detection';

export interface HandRaiseThresholds {
  minNoseScore: number;
  minWristScore: number;
  wristAboveNoseMargin: number;
}

//True when either wrist is confidently detected above the nose
export function isHandRaised(keypoints: Keypoint[], thresholds: HandRaiseThresholds): boolean {
  const nose = keypoints.find((k) => k.name === 'nose');
  if (!nose || (nose.score ?? 0) <= thresholds.minNoseScore) return false;

  const cutoffY = nose.y - thresholds.wristAboveNoseMargin;
  return keypoints.some(
    (k) =>
      (k.name === 'left_wrist' || k.name === 'right_wrist') &&
      (k.score ?? 0) > thresholds.minWristScore &&
      k.y < cutoffY,
  );
}
