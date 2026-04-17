import type { RobotAssistantState, RobotBehaviorMode, RobotPoseCommand } from './types';

const pick = <T>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];

const ATTRACT_WAVE_INTERVAL_MIN = 8;
const ATTRACT_WAVE_INTERVAL_MAX = 14;

const createAttractPose = (elapsed: number): RobotPoseCommand => {
  const patrol = Math.sin(elapsed * 0.6) * 0.11;
  const look = Math.sin(elapsed * 0.4) * 0.22;

  return {
    clip: 'Idle',
    emotion: 'friendly',
    lookYaw: look,
    bodyOffsetX: patrol,
    bodyOffsetY: Math.sin(elapsed * 1.2) * 0.02,
    bodyRotY: Math.sin(elapsed * 0.35) * 0.08,
    bodyRotX: Math.sin(elapsed * 0.7) * 0.015,
    gestureHint: 'none',
  };
};

export interface ModeEvaluationInput {
  mode: RobotBehaviorMode;
  assistantState: RobotAssistantState;
  elapsedInMode: number;
  nowSeconds: number;
}

export class RobotModeStateMachine {
  private lastMode: RobotBehaviorMode = 'attract';
  private nextWaveAt = 0;
  private transientClipUntil = 0;
  private transientClip: RobotPoseCommand | null = null;

  evaluate(input: ModeEvaluationInput): RobotPoseCommand {
    if (input.mode !== this.lastMode) {
      this.lastMode = input.mode;
      this.transientClip = null;
      this.transientClipUntil = 0;
      this.nextWaveAt = input.nowSeconds + ATTRACT_WAVE_INTERVAL_MIN;
    }

    if (input.mode === 'attract') {
      return this.evaluateAttract(input);
    }

    return this.evaluateActive(input);
  }

  private evaluateAttract(input: ModeEvaluationInput): RobotPoseCommand {
    if (this.transientClip && input.nowSeconds < this.transientClipUntil) {
      return this.transientClip;
    }

    if (input.nowSeconds >= this.nextWaveAt) {
      this.nextWaveAt =
        input.nowSeconds +
        ATTRACT_WAVE_INTERVAL_MIN + Math.random() * (ATTRACT_WAVE_INTERVAL_MAX - ATTRACT_WAVE_INTERVAL_MIN);

      this.transientClip = {
        clip: 'Wave',
        emotion: 'friendly',
        lookYaw: 0,
        bodyOffsetX: 0,
        bodyOffsetY: 0,
        bodyRotY: 0,
        bodyRotX: -0.01,
        gestureHint: 'wave',
      };
      this.transientClipUntil = input.nowSeconds + 1.8;
      return this.transientClip;
    }

    return createAttractPose(input.elapsedInMode);
  }

  private evaluateActive(input: ModeEvaluationInput): RobotPoseCommand {
    switch (input.assistantState) {
      case 'greeting':
        return {
          clip: pick(['Wave', 'Point']),
          emotion: 'friendly',
          lookYaw: 0,
          bodyOffsetX: 0,
          bodyOffsetY: 0.01,
          bodyRotY: 0,
          bodyRotX: -0.03,
          gestureHint: 'wave',
        };
      case 'listening':
        return {
          clip: 'Listen',
          emotion: 'listening',
          lookYaw: 0.05,
          bodyOffsetX: 0,
          bodyOffsetY: 0,
          bodyRotY: 0.04,
          bodyRotX: -0.02,
          gestureHint: 'none',
        };
      case 'speaking':
        return {
          clip: 'Point',
          emotion: 'friendly',
          lookYaw: 0,
          bodyOffsetX: 0,
          bodyOffsetY: Math.sin(input.elapsedInMode * 4.5) * 0.01,
          bodyRotY: 0,
          bodyRotX: -0.01,
          gestureHint: 'point',
        };
      case 'success':
        return {
          clip: 'Success',
          emotion: 'success',
          lookYaw: 0,
          bodyOffsetX: 0,
          bodyOffsetY: 0.01,
          bodyRotY: 0,
          bodyRotX: 0.02,
          gestureHint: 'open-hand',
        };
      case 'error':
        return {
          clip: 'Concern',
          emotion: 'concern',
          lookYaw: -0.06,
          bodyOffsetX: 0,
          bodyOffsetY: 0,
          bodyRotY: -0.04,
          bodyRotX: -0.01,
          gestureHint: 'none',
        };
      case 'idle':
      default:
        return {
          clip: 'Idle',
          emotion: 'neutral',
          lookYaw: 0,
          bodyOffsetX: 0,
          bodyOffsetY: 0,
          bodyRotY: 0,
          bodyRotX: 0,
          gestureHint: 'none',
        };
    }
  }
}
