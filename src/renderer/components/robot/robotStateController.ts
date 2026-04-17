import * as THREE from 'three';
import { getEmotionPreset } from './emotionController';
import type { RobotPoseCommand } from './types';

export type RobotState = 'idle' | 'greeting' | 'listening' | 'speaking' | 'success' | 'error';

export interface RobotMotionContext {
  pose: RobotPoseCommand;
  elapsed: number;
  delta: number;
  root: THREE.Object3D;
  basePosition: THREE.Vector3;
  baseRotation: THREE.Euler;
  speakLight: THREE.PointLight;
  emissiveMaterials: THREE.MeshStandardMaterial[];
}

const damp = (value: number, target: number, lambda: number, dt: number) => {
  return THREE.MathUtils.damp(value, target, lambda, dt);
};

export const applyRobotStateMotion = ({
  pose,
  elapsed,
  delta,
  root,
  basePosition,
  baseRotation,
  speakLight,
  emissiveMaterials,
}: RobotMotionContext) => {
  const emotion = getEmotionPreset(pose.emotion);
  const breath = Math.sin(elapsed * 1.35) * 0.012;

  const targetPosY = basePosition.y + breath + pose.bodyOffsetY;
  const targetPosX = basePosition.x + pose.bodyOffsetX;
  const targetRotX =
    baseRotation.x +
    pose.bodyRotX +
    emotion.headTilt +
    (pose.gestureHint === 'point' ? Math.sin(elapsed * 4.4) * 0.012 : 0);
  const targetRotY = baseRotation.y + pose.bodyRotY + pose.lookYaw;
  const targetRotZ =
    baseRotation.z +
    (pose.gestureHint === 'wave' ? Math.sin(elapsed * 5.1) * 0.02 : 0) +
    (pose.emotion === 'concern' ? Math.sin(elapsed * 6.8) * 0.012 : 0);

  const talkPulse = pose.gestureHint === 'point' ? Math.sin(elapsed * 12) * 0.5 + 0.5 : 0;
  const targetGlow = 0.08 + emotion.eyeGlow * 0.32 + talkPulse * emotion.mouthGlow * 0.22;

  root.position.x = damp(root.position.x, targetPosX, 8, delta);
  root.position.y = damp(root.position.y, targetPosY, 7, delta);
  root.rotation.x = damp(root.rotation.x, targetRotX, 9, delta);
  root.rotation.y = damp(root.rotation.y, targetRotY, 8, delta);
  root.rotation.z = damp(root.rotation.z, targetRotZ, 8, delta);

  speakLight.intensity = damp(speakLight.intensity, targetGlow, 10, delta);

  for (const material of emissiveMaterials) {
    const next = damp(material.emissiveIntensity ?? 0, 0.08 + targetGlow * 0.75, 9, delta);
    material.emissiveIntensity = next;
  }
};
