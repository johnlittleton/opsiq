import * as THREE from 'three';
import type { RobotClipName } from './types';

const CLIP_PATTERNS: Record<RobotClipName, RegExp> = {
  Idle: /idle|breath|stand/i,
  Walk: /walk|patrol|stride/i,
  Wave: /wave|hello|greet/i,
  Point: /point|indicat/i,
  Nod: /nod|agree/i,
  Listen: /listen|attentive|focus/i,
  Success: /success|celebrate|approve/i,
  Concern: /concern|error|worry|sad/i,
};

export interface RobotAnimationController {
  mixer: THREE.AnimationMixer;
  availableClips: Map<RobotClipName, THREE.AnimationClip>;
  hasClip(name: RobotClipName): boolean;
  play(name: RobotClipName, fadeSeconds?: number): void;
  update(delta: number): void;
  stopAll(): void;
}

export const createRobotAnimationController = (
  root: THREE.Object3D,
  clips: THREE.AnimationClip[]
): RobotAnimationController => {
  const mixer = new THREE.AnimationMixer(root);
  const availableClips = new Map<RobotClipName, THREE.AnimationClip>();
  const actionMap = new Map<RobotClipName, THREE.AnimationAction>();
  let activeClip: RobotClipName | null = null;

  for (const clipName of Object.keys(CLIP_PATTERNS) as RobotClipName[]) {
    const clip = clips.find((candidate) => CLIP_PATTERNS[clipName].test(candidate.name));
    if (clip) {
      availableClips.set(clipName, clip);
      actionMap.set(clipName, mixer.clipAction(clip));
    }
  }

  const play = (name: RobotClipName, fadeSeconds = 0.25) => {
    if (activeClip === name) return;

    const nextAction = actionMap.get(name);
    if (!nextAction) return;

    nextAction.reset();
    nextAction.enabled = true;
    nextAction.setEffectiveWeight(1);
    nextAction.play();

    if (activeClip) {
      const previousAction = actionMap.get(activeClip);
      if (previousAction) {
        previousAction.crossFadeTo(nextAction, fadeSeconds, true);
      }
    }

    nextAction.fadeIn(fadeSeconds);
    activeClip = name;
  };

  const stopAll = () => {
    for (const action of actionMap.values()) {
      action.stop();
    }
    activeClip = null;
  };

  return {
    mixer,
    availableClips,
    hasClip(name) {
      return availableClips.has(name);
    },
    play,
    update(delta) {
      mixer.update(delta);
    },
    stopAll,
  };
};
