import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import type { RobotAssistantState, RobotBehaviorMode } from './robot/types';
import './RobotScene.css';

interface RobotSceneProps {
  state?: RobotAssistantState;
  behaviorMode?: RobotBehaviorMode;
  modelUrl?: string;
}

const DEFAULT_MODEL_URL = '/models/slingshot-robot.glb';

const ANIMATION_PATHS = {
  idle: '/animations/idle.fbx',
  walk: '/animations/walk.fbx',
  wave: '/animations/wave.fbx',
  point: '/animations/point.fbx',
  nod: '/animations/nod.fbx',
  listen: '/animations/listen.fbx',
  happy: '/animations/happy.fbx',
  concern: '/animations/concern.fbx',
} as const;

type LoadedClipMap = Partial<Record<keyof typeof ANIMATION_PATHS, THREE.AnimationClip>>;

const normalizeNodeToken = (value: string) => {
  return value
    .toLowerCase()
    .replace(/armature\|/g, '')
    .replace(/mixamorig[:_]?/g, '')
    .replace(/[^a-z0-9]/g, '');
};

const splitTrackName = (trackName: string) => {
  const boneTrackMatch = trackName.match(/^(.+)\.bones\[([^\]]+)\]\.(.+)$/);
  if (boneTrackMatch) {
    return {
      nodeName: boneTrackMatch[2],
      propertyPath: boneTrackMatch[3],
    };
  }

  const lastDot = trackName.lastIndexOf('.');
  if (lastDot === -1) {
    return { nodeName: trackName, propertyPath: '' };
  }

  return {
    nodeName: trackName.slice(0, lastDot),
    propertyPath: trackName.slice(lastDot + 1),
  };
};

const buildNodeNameMap = (root: THREE.Object3D) => {
  const exact = new Map<string, string>();
  const normalized = new Map<string, string>();

  root.traverse((node) => {
    if (!node.name) return;

    if (!exact.has(node.name)) {
      exact.set(node.name, node.name);
    }

    const token = normalizeNodeToken(node.name);
    if (token && !normalized.has(token)) {
      normalized.set(token, node.name);
    }
  });

  return { exact, normalized };
};

const remapClipTracksToTarget = (clip: THREE.AnimationClip, root: THREE.Object3D) => {
  const { exact, normalized } = buildNodeNameMap(root);
  const remappedTracks: THREE.KeyframeTrack[] = [];

  for (const track of clip.tracks) {
    const { nodeName, propertyPath } = splitTrackName(track.name);

    const sourceCandidates = [
      nodeName,
      nodeName.split('|').pop() || nodeName,
      nodeName.split('/').pop() || nodeName,
      nodeName.split(':').pop() || nodeName,
    ];

    let resolvedNodeName: string | undefined;
    for (const candidate of sourceCandidates) {
      resolvedNodeName = exact.get(candidate);
      if (resolvedNodeName) break;
    }

    if (!resolvedNodeName) {
      for (const candidate of sourceCandidates) {
        const normalizedSource = normalizeNodeToken(candidate);
        if (!normalizedSource) continue;
        resolvedNodeName = normalized.get(normalizedSource);
        if (resolvedNodeName) break;
      }
    }

    if (!resolvedNodeName || !propertyPath) {
      continue;
    }

    const clonedTrack = track.clone();
    clonedTrack.name = `${resolvedNodeName}.${propertyPath}`;
    remappedTracks.push(clonedTrack);
  }

  if (remappedTracks.length === 0) {
    return null;
  }

  const remappedClip = new THREE.AnimationClip(clip.name, clip.duration, remappedTracks);
  remappedClip.optimize();
  return remappedClip;
};

export interface RobotSceneHandle {
  setRobotState: (stateName: RobotAssistantState) => void;
  speak: (text: string) => Promise<void>;
  getState: () => RobotAssistantState;
}

declare global {
  interface Window {
    opsiqRobot?: RobotSceneHandle;
    opsiqRobotDebug?: {
      loadedClips: string[];
      missingClips: string[];
      clipTrackCounts: Record<string, number>;
      activeClip: string;
      state: RobotAssistantState;
      modelRigged: boolean;
      reason?: string;
    };
  }
}

const loadFbxClip = async (loader: FBXLoader, path: string, name: string) => {
  const fbx = await loader.loadAsync(path);
  const sourceClip = fbx.animations?.[0];
  if (!sourceClip) return null;

  const clip = sourceClip.clone();
  clip.name = name;
  clip.optimize();
  return clip;
};

const applyObjectFraming = (root: THREE.Object3D, camera: THREE.PerspectiveCamera, speakLight: THREE.PointLight) => {
  root.updateMatrixWorld(true);

  const initialBounds = new THREE.Box3().setFromObject(root);
  const initialSize = initialBounds.getSize(new THREE.Vector3());
  const initialHeight = Math.max(initialSize.y, 0.001);

  const desiredHeight = 2.45;
  const scaleFactor = desiredHeight / initialHeight;
  root.scale.setScalar(scaleFactor);
  root.updateMatrixWorld(true);

  const scaledBounds = new THREE.Box3().setFromObject(root);
  const scaledCenter = scaledBounds.getCenter(new THREE.Vector3());
  const scaledSize = scaledBounds.getSize(new THREE.Vector3());

  root.position.x += -scaledCenter.x;
  root.position.z += -scaledCenter.z;
  root.position.y += -(scaledBounds.min.y + scaledSize.y * 0.03);
  root.updateMatrixWorld(true);

  const framedBounds = new THREE.Box3().setFromObject(root);
  const framedSize = framedBounds.getSize(new THREE.Vector3());
  const visibleMinY = framedBounds.min.y + framedSize.y * 0.21;
  const visibleMaxY = framedBounds.max.y + framedSize.y * 0.07;
  const visibleHeight = (visibleMaxY - visibleMinY) * 1.2;
  const visibleWidth = framedSize.x * 1.24;

  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);

  const fitHeightDistance = (visibleHeight * 0.5) / Math.tan(vFov / 2);
  const fitWidthDistance = (visibleWidth * 0.5) / Math.tan(hFov / 2);
  const distance = Math.max(fitHeightDistance, fitWidthDistance) * 1.22;

  const targetY = (visibleMinY + visibleMaxY) * 0.5 + framedSize.y * 0.015;
  camera.position.set(framedSize.x * 0.02, targetY + framedSize.y * 0.045, distance + framedSize.z * 0.28);
  camera.lookAt(0, targetY, 0);
  camera.near = Math.max(0.03, distance / 80);
  camera.far = Math.max(40, distance + framedSize.y * 10);
  camera.updateProjectionMatrix();

  speakLight.position.set(0, targetY + framedSize.y * 0.04, 1.0);
};

export const RobotScene = forwardRef<RobotSceneHandle, RobotSceneProps>(function RobotScene(
  { state = 'idle', behaviorMode, modelUrl = DEFAULT_MODEL_URL },
  ref
) {
  const [rigStatus, setRigStatus] = useState<{ rigged: boolean | null; reason?: string }>({ rigged: null });
  const mountRef = useRef<HTMLDivElement | null>(null);
  const setStateApiRef = useRef<(stateName: RobotAssistantState) => void>(() => undefined);
  const speakApiRef = useRef<(text: string) => Promise<void>>(async () => undefined);
  const currentStateRef = useRef<RobotAssistantState>('idle');
  const pendingStateRef = useRef<RobotAssistantState>(state);

  useImperativeHandle(
    ref,
    () => ({
      setRobotState: (stateName) => setStateApiRef.current(stateName),
      speak: (text) => speakApiRef.current(text),
      getState: () => currentStateRef.current,
    }),
    []
  );

  useEffect(() => {
    if (behaviorMode === 'attract' && state === 'idle') {
      pendingStateRef.current = 'walk';
      setStateApiRef.current('walk');
      return;
    }

    pendingStateRef.current = state;
    setStateApiRef.current(state);
  }, [state, behaviorMode]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let destroyed = false;
    let rafId = 0;
    let sequenceToken = 0;
    const timer = new THREE.Timer();
    timer.connect(document);
    timer.reset();
    const basePosition = new THREE.Vector3();
    const baseRotation = new THREE.Euler();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#070b12');

    const camera = new THREE.PerspectiveCamera(34, mount.clientWidth / mount.clientHeight, 0.1, 120);

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = false;
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight('#f2f5ff', 0.55);
    scene.add(ambient);

    const frontKey = new THREE.DirectionalLight('#ffffff', 1.15);
    frontKey.position.set(1.4, 2.1, 2.6);
    scene.add(frontKey);

    const rimBlue = new THREE.DirectionalLight('#67a8ff', 0.5);
    rimBlue.position.set(-2.3, 1.6, -2.0);
    scene.add(rimBlue);

    const speakLight = new THREE.PointLight('#6db2ff', 0.1, 5.5, 2.0);
    speakLight.position.set(0, 1.6, 1.0);
    scene.add(speakLight);

    const gltfLoader = new GLTFLoader();
    const fbxLoader = new FBXLoader();

    let root: THREE.Object3D | null = null;
    let upperBodyNode: THREE.Object3D | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    const actions = new Map<keyof typeof ANIMATION_PATHS, THREE.AnimationAction>();
    let activeAction: THREE.AnimationAction | null = null;
    let activeClipName = 'none';
    let speakingAmount = 0;
    let speakingTarget = 0;
    const stateIntensity = {
      walk: 0,
      greeting: 0,
      listening: 0,
      success: 0,
      error: 0,
    };

    const fadeToAction = (
      clipName: keyof typeof ANIMATION_PATHS,
      config: { once?: boolean; fade?: number; clampWhenFinished?: boolean; timeScale?: number } = {}
    ) => {
      const action = actions.get(clipName);
      if (!action || !mixer) return null;

      const fade = config.fade ?? 0.26;
      action.enabled = true;
      action.reset();
      action.setEffectiveTimeScale(config.timeScale ?? 1);
      action.setEffectiveWeight(1);
      action.setLoop(config.once ? THREE.LoopOnce : THREE.LoopRepeat, config.once ? 1 : Infinity);
      action.clampWhenFinished = config.clampWhenFinished ?? !!config.once;

      if (activeAction && activeAction !== action) {
        activeAction.crossFadeTo(action, fade, true);
      }

      action.fadeIn(fade);
      action.play();
      activeAction = action;
      activeClipName = clipName;
      return action;
    };

    const waitForActionFinish = (action: THREE.AnimationAction, token: number) => {
      return new Promise<boolean>((resolve) => {
        if (!mixer) {
          resolve(false);
          return;
        }

        const timeout = window.setTimeout(() => {
          mixer?.removeEventListener('finished', onFinished);
          resolve(token === sequenceToken);
        }, 4000);

        const onFinished = (event: any) => {
          if (event.action !== action) return;
          window.clearTimeout(timeout);
          mixer?.removeEventListener('finished', onFinished);
          resolve(token === sequenceToken);
        };

        mixer.addEventListener('finished', onFinished);
      });
    };

    const setRobotStateInternal = async (stateName: RobotAssistantState) => {
      if (!mixer) {
        pendingStateRef.current = stateName;
        return;
      }

      sequenceToken += 1;
      const token = sequenceToken;
      currentStateRef.current = stateName;

      const holdStateThenIdle = (ms: number) => {
        window.setTimeout(() => {
          if (token === sequenceToken && currentStateRef.current === stateName) {
            void setRobotStateInternal('idle');
          }
        }, ms);
      };

      switch (stateName) {
        case 'idle':
          speakingTarget = 0;
          fadeToAction('idle', { once: false, fade: 0.25 });
          return;
        case 'walk':
          speakingTarget = 0;
          fadeToAction('walk', { once: false, fade: 0.28 });
          return;
        case 'greeting': {
          speakingTarget = 0;
          const waveAction = fadeToAction('wave', { once: true, fade: 0.2, clampWhenFinished: true });
          if (!waveAction) {
            // Keep a short greeting pose even without mapped clips.
            holdStateThenIdle(900);
            return;
          }

          const ok = await waitForActionFinish(waveAction, token);
          if (ok) {
            setRobotStateInternal('idle');
          }
          return;
        }
        case 'listening':
          speakingTarget = 0;
          if (!fadeToAction('listen', { once: false, fade: 0.24 })) {
            fadeToAction('idle', { once: false, fade: 0.24 });
          }
          return;
        case 'speaking':
          speakingTarget = 1;
          fadeToAction('idle', { once: false, fade: 0.22 });
          return;
        case 'success': {
          speakingTarget = 0;
          const nodAction = fadeToAction('nod', { once: true, fade: 0.2, clampWhenFinished: true });
          if (!nodAction) {
            // Fallback so success still feels intentional without skeletal clips.
            holdStateThenIdle(1200);
            return;
          }

          const nodDone = await waitForActionFinish(nodAction, token);
          if (!nodDone) return;

          const happyAction = fadeToAction('happy', { once: true, fade: 0.22, clampWhenFinished: true });
          if (!happyAction) {
            holdStateThenIdle(700);
            return;
          }

          const happyDone = await waitForActionFinish(happyAction, token);
          if (happyDone) {
            setRobotStateInternal('idle');
          }
          return;
        }
        case 'error': {
          speakingTarget = 0;
          const concernAction = fadeToAction('concern', { once: true, fade: 0.2, clampWhenFinished: true });
          if (!concernAction) {
            holdStateThenIdle(1000);
            return;
          }

          const ok = await waitForActionFinish(concernAction, token);
          if (ok) {
            setRobotStateInternal('idle');
          }
          return;
        }
        default:
          return;
      }
    };

    const speakInternal = (text: string) => {
      return new Promise<void>((resolve) => {
        if (!window.speechSynthesis) {
          resolve();
          return;
        }

        const synth = window.speechSynthesis;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.92;
        utterance.pitch = 1.05;

        const voices = synth.getVoices();
        const preferredVoice = voices.find(
          (voice) =>
            voice.name.includes('Samantha') ||
            voice.name.includes('Google') ||
            voice.name.includes('Victoria') ||
            voice.name.includes('Moira')
        );
        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }

        utterance.onstart = () => {
          void setRobotStateInternal('speaking');
        };

        utterance.onend = () => {
          void setRobotStateInternal('idle');
          resolve();
        };

        utterance.onerror = () => {
          void setRobotStateInternal('idle');
          resolve();
        };

        synth.cancel();
        synth.speak(utterance);
      });
    };

    setStateApiRef.current = (stateName: RobotAssistantState) => {
      void setRobotStateInternal(stateName);
    };
    speakApiRef.current = speakInternal;
    window.opsiqRobot = {
      setRobotState: (stateName) => setStateApiRef.current(stateName),
      speak: (text) => speakApiRef.current(text),
      getState: () => currentStateRef.current,
    };

    const loadAssets = async () => {
      try {
        const gltf = await gltfLoader.loadAsync(modelUrl);
        if (destroyed) return;

        root = gltf.scene;
        scene.add(root);

        let hasSkinnedMesh = false;
        root.traverse((node) => {
          if ((node as THREE.SkinnedMesh).isSkinnedMesh) {
            hasSkinnedMesh = true;
          }
        });

        upperBodyNode = null;
        root.traverse((node) => {
          if (upperBodyNode) return;
          const token = normalizeNodeToken(node.name || '');
          if (token.includes('spine') || token.includes('chest') || token.includes('upperchest') || token.includes('neck')) {
            upperBodyNode = node;
          }
        });

        mixer = new THREE.AnimationMixer(root);

        const entries = Object.entries(ANIMATION_PATHS) as Array<[keyof typeof ANIMATION_PATHS, string]>;
        const clipMap: LoadedClipMap = {};

        if (!hasSkinnedMesh) {
          setRigStatus({
            rigged: false,
            reason: 'This GLB has no skeleton/SkinnedMesh, so external FBX animations cannot drive it.',
          });

          window.opsiqRobotDebug = {
            loadedClips: [],
            missingClips: entries.map(([name]) => name),
            clipTrackCounts: {},
            activeClip: 'none',
            state: currentStateRef.current,
            modelRigged: false,
            reason: 'GLB has no skinned mesh/skeleton. FBX skeletal clips cannot be applied.',
          };

          console.warn('RobotScene: Loaded GLB is not rigged (no SkinnedMesh). Using procedural fallback motion only.');

          applyObjectFraming(root, camera, speakLight);
          basePosition.copy(root.position);
          baseRotation.copy(root.rotation);
          return;
        }

        await Promise.all(
          entries.map(async ([name, path]) => {
            try {
              const clip = await loadFbxClip(fbxLoader, path, name);
              if (clip && root) {
                const remappedClip = remapClipTracksToTarget(clip, root);
                if (remappedClip) {
                  clipMap[name] = remappedClip;
                }
              }
            } catch (error) {
              console.warn(`Failed loading animation clip ${name} from ${path}`, error);
            }
          })
        );

        const loadedNames = Object.keys(clipMap);
        const missingNames = entries.map(([name]) => name).filter((name) => !clipMap[name]);
        const clipTrackCounts = Object.fromEntries(
          Object.entries(clipMap).map(([name, clip]) => [name, clip.tracks.length])
        );
        setRigStatus({ rigged: true });

        window.opsiqRobotDebug = {
          loadedClips: loadedNames,
          missingClips: missingNames,
          clipTrackCounts,
          activeClip: 'none',
          state: currentStateRef.current,
          modelRigged: true,
        };

        if (loadedNames.length === 0) {
          console.warn('RobotScene: FBX clips loaded but none mapped to GLB rig. Check bone naming compatibility.');
        }

        for (const [name, clip] of Object.entries(clipMap) as Array<[keyof typeof ANIMATION_PATHS, THREE.AnimationClip]>) {
          const action = mixer.clipAction(clip);
          action.enabled = true;
          actions.set(name, action);
        }

        applyObjectFraming(root, camera, speakLight);
        basePosition.copy(root.position);
        baseRotation.copy(root.rotation);

        void setRobotStateInternal(pendingStateRef.current);
      } catch (error) {
        console.error('Failed to load robot assets', error);
      }
    };

    void loadAssets();

    const animate = (time?: number) => {
      if (typeof time === 'number') {
        timer.update(time);
      } else {
        timer.update();
      }
      const delta = Math.min(timer.getDelta(), 0.033);
      const t = timer.getElapsed();

      if (mixer) {
        mixer.update(delta);
      }

      if (root) {
        speakingAmount = THREE.MathUtils.damp(speakingAmount, speakingTarget, 8, delta);

        stateIntensity.walk = THREE.MathUtils.damp(stateIntensity.walk, currentStateRef.current === 'walk' ? 1 : 0, 6, delta);
        stateIntensity.greeting = THREE.MathUtils.damp(stateIntensity.greeting, currentStateRef.current === 'greeting' ? 1 : 0, 7, delta);
        stateIntensity.listening = THREE.MathUtils.damp(stateIntensity.listening, currentStateRef.current === 'listening' ? 1 : 0, 7, delta);
        stateIntensity.success = THREE.MathUtils.damp(stateIntensity.success, currentStateRef.current === 'success' ? 1 : 0, 8, delta);
        stateIntensity.error = THREE.MathUtils.damp(stateIntensity.error, currentStateRef.current === 'error' ? 1 : 0, 8, delta);

        const idleBreath = Math.sin(t * 1.5) * 0.006;
        const speakingBob = Math.sin(t * 4.8) * 0.012 * speakingAmount;
        const speakingYaw = Math.sin(t * 3.2) * 0.025 * speakingAmount;
        const walkStrafe = Math.sin(t * 1.8) * 0.08 * stateIntensity.walk;
        const greetWave = Math.sin(t * 6.2) * 0.06 * stateIntensity.greeting;
        const listeningLean = -0.06 * stateIntensity.listening;
        const successNod = Math.abs(Math.sin(t * 7.8)) * 0.08 * stateIntensity.success;
        const errorTilt = Math.sin(t * 5.3) * 0.04 * stateIntensity.error;

        root.position.x = THREE.MathUtils.damp(root.position.x, basePosition.x + walkStrafe, 8, delta);
        root.position.y = THREE.MathUtils.damp(root.position.y, basePosition.y + idleBreath + speakingBob, 8, delta);
        root.rotation.y = THREE.MathUtils.damp(root.rotation.y, baseRotation.y + speakingYaw + greetWave * 0.35, 8, delta);
        root.rotation.x = THREE.MathUtils.damp(
          root.rotation.x,
          baseRotation.x + Math.sin(t * 5.5) * 0.01 * speakingAmount + listeningLean + successNod,
          9,
          delta
        );
        root.rotation.z = THREE.MathUtils.damp(root.rotation.z, baseRotation.z + errorTilt + greetWave * 0.15, 9, delta);

        if (upperBodyNode) {
          const targetUpperRotX = Math.sin(t * 7.4) * 0.045 * speakingAmount + listeningLean * 0.7 + successNod * 0.45;
          const targetUpperRotY = greetWave * 0.5 + speakingYaw * 0.5;
          const targetUpperRotZ = errorTilt * 0.6;
          upperBodyNode.rotation.x = THREE.MathUtils.damp(upperBodyNode.rotation.x, targetUpperRotX, 10, delta);
          upperBodyNode.rotation.y = THREE.MathUtils.damp(upperBodyNode.rotation.y, targetUpperRotY, 10, delta);
          upperBodyNode.rotation.z = THREE.MathUtils.damp(upperBodyNode.rotation.z, targetUpperRotZ, 10, delta);
        }
      }

      const stateGlowTarget =
        currentStateRef.current === 'success'
          ? 0.5
          : currentStateRef.current === 'error'
            ? 0.22
            : currentStateRef.current === 'listening'
              ? 0.2
              : 0.1;
      const speakingPulse = speakingAmount * (0.2 + (Math.sin(t * 12.5) * 0.5 + 0.5) * 0.38);
      const glow = stateGlowTarget + speakingPulse;
      speakLight.intensity = THREE.MathUtils.damp(speakLight.intensity, glow, 10, delta);

      renderer.render(scene, camera);

      if (window.opsiqRobotDebug) {
        window.opsiqRobotDebug.activeClip = activeClipName;
        window.opsiqRobotDebug.state = currentStateRef.current;
      }

      rafId = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      if (root) {
        applyObjectFraming(root, camera, speakLight);
        basePosition.copy(root.position);
        baseRotation.copy(root.rotation);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      destroyed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      setRigStatus({ rigged: null });

      if (window.opsiqRobot?.getState === undefined || window.opsiqRobot?.getState() === currentStateRef.current) {
        delete window.opsiqRobot;
      }
      delete window.opsiqRobotDebug;

      window.speechSynthesis?.cancel();

      for (const action of actions.values()) {
        action.stop();
      }
      mixer?.stopAllAction();

      scene.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;

        mesh.geometry?.dispose();

        const material = mesh.material;
        if (Array.isArray(material)) {
          material.forEach((mat) => {
            const std = mat as THREE.MeshStandardMaterial;
            std.map?.dispose();
            std.normalMap?.dispose();
            std.roughnessMap?.dispose();
            std.metalnessMap?.dispose();
            std.emissiveMap?.dispose();
            std.aoMap?.dispose();
            mat.dispose();
          });
        } else {
          const std = material as THREE.MeshStandardMaterial;
          std.map?.dispose();
          std.normalMap?.dispose();
          std.roughnessMap?.dispose();
          std.metalnessMap?.dispose();
          std.emissiveMap?.dispose();
          std.aoMap?.dispose();
          material.dispose();
        }
      });

      renderer.dispose();
      renderer.forceContextLoss();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }

      setStateApiRef.current = () => undefined;
      speakApiRef.current = async () => undefined;
    };
  }, [modelUrl]);

  return (
    <div className="robot-scene-panel">
      <div ref={mountRef} className="robot-scene-canvas" />
      {rigStatus.rigged === false && (
        <div className="robot-scene-status robot-scene-status--error">
          <strong>Animation Fallback Mode</strong>
          <p>{rigStatus.reason}</p>
          <p>Robot will still animate procedurally for kiosk states (listening, speaking, success, error).</p>
        </div>
      )}
      {rigStatus.rigged === true && (
        <div className="robot-scene-status robot-scene-status--ok">Rig detected. FBX clips are active.</div>
      )}
    </div>
  );
});
