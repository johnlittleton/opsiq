export type RobotAssistantState = 'idle' | 'walk' | 'greeting' | 'listening' | 'speaking' | 'success' | 'error';

export type RobotBehaviorMode = 'attract' | 'active';

export type RobotClipName =
  | 'Idle'
  | 'Walk'
  | 'Wave'
  | 'Point'
  | 'Nod'
  | 'Listen'
  | 'Success'
  | 'Concern';

export type RobotEmotionName = 'friendly' | 'listening' | 'success' | 'concern' | 'neutral';

export interface RobotEmotionChannels {
  visorBrightness: number;
  eyeGlow: number;
  mouthGlow: number;
  headTilt: number;
  chestOpen: number;
  gestureEnergy: number;
}

export interface RobotPoseCommand {
  clip: RobotClipName;
  emotion: RobotEmotionName;
  lookYaw: number;
  bodyOffsetX: number;
  bodyOffsetY: number;
  bodyRotY: number;
  bodyRotX: number;
  gestureHint: 'none' | 'wave' | 'point' | 'open-hand';
}
