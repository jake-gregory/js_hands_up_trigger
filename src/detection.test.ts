import { describe, expect, it } from 'vitest';
import type { Keypoint } from '@tensorflow-models/pose-detection';
import { isHandRaised, type HandRaiseThresholds } from './detection.js';

const THRESHOLDS: HandRaiseThresholds = {
  minNoseScore: 0.5,
  minWristScore: 0.4,
  wristAboveNoseMargin: 20,
};

function kp(name: string, y: number, score?: number): Keypoint {
  return { name, x: 96, y, score };
}

describe('isHandRaised', () => {
  it('detects a left wrist held well above the nose', () => {
    expect(isHandRaised([kp('nose', 100, 0.9), kp('left_wrist', 60, 0.8)], THRESHOLDS)).toBe(true);
  });

  it('detects a right wrist held well above the nose', () => {
    expect(isHandRaised([kp('nose', 100, 0.9), kp('right_wrist', 55, 0.5)], THRESHOLDS)).toBe(true);
  });

  it('ignores a wrist above the nose but inside the margin', () => {
    expect(isHandRaised([kp('nose', 100, 0.9), kp('left_wrist', 85, 0.9)], THRESHOLDS)).toBe(false);
  });

  it('ignores everything when the nose is not confidently detected', () => {
    expect(isHandRaised([kp('nose', 100, 0.5), kp('left_wrist', 40, 0.9)], THRESHOLDS)).toBe(false);
  });

  it('ignores wrists below the confidence threshold', () => {
    expect(isHandRaised([kp('nose', 100, 0.9), kp('right_wrist', 40, 0.4)], THRESHOLDS)).toBe(
      false,
    );
  });

  it('treats missing keypoint scores as zero confidence', () => {
    expect(isHandRaised([kp('nose', 100), kp('left_wrist', 40)], THRESHOLDS)).toBe(false);
  });

  it('returns false when no keypoints are present', () => {
    expect(isHandRaised([], THRESHOLDS)).toBe(false);
  });

  it('respects custom thresholds', () => {
    const keypoints = [kp('nose', 100, 0.9), kp('left_wrist', 95, 0.3)];
    expect(isHandRaised(keypoints, THRESHOLDS)).toBe(false);
    expect(
      isHandRaised(keypoints, { minNoseScore: 0.5, minWristScore: 0.2, wristAboveNoseMargin: 0 }),
    ).toBe(true);
  });
});
