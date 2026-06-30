import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './AvaqFbxAvatar.css';

type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'confused' | 'happy' | 'concerned';

type MorphTargetRef = {
  mesh: THREE.Mesh;
  name: string;
  index: number;
};

type RigBoneName =
  | 'head'
  | 'neck'
  | 'jaw'
  | 'spine'
  | 'chest'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftUpperArm'
  | 'rightUpperArm';

type RigBoneMap = Partial<Record<RigBoneName, THREE.Bone>>;
type RigBonePoseMap = Partial<Record<RigBoneName, THREE.Euler>>;

interface AvaqFbxAvatarProps {
  state: AvatarState;
  speechLevel?: number;
}

const fbxUrl = new URL('../assets/avatar/avatar.fbx', import.meta.url).href;
const glbUrl = new URL('../assets/avatar/avatar.glb', import.meta.url).href;
const gltfUrl = new URL('../assets/avatar/avatar.gltf', import.meta.url).href;
const AVATAR_BASE_YAW = -Math.PI / 2;

export const AvaqFbxAvatar: React.FC<AvaqFbxAvatarProps> = ({ state, speechLevel = 0 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const morphTargetsRef = useRef<MorphTargetRef[]>([]);
  const hasLipMorphRef = useRef(false);
  const rigBonesRef = useRef<RigBoneMap>({});
  const rigBoneBasePoseRef = useRef<RigBonePoseMap>({});
  const avatarRef = useRef<THREE.Object3D | null>(null);
  const avatarHeightRef = useRef(0);
  const avatarBasePositionRef = useRef(new THREE.Vector3(0, 0, 0));
  const avatarBaseYawRef = useRef(0);
  const mouseTargetRef = useRef({ x: 0, y: 0 });
  const stateRef = useRef<AvatarState>(state);
  const speechLevelRef = useRef(0);
  const nextBlinkAtRef = useRef(performance.now() + 2500);
  const blinkEndAtRef = useRef(0);
  const nextSaccadeAtRef = useRef(performance.now() + 9000);
  const saccadeEndAtRef = useRef(0);
  const saccadeYawRef = useRef(0);
  const saccadePitchRef = useRef(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const setMorphByKeywords = (keywords: string[], value: number) => {
    const keys = keywords.map((k) => k.toLowerCase());
    morphTargetsRef.current.forEach((target) => {
      const name = target.name.toLowerCase();
      if (keys.some((key) => name.includes(key))) {
        const influences = (target.mesh as any).morphTargetInfluences as number[] | undefined;
        if (influences) influences[target.index] = value;
      }
    });
  };

  const setMorphByPatterns = (patterns: RegExp[], value: number) => {
    morphTargetsRef.current.forEach((target) => {
      const name = target.name;
      if (patterns.some((pattern) => pattern.test(name))) {
        const influences = (target.mesh as any).morphTargetInfluences as number[] | undefined;
        if (influences) influences[target.index] = value;
      }
    });
  };

  const setBoneOffset = (
    boneName: RigBoneName,
    rotation: Partial<Record<'x' | 'y' | 'z', number>>
  ) => {
    const bone = rigBonesRef.current[boneName];
    const basePose = rigBoneBasePoseRef.current[boneName];
    if (!bone || !basePose) {
      return;
    }

    bone.rotation.x = basePose.x + (rotation.x || 0);
    bone.rotation.y = basePose.y + (rotation.y || 0);
    bone.rotation.z = basePose.z + (rotation.z || 0);
  };

  const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

  const updateMouseTarget = (clientX: number, clientY: number) => {
    const x = (clientX / Math.max(1, window.innerWidth)) * 2 - 1;
    const y = -((clientY / Math.max(1, window.innerHeight)) * 2 - 1);
    mouseTargetRef.current.x = THREE.MathUtils.clamp(x, -1, 1);
    mouseTargetRef.current.y = THREE.MathUtils.clamp(y, -1, 1);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 1000);
    camera.position.set(0, 1.4, 9.6);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.max(1, Math.min(window.devicePixelRatio * 1.25, 3)));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    const ambient = new THREE.AmbientLight(0xffffff, 1.8);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 4, 5);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x4fd9ff, 1.5);
    rim.position.set(-3, 2, -2);
    scene.add(rim);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.enableRotate = false;
    controls.target.set(0, 1.2, 0);
    controls.minDistance = 9.6;
    controls.maxDistance = 9.6;

    const fbxLoader = new FBXLoader();
    const gltfLoader = new GLTFLoader();
    const clock = new THREE.Clock();
    let animationFrameId = 0;
    let mounted = true;

    const handlePointerMove = (event: PointerEvent) => {
      updateMouseTarget(event.clientX, event.clientY);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    const frameAvatar = (box: THREE.Box3) => {
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);

      const sphere = new THREE.Sphere();
      box.getBoundingSphere(sphere);
      const safeRadius = Math.max(sphere.radius, 0.001);
      const fitVertical = safeRadius / Math.sin(verticalFov / 2);
      const fitHorizontal = safeRadius / Math.sin(horizontalFov / 2);
      const distance = Math.max(fitVertical, fitHorizontal) * 1.25;
      const targetY = center.y + size.y * 0.1;

      camera.position.set(center.x, targetY, center.z + distance);
      controls.target.set(center.x, targetY, center.z);
      controls.minDistance = distance;
      controls.maxDistance = distance;
      camera.updateProjectionMatrix();
      controls.update();
    };

    const normalizeAvatar = (object: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(object);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      object.position.sub(center);
      const scale = 3.2 / Math.max(size.y, 0.001);
      object.scale.setScalar(scale);
      const scaledHeight = size.y * scale;
      avatarHeightRef.current = scaledHeight;
      object.position.y = scaledHeight / 2;
      object.rotation.y = AVATAR_BASE_YAW;
      avatarBaseYawRef.current = object.rotation.y;

      const framedBox = new THREE.Box3().setFromObject(object);
      frameAvatar(framedBox);
    };

    const collectRigParts = (root: THREE.Object3D) => {
      const nextMorphTargets: MorphTargetRef[] = [];
      const nextRigBones: RigBoneMap = {};
      const allBones: THREE.Bone[] = [];

      const hasToken = (value: string, patterns: RegExp[]) => patterns.some((p) => p.test(value));
      const leftPatterns = [/(^|[^a-z])l([^a-z]|$)/, /left/, /_l$/, /\.l$/, /-l$/];
      const rightPatterns = [/(^|[^a-z])r([^a-z]|$)/, /right/, /_r$/, /\.r$/, /-r$/];

      const matchBone = (lowerName: string) => {
        if (!nextRigBones.head && lowerName.includes('head')) return 'head';
        if (!nextRigBones.neck && lowerName.includes('neck')) return 'neck';
        if (!nextRigBones.jaw && (lowerName.includes('jaw') || lowerName.includes('chin'))) return 'jaw';
        if (!nextRigBones.chest && (lowerName.includes('chest') || lowerName.includes('upperchest') || lowerName.includes('spine2'))) return 'chest';
        if (!nextRigBones.spine && lowerName.includes('spine')) return 'spine';

        const isShoulderLike = lowerName.includes('shoulder') || lowerName.includes('clavicle') || lowerName.includes('clav');
        const isUpperArmLike =
          (lowerName.includes('arm') && !lowerName.includes('forearm') && !lowerName.includes('lowerarm') && !lowerName.includes('hand')) ||
          lowerName.includes('upperarm');

        const isLeft = hasToken(lowerName, leftPatterns);
        const isRight = hasToken(lowerName, rightPatterns);

        if (!nextRigBones.leftShoulder && isShoulderLike && isLeft) return 'leftShoulder';
        if (!nextRigBones.rightShoulder && isShoulderLike && isRight) return 'rightShoulder';
        if (!nextRigBones.leftUpperArm && isUpperArmLike && isLeft) return 'leftUpperArm';
        if (!nextRigBones.rightUpperArm && isUpperArmLike && isRight) return 'rightUpperArm';

        return null;
      };

      root.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.frustumCulled = false;

          const applyTextureSettings = (material: THREE.Material | undefined) => {
            if (!material) return;
            const standardMaterial = material as THREE.MeshStandardMaterial;
            if (standardMaterial.map) {
              standardMaterial.map.anisotropy = maxAnisotropy;
              standardMaterial.map.needsUpdate = true;
            }
          };

          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((mat) => applyTextureSettings(mat));
          } else {
            applyTextureSettings(mesh.material);
          }

          const morphTargetDictionary = (mesh as any).morphTargetDictionary as Record<string, number> | undefined;
          const morphTargetInfluences = (mesh as any).morphTargetInfluences as number[] | undefined;

          if (morphTargetDictionary && morphTargetInfluences) {
            Object.entries(morphTargetDictionary).forEach(([name, index]) => {
              nextMorphTargets.push({ mesh, name, index });
            });
          }
        }

        const candidate = child as THREE.Bone;
        if ((candidate as any).isBone || candidate.type === 'Bone') {
          allBones.push(candidate);
          const lowerName = candidate.name.toLowerCase();
          const boneKey = matchBone(lowerName);
          if (boneKey) {
            nextRigBones[boneKey] = candidate;
          }
        }
      });

      root.updateMatrixWorld(true);

      // Spatial fallback for rigs with non-standard arm names.
      const chestOrSpine = nextRigBones.chest || nextRigBones.spine || nextRigBones.neck;
      if (chestOrSpine && (!nextRigBones.leftUpperArm || !nextRigBones.rightUpperArm)) {
        const chestPos = new THREE.Vector3();
        chestOrSpine.getWorldPosition(chestPos);

        const lateralCandidates = allBones
          .map((bone) => {
            const pos = new THREE.Vector3();
            bone.getWorldPosition(pos);
            return { bone, pos };
          })
          .filter(({ bone, pos }) => {
            const n = bone.name.toLowerCase();
            if (n.includes('head') || n.includes('neck') || n.includes('jaw') || n.includes('finger') || n.includes('hand')) {
              return false;
            }

            const lateral = Math.abs(pos.x - chestPos.x);
            const vertical = Math.abs(pos.y - chestPos.y);
            return lateral > 0.08 && lateral < 1.4 && vertical < 0.9;
          });

        const leftCandidate = lateralCandidates
          .filter(({ pos }) => pos.x < chestPos.x)
          .sort((a, b) => Math.abs(a.pos.y - chestPos.y) - Math.abs(b.pos.y - chestPos.y))[0]?.bone;

        const rightCandidate = lateralCandidates
          .filter(({ pos }) => pos.x > chestPos.x)
          .sort((a, b) => Math.abs(a.pos.y - chestPos.y) - Math.abs(b.pos.y - chestPos.y))[0]?.bone;

        if (!nextRigBones.leftUpperArm && leftCandidate) nextRigBones.leftUpperArm = leftCandidate;
        if (!nextRigBones.rightUpperArm && rightCandidate) nextRigBones.rightUpperArm = rightCandidate;
      }

      // Fallbacks for rigs with uncommon naming conventions.
      if (!nextRigBones.leftUpperArm || !nextRigBones.rightUpperArm) {
        const upperArmCandidates = allBones.filter((bone) => {
          const n = bone.name.toLowerCase();
          return (n.includes('arm') || n.includes('upper')) && !n.includes('forearm') && !n.includes('lowerarm') && !n.includes('hand');
        });

        const leftCandidate = upperArmCandidates.find((bone) => hasToken(bone.name.toLowerCase(), leftPatterns));
        const rightCandidate = upperArmCandidates.find((bone) => hasToken(bone.name.toLowerCase(), rightPatterns));

        if (!nextRigBones.leftUpperArm && leftCandidate) nextRigBones.leftUpperArm = leftCandidate;
        if (!nextRigBones.rightUpperArm && rightCandidate) nextRigBones.rightUpperArm = rightCandidate;
      }

      if (!nextRigBones.leftShoulder || !nextRigBones.rightShoulder) {
        const shoulderCandidates = allBones.filter((bone) => {
          const n = bone.name.toLowerCase();
          return n.includes('shoulder') || n.includes('clav') || n.includes('clavicle');
        });

        const leftCandidate = shoulderCandidates.find((bone) => hasToken(bone.name.toLowerCase(), leftPatterns));
        const rightCandidate = shoulderCandidates.find((bone) => hasToken(bone.name.toLowerCase(), rightPatterns));

        if (!nextRigBones.leftShoulder && leftCandidate) nextRigBones.leftShoulder = leftCandidate;
        if (!nextRigBones.rightShoulder && rightCandidate) nextRigBones.rightShoulder = rightCandidate;
      }

      morphTargetsRef.current = nextMorphTargets;
      const morphNames = nextMorphTargets.map((m) => m.name.toLowerCase());
      hasLipMorphRef.current = morphNames.some((name) =>
        /mouth|jaw|viseme|v_aa|v_ih|v_ou|a$|i$|u$|e$|o$/i.test(name)
      );
      rigBonesRef.current = nextRigBones;
      rigBoneBasePoseRef.current = Object.fromEntries(
        Object.entries(nextRigBones).map(([key, bone]) => [
          key,
          new THREE.Euler(bone.rotation.x, bone.rotation.y, bone.rotation.z, bone.rotation.order),
        ])
      ) as RigBonePoseMap;
    };

    const resize = () => {
      const w = Math.max(1, Math.floor(canvas.clientWidth || canvas.parentElement?.clientWidth || 560));
      const h = Math.max(1, Math.floor(canvas.clientHeight || canvas.parentElement?.clientHeight || 560));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      if (avatarHeightRef.current > 0 && avatarRef.current) {
        const box = new THREE.Box3().setFromObject(avatarRef.current);
        frameAvatar(box);
      }
    };

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      const t = performance.now() * 0.001;
      const nowMs = performance.now();
      const speech = clamp01(speechLevelRef.current);

      controls.update();

      const avatar = avatarRef.current;
      if (avatar) {
        avatar.rotation.y = avatarBaseYawRef.current;
        const basePos = avatarBasePositionRef.current;

        const talkingOrListening = stateRef.current === 'speaking' || stateRef.current === 'listening';
        const walkPhase = t * (talkingOrListening ? 1.12 : 0.42);
        const walkX = talkingOrListening ? Math.sin(walkPhase) * 0.04 : Math.sin(walkPhase) * 0.015;
        const walkZ = talkingOrListening ? Math.sin(walkPhase * 0.7 + 0.8) * 0.012 : 0;
        const idleBreathe = Math.sin(t * 0.9) * 0.018;
        const conversationalBreathe = stateRef.current === 'speaking' ? Math.sin(t * 2.35) * 0.01 : 0;

        avatar.position.y = basePos.y + idleBreathe + conversationalBreathe;
        avatar.position.x = basePos.x + walkX;
        avatar.position.z = basePos.z + walkZ;
        avatar.rotation.z = Math.sin(t * 0.45) * 0.003;
        avatar.rotation.y = avatarBaseYawRef.current + (talkingOrListening ? Math.sin(walkPhase * 0.9) * 0.02 : Math.sin(t * 0.2) * 0.008);
      }

      let baseYaw = 0;
      let basePitch = 0;
      let baseRoll = 0;
      let chestPitch = 0;
      let chestYaw = 0;
      let spineYaw = 0;
      let spineRoll = 0;
      let leftArmPitch = -0.18;
      let rightArmPitch = -0.18;
      let leftArmYaw = -0.08;
      let rightArmYaw = 0.08;
      let leftArmRoll = 0.72;
      let rightArmRoll = -0.72;
      let shoulderLift = 0;

      switch (stateRef.current) {
        case 'speaking':
          baseYaw = Math.sin(t * 1.8) * 0.028 + speech * 0.015;
          basePitch = Math.sin(t * 3.1) * 0.03 - speech * 0.026;
          baseRoll = Math.sin(t * 1.2) * 0.012;
          chestPitch = 0.025 + Math.sin(t * 2.4) * 0.015 + speech * 0.045;
          chestYaw = Math.sin(t * 1.3) * 0.018;
          spineYaw = Math.sin(t * 0.9) * 0.01;
          spineRoll = Math.sin(t * 1.4) * 0.012;
          leftArmPitch += 0.1 + Math.sin(t * 2.1) * 0.05 + speech * 0.05;
          rightArmPitch += 0.08 + Math.sin(t * 2.4 + 0.8) * 0.05 + speech * 0.06;
          leftArmYaw += Math.sin(t * 1.4) * 0.06;
          rightArmYaw += Math.sin(t * 1.45 + 0.5) * 0.06;
          leftArmRoll += Math.sin(t * 1.6) * 0.04;
          rightArmRoll += Math.sin(t * 1.7 + 0.6) * 0.04;
          shoulderLift = speech * 0.02;
          break;
        case 'listening':
          baseYaw = Math.sin(t * 0.8) * 0.018;
          basePitch = -0.03 + Math.sin(t * 0.7) * 0.012;
          baseRoll = Math.sin(t * 0.4) * 0.008;
          chestPitch = 0.03 + Math.sin(t * 0.5) * 0.008;
          chestYaw = Math.sin(t * 0.45) * 0.012;
          spineYaw = Math.sin(t * 0.32) * 0.008;
          leftArmPitch += -0.04;
          rightArmPitch += -0.03;
          leftArmRoll += -0.02;
          rightArmRoll += 0.02;
          break;
        case 'thinking':
          baseYaw = Math.sin(t * 0.45) * 0.02;
          basePitch = Math.sin(t * 0.25) * 0.008;
          baseRoll = -0.035 + Math.sin(t * 0.22) * 0.008;
          chestPitch = 0.01;
          chestYaw = -0.012;
          spineYaw = -0.01;
          spineRoll = -0.01;
          leftArmPitch += -0.03;
          rightArmPitch += 0.01;
          leftArmRoll += -0.04;
          rightArmRoll += 0.07;
          break;
        case 'concerned':
          baseYaw = Math.sin(t * 0.55) * 0.01;
          basePitch = 0.018;
          baseRoll = -0.01;
          chestPitch = -0.01;
          chestYaw = Math.sin(t * 0.35) * 0.006;
          spineRoll = -0.012;
          leftArmPitch += -0.06;
          rightArmPitch += -0.05;
          break;
        case 'happy':
          baseYaw = Math.sin(t * 0.9) * 0.015;
          basePitch = -0.014;
          baseRoll = Math.sin(t * 0.75) * 0.01;
          chestPitch = 0.018;
          chestYaw = Math.sin(t * 0.7) * 0.012;
          spineRoll = Math.sin(t * 0.7) * 0.01;
          leftArmPitch += 0.03;
          rightArmPitch += 0.03;
          leftArmRoll += -0.04;
          rightArmRoll += 0.04;
          break;
        case 'confused':
          baseYaw = Math.sin(t * 0.95) * 0.016;
          basePitch = Math.sin(t * 0.6) * 0.006;
          baseRoll = Math.sin(t * 0.95) * 0.02;
          chestYaw = Math.sin(t * 0.6) * 0.016;
          spineRoll = Math.sin(t * 0.55) * 0.012;
          leftArmPitch += -0.02;
          rightArmPitch += 0.03;
          leftArmRoll += -0.03;
          rightArmRoll += 0.08;
          break;
        default:
          baseYaw = Math.sin(t * 0.22) * 0.006;
          basePitch = Math.sin(t * 0.18) * 0.003;
          baseRoll = Math.sin(t * 0.16) * 0.003;
          chestPitch = 0.007 + Math.sin(t * 0.42) * 0.007;
          chestYaw = Math.sin(t * 0.2) * 0.005;
          spineYaw = Math.sin(t * 0.16) * 0.004;
          spineRoll = Math.sin(t * 0.24) * 0.005;
          leftArmPitch += -0.02 + Math.sin(t * 0.4) * 0.02;
          rightArmPitch += -0.02 + Math.sin(t * 0.38 + 0.6) * 0.02;
          leftArmRoll += -0.02;
          rightArmRoll += 0.02;
          break;
      }

      if (nowMs >= nextSaccadeAtRef.current) {
        saccadeYawRef.current = (Math.random() - 0.5) * 0.05;
        saccadePitchRef.current = (Math.random() - 0.5) * 0.03;
        saccadeEndAtRef.current = nowMs + 260 + Math.random() * 300;
        nextSaccadeAtRef.current = nowMs + 10000 + Math.random() * 15000;
      }

      const saccadeActive = nowMs <= saccadeEndAtRef.current;
      const saccadeYaw = saccadeActive ? saccadeYawRef.current : 0;
      const saccadePitch = saccadeActive ? saccadePitchRef.current : 0;

      gazeTargetRef.current.x += (mouseTargetRef.current.x - gazeTargetRef.current.x) * 0.08;
      gazeTargetRef.current.y += (mouseTargetRef.current.y - gazeTargetRef.current.y) * 0.08;
      const gazeYaw = gazeTargetRef.current.x * 0.08;
      const gazePitch = gazeTargetRef.current.y * 0.06;

      setBoneOffset('head', { x: basePitch + saccadePitch + gazePitch, y: baseYaw + saccadeYaw + gazeYaw, z: baseRoll });
      setBoneOffset('neck', { x: basePitch * 0.35, y: baseYaw * 0.45, z: baseRoll * 0.4 });
      setBoneOffset('chest', { x: chestPitch, y: chestYaw, z: spineRoll * 0.8 });
      setBoneOffset('spine', { x: chestPitch * 0.35, y: spineYaw, z: spineRoll });
      setBoneOffset('leftShoulder', { x: shoulderLift, z: -0.02 - shoulderLift * 0.4 });
      setBoneOffset('rightShoulder', { x: shoulderLift, z: 0.02 + shoulderLift * 0.4 });
      setBoneOffset('leftUpperArm', { x: leftArmPitch, y: leftArmYaw, z: leftArmRoll });
      setBoneOffset('rightUpperArm', { x: rightArmPitch, y: rightArmYaw, z: rightArmRoll });

      const blinkBaseDelay =
        stateRef.current === 'speaking'
          ? 1400
          : stateRef.current === 'listening'
          ? 1800
          : stateRef.current === 'thinking'
          ? 2200
          : 2600;

      if (nowMs >= nextBlinkAtRef.current) {
        blinkEndAtRef.current = nowMs + 110;
        nextBlinkAtRef.current = nowMs + blinkBaseDelay + Math.random() * 2600;
      }

      const blinkActive = nowMs <= blinkEndAtRef.current;
      const blinkValue = blinkActive ? 1 : 0;
      setMorphByKeywords(['blink', 'eyeclose', 'eye_close', 'eyelid'], blinkValue);

      const speakingSignal =
        stateRef.current === 'speaking'
          ? clamp01(Math.max(speech * 1.45, 0.32 + Math.max(0, Math.sin(t * 9.6)) * 0.52))
          : 0;

      const visemePhase = t * 10.5;
      const mouthOpen = speakingSignal;
      const mouthWide = stateRef.current === 'speaking' ? clamp01(0.22 + Math.max(0, Math.sin(visemePhase + 1.1)) * 0.8) * speakingSignal : 0;
      const mouthRound = stateRef.current === 'speaking' ? clamp01(0.18 + Math.max(0, Math.sin(visemePhase + 2.3)) * 0.75) * speakingSignal : 0;

      const visemeOpenPatterns = [
        /mouthopen/i,
        /jawopen/i,
        /mouth_open/i,
        /jaw_open/i,
        /viseme[_-]?aa/i,
        /v_aa/i,
        /^a$/i,
        /^aa$/i,
        /_a$/i,
      ];
      const visemeWidePatterns = [
        /viseme[_-]?(ih|e)/i,
        /v_(ih|e)/i,
        /^i$/i,
        /^e$/i,
        /_i$/i,
        /_e$/i,
        /(wide|smile)/i,
      ];
      const visemeRoundPatterns = [
        /viseme[_-]?(ou|oh|u|o)/i,
        /v_(ou|oh|u|o)/i,
        /^u$/i,
        /^o$/i,
        /_u$/i,
        /_o$/i,
        /(round|pucker)/i,
      ];

      setMorphByPatterns(visemeOpenPatterns, mouthOpen);
      setMorphByPatterns(visemeWidePatterns, mouthWide * 0.75);
      setMorphByPatterns(visemeRoundPatterns, mouthRound * 0.8);

      setBoneOffset('jaw', {
        x: -mouthOpen * (hasLipMorphRef.current ? 0.32 : 0.68),
        z: mouthRound * 0.08,
      });
      setMorphByKeywords(['smile', 'happy'], stateRef.current === 'happy' ? 0.55 : stateRef.current === 'listening' ? 0.16 : 0);
      setMorphByKeywords(['sad', 'angry', 'concern', 'frown'], stateRef.current === 'concerned' ? 0.48 : stateRef.current === 'confused' ? 0.24 : 0);
      setMorphByKeywords(['surprise', 'wide'], stateRef.current === 'confused' ? 0.28 : 0);

      renderer.render(scene, camera);
    };

    const handleLoadedAvatar = (object: THREE.Object3D) => {
      if (!mounted) return;

      avatarRef.current = object;
      normalizeAvatar(object);
      avatarBasePositionRef.current.copy(object.position);
      collectRigParts(object);
      scene.add(object);

      setLoadError(null);
    };

    const loadFbx = () => {
      fbxLoader.load(
        fbxUrl,
        (object) => {
          handleLoadedAvatar(object);
        },
        undefined,
        () => {
          if (!mounted) return;
          setLoadError('Could not load avatar model. Place avatar.glb or avatar.fbx in src/renderer/assets/avatar/.');
        }
      );
    };

    const loadGltfThenFallback = () => {
      gltfLoader.load(
        glbUrl,
        (gltf) => {
          handleLoadedAvatar(gltf.scene);
        },
        undefined,
        () => {
          gltfLoader.load(
            gltfUrl,
            (gltf) => {
              handleLoadedAvatar(gltf.scene);
            },
            undefined,
            () => {
              loadFbx();
            }
          );
        }
      );
    };

    loadGltfThenFallback();

    resize();
    animate();
    window.addEventListener('resize', resize);

    return () => {
      mounted = false;
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', handlePointerMove);
      cancelAnimationFrame(animationFrameId);
      controls.dispose();

      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          const material = mesh.material;
          if (Array.isArray(material)) {
            material.forEach((mat) => mat.dispose());
          } else {
            material?.dispose();
          }
        }
      });

      renderer.dispose();
      morphTargetsRef.current = [];
      rigBonesRef.current = {};
      rigBoneBasePoseRef.current = {};
      avatarRef.current = null;
      avatarHeightRef.current = 0;
      avatarBasePositionRef.current.set(0, 0, 0);
      avatarBaseYawRef.current = 0;
    };
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    speechLevelRef.current = clamp01(speechLevel);
  }, [speechLevel]);

  return (
    <div className="avaq-fbx-avatar">
      <canvas className="avaq-fbx-avatar__canvas" ref={canvasRef} />
      {loadError && <p className="avaq-fbx-avatar__error">{loadError}</p>}
    </div>
  );
};
