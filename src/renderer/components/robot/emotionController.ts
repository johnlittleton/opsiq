import * as THREE from 'three';
import type { RobotEmotionChannels, RobotEmotionName } from './types';

const EMOTION_PRESETS: Record<RobotEmotionName, RobotEmotionChannels> = {
  friendly: {
    visorBrightness: 0.6,
    eyeGlow: 0.75,
    mouthGlow: 0.55,
    headTilt: 0.03,
    chestOpen: 0.18,
    gestureEnergy: 0.65,
  },
  listening: {
    visorBrightness: 0.45,
    eyeGlow: 0.55,
    mouthGlow: 0.25,
    headTilt: 0.05,
    chestOpen: 0.08,
    gestureEnergy: 0.25,
  },
  success: {
    visorBrightness: 0.85,
    eyeGlow: 0.95,
    mouthGlow: 0.7,
    headTilt: 0.02,
    chestOpen: 0.24,
    gestureEnergy: 0.78,
  },
  concern: {
    visorBrightness: 0.35,
    eyeGlow: 0.3,
    mouthGlow: 0.14,
    headTilt: -0.03,
    chestOpen: -0.04,
    gestureEnergy: 0.12,
  },
  neutral: {
    visorBrightness: 0.32,
    eyeGlow: 0.26,
    mouthGlow: 0.16,
    headTilt: 0,
    chestOpen: 0,
    gestureEnergy: 0,
  },
};

export interface EmissiveChannels {
  visorMaterials: THREE.MeshStandardMaterial[];
  speakerMaterials: THREE.MeshStandardMaterial[];
  eyeMaterials: THREE.MeshStandardMaterial[];
  fallbackMaterials: THREE.MeshStandardMaterial[];
}

const damp = (value: number, target: number, lambda: number, dt: number) => THREE.MathUtils.damp(value, target, lambda, dt);

const hasNameToken = (name: string, tokens: string[]) => {
  const normalized = name.toLowerCase();
  return tokens.some((token) => normalized.includes(token));
};

export const collectEmissiveChannels = (root: THREE.Object3D): EmissiveChannels => {
  const channels: EmissiveChannels = {
    visorMaterials: [],
    speakerMaterials: [],
    eyeMaterials: [],
    fallbackMaterials: [],
  };

  const pushMaterial = (material: THREE.Material, meshName: string) => {
    if (!(material instanceof THREE.MeshStandardMaterial)) return;

    material.envMapIntensity = 0.7;

    if (material.emissive.getHex() !== 0x000000 || material.emissiveIntensity > 0) {
      channels.fallbackMaterials.push(material);
    }

    const materialName = `${material.name || ''} ${meshName}`.trim();

    if (hasNameToken(materialName, ['visor', 'faceplate', 'face', 'screen'])) {
      channels.visorMaterials.push(material);
    }
    if (hasNameToken(materialName, ['eye', 'eyes', 'led'])) {
      channels.eyeMaterials.push(material);
    }
    if (hasNameToken(materialName, ['mouth', 'speaker', 'grill', 'audio'])) {
      channels.speakerMaterials.push(material);
    }
  };

  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    mesh.frustumCulled = true;

    if (Array.isArray(mesh.material)) {
      for (const material of mesh.material) {
        pushMaterial(material, mesh.name || '');
      }
      return;
    }

    pushMaterial(mesh.material, mesh.name || '');
  });

  return channels;
};

const applyIntensity = (materials: THREE.MeshStandardMaterial[], target: number, dt: number) => {
  for (const material of materials) {
    const next = damp(material.emissiveIntensity ?? 0, target, 10, dt);
    material.emissiveIntensity = next;
  }
};

export const applyEmotionChannels = (
  emotionName: RobotEmotionName,
  channels: EmissiveChannels,
  speakLight: THREE.PointLight,
  dt: number
) => {
  const emotion = EMOTION_PRESETS[emotionName];

  const visorTarget = 0.05 + emotion.visorBrightness * 0.8;
  const eyeTarget = 0.08 + emotion.eyeGlow * 0.9;
  const speakerTarget = 0.04 + emotion.mouthGlow * 0.75;

  if (channels.visorMaterials.length > 0) {
    applyIntensity(channels.visorMaterials, visorTarget, dt);
  }

  if (channels.eyeMaterials.length > 0) {
    applyIntensity(channels.eyeMaterials, eyeTarget, dt);
  }

  if (channels.speakerMaterials.length > 0) {
    applyIntensity(channels.speakerMaterials, speakerTarget, dt);
  }

  if (channels.visorMaterials.length === 0 && channels.eyeMaterials.length === 0 && channels.speakerMaterials.length === 0) {
    applyIntensity(channels.fallbackMaterials, 0.08 + emotion.eyeGlow * 0.75, dt);
  }

  speakLight.intensity = damp(speakLight.intensity, 0.06 + emotion.mouthGlow * 0.55, 10, dt);
};

export const getEmotionPreset = (emotionName: RobotEmotionName) => EMOTION_PRESETS[emotionName];
