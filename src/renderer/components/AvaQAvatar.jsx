/**
 * AvaQAvatar
 * Full Three.js GLB avatar renderer with:
 *   - Bounding-sphere camera fit (full body always visible)
 *   - Procedural animation states: Idle, Talking, Waving, Walking, BreathingIdle
 *   - Bone-driven head/chest/arm motion per state
 *   - Simulated blink
 *   - Mouse-follow head tracking
 *   - Amplitude-driven jaw / viseme morphs while talking
 *
 * Props:
 *   animationName  string   — 'Idle' | 'Talking' | 'Waving' | 'Walking' | 'BreathingIdle'
 *   amplitude      number   — 0-1 speech loudness fed from useAvaQSpeech
 *   mouseX         number   — optional –1..1 normalised cursor X for head tracking
 *   mouseY         number   — optional –1..1 normalised cursor Y for head tracking
 */
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const glbUrl = new URL('../assets/avatar/avatar.glb', import.meta.url).href;

const ANIM_NAMES = ['Idle', 'Talking', 'Waving', 'Walking', 'BreathingIdle'];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const clamp01 = (v) => clamp(v, 0, 1);

// ---------- bone name matchers ----------
const LEFT_PAT = [/(^|[^a-z])l([^a-z]|$)/i, /left/i, /_l$/i, /\.l$/i, /-l$/i];
const RIGHT_PAT = [/(^|[^a-z])r([^a-z]|$)/i, /right/i, /_r$/i, /\.r$/i, /-r$/i];
const hasToken = (name, pats) => pats.some((p) => p.test(name));

function matchBoneName(lower, map) {
  if (!map.head && lower.includes('head')) return 'head';
  if (!map.neck && lower.includes('neck')) return 'neck';
  if (!map.jaw && (lower.includes('jaw') || lower.includes('chin'))) return 'jaw';
  if (!map.chest && (lower.includes('chest') || lower.includes('upperchest') || lower.includes('spine2'))) return 'chest';
  if (!map.spine && lower.includes('spine')) return 'spine';
  const isL = hasToken(lower, LEFT_PAT);
  const isR = hasToken(lower, RIGHT_PAT);
  const isClav = lower.includes('shoulder') || lower.includes('clav') || lower.includes('clavicle');
  const isArm = (lower.includes('arm') || lower.includes('upperarm')) && !lower.includes('forearm') && !lower.includes('hand');
  if (!map.leftShoulder && isClav && isL) return 'leftShoulder';
  if (!map.rightShoulder && isClav && isR) return 'rightShoulder';
  if (!map.leftUpperArm && isArm && isL) return 'leftUpperArm';
  if (!map.rightUpperArm && isArm && isR) return 'rightUpperArm';
  return null;
}

function collectRig(root) {
  const morphTargets = [];
  const bones = {};
  const allBones = [];

  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.frustumCulled = false;
      const dict = child.morphTargetDictionary;
      const influences = child.morphTargetInfluences;
      if (dict && influences) {
        Object.entries(dict).forEach(([name, idx]) => morphTargets.push({ mesh: child, name, index: idx }));
      }
    }
    if (child.isBone || child.type === 'Bone') {
      allBones.push(child);
      const key = matchBoneName(child.name.toLowerCase(), bones);
      if (key) bones[key] = child;
    }
  });

  // Spatial fallback for arms if naming failed
  const anchor = bones.chest || bones.spine || bones.neck;
  if (anchor && (!bones.leftUpperArm || !bones.rightUpperArm)) {
    root.updateMatrixWorld(true);
    const anchorPos = new THREE.Vector3();
    anchor.getWorldPosition(anchorPos);

    const candidates = allBones
      .filter((b) => {
        const n = b.name.toLowerCase();
        return !/(head|neck|jaw|finger|hand|leg|foot|toe)/i.test(n);
      })
      .map((b) => {
        const p = new THREE.Vector3();
        b.getWorldPosition(p);
        return { b, p };
      })
      .filter(({ p }) => {
        const dx = Math.abs(p.x - anchorPos.x);
        const dy = Math.abs(p.y - anchorPos.y);
        return dx > 0.06 && dx < 1.5 && dy < 1.0;
      });

    if (!bones.leftUpperArm) {
      const lc = candidates.filter(({ p }) => p.x < anchorPos.x)
        .sort((a, b) => Math.abs(a.p.y - anchorPos.y) - Math.abs(b.p.y - anchorPos.y))[0];
      if (lc) bones.leftUpperArm = lc.b;
    }
    if (!bones.rightUpperArm) {
      const rc = candidates.filter(({ p }) => p.x > anchorPos.x)
        .sort((a, b) => Math.abs(a.p.y - anchorPos.y) - Math.abs(b.p.y - anchorPos.y))[0];
      if (rc) bones.rightUpperArm = rc.b;
    }
  }

  const basePose = {};
  Object.entries(bones).forEach(([key, bone]) => {
    basePose[key] = new THREE.Euler(bone.rotation.x, bone.rotation.y, bone.rotation.z, bone.rotation.order);
  });

  const hasMorph = morphTargets.some((m) => /mouth|jaw|viseme|v_aa|v_ih|v_ou|a$|i$|u$|e$|o$/i.test(m.name));

  return { morphTargets, bones, basePose, hasMorph };
}

function frameModel(camera, controls, box) {
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const dist = Math.max(sphere.radius / Math.sin(vFov / 2), sphere.radius / Math.sin(hFov / 2)) * 1.3;
  const targetY = center.y + size.y * 0.08;
  camera.position.set(center.x, targetY, center.z + dist);
  controls.target.set(center.x, targetY, center.z);
  controls.minDistance = dist * 0.9;
  controls.maxDistance = dist * 1.1;
  camera.updateProjectionMatrix();
  controls.update();
}

// ---------- per-animation bone offsets ----------
function getBoneOffsets(anim, t, amplitude) {
  const sp = clamp01(amplitude);
  switch (anim) {
    case 'Talking':
      return {
        head:  { x: Math.sin(t * 1.6) * 0.028 - sp * 0.018, y: Math.sin(t * 2.1) * 0.024, z: Math.sin(t * 1.2) * 0.008 },
        neck:  { x: Math.sin(t * 1.6) * 0.012, y: Math.sin(t * 2.1) * 0.01 },
        chest: { x: 0.02 + Math.sin(t * 2.3) * 0.01 + sp * 0.02, y: Math.sin(t * 1.1) * 0.012 },
        spine: { x: 0.008, y: Math.sin(t * 0.9) * 0.006 },
        leftUpperArm:  { x: -0.18 + Math.sin(t * 1.9) * 0.07 + sp * 0.09, z:  0.72 + Math.sin(t * 1.6) * 0.06 },
        rightUpperArm: { x: -0.18 + Math.sin(t * 2.1 + 0.8) * 0.07 + sp * 0.09, z: -0.72 + Math.sin(t * 1.7 + 0.6) * 0.06 },
      };
    case 'Waving':
      return {
        head:  { x: -0.06, y: Math.sin(t * 1.2) * 0.02 },
        chest: { x: 0.02, y: Math.sin(t * 0.9) * 0.01 },
        leftUpperArm:  { x: -0.18, z: 0.72 },
        rightUpperArm: { x: -1.1 + Math.abs(Math.sin(t * 3.8)) * 0.6, z: -0.3 + Math.sin(t * 3.8) * 0.2 },
      };
    case 'Walking':
      return {
        head:  { x: Math.sin(t * 2.2) * 0.012, y: Math.sin(t * 1.1) * 0.015 },
        chest: { x: 0.015, y: Math.sin(t * 2.2) * 0.018, z: Math.sin(t * 2.2) * 0.012 },
        spine: { y: Math.sin(t * 2.2) * 0.01 },
        leftUpperArm:  { x: -0.18 + Math.sin(t * 2.2) * 0.22, z:  0.72 },
        rightUpperArm: { x: -0.18 - Math.sin(t * 2.2) * 0.22, z: -0.72 },
      };
    case 'BreathingIdle':
      return {
        head:  { x: Math.sin(t * 0.3) * 0.006, y: Math.sin(t * 0.22) * 0.008 },
        chest: { x: Math.sin(t * 0.8) * 0.015 },
        spine: { x: Math.sin(t * 0.8) * 0.006 },
        leftUpperArm:  { x: -0.18 + Math.sin(t * 0.8) * 0.014, z:  0.72 },
        rightUpperArm: { x: -0.18 + Math.sin(t * 0.8) * 0.014, z: -0.72 },
      };
    default: // Idle
      return {
        head:  { x: Math.sin(t * 0.24) * 0.005, y: Math.sin(t * 0.18) * 0.006, z: Math.sin(t * 0.2) * 0.004 },
        chest: { x: 0.006 + Math.sin(t * 0.44) * 0.006 },
        spine: { y: Math.sin(t * 0.18) * 0.003 },
        leftUpperArm:  { x: -0.18 + Math.sin(t * 0.4) * 0.014, z:  0.72 },
        rightUpperArm: { x: -0.18 + Math.sin(t * 0.38 + 0.6) * 0.014, z: -0.72 },
      };
  }
}

// ---------- component ----------
export function AvaQAvatar({ animationName = 'Idle', amplitude = 0, mouseX = 0, mouseY = 0 }) {
  const canvasRef = useRef(null);
  const animNameRef = useRef(animationName);
  const amplitudeRef = useRef(amplitude);
  const mouseXRef = useRef(mouseX);
  const mouseYRef = useRef(mouseY);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => { animNameRef.current = animationName; }, [animationName]);
  useEffect(() => { amplitudeRef.current = amplitude; }, [amplitude]);
  useEffect(() => { mouseXRef.current = mouseX; mouseYRef.current = mouseY; }, [mouseX, mouseY]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 200);
    camera.position.set(0, 1.5, 8);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio * 1.25, 3));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

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

    let rig = null;
    let avatarRoot = null;
    let avatarBasePos = new THREE.Vector3();
    let mounted = true;

    // blink state
    let nextBlinkAt = performance.now() + 2500 + Math.random() * 2000;
    let blinkEndAt = 0;
    // saccade state
    let nextSaccadeAt = performance.now() + 8000 + Math.random() * 6000;
    let saccadeEndAt = 0;
    let saccadeYaw = 0;
    let saccadePitch = 0;

    const clock = new THREE.Clock();
    let raf = 0;
    let maxAnisotropy = 1;

    const setBone = (boneName, offset) => {
      if (!rig) return;
      const bone = rig.bones[boneName];
      const base = rig.basePose[boneName];
      if (!bone || !base) return;
      bone.rotation.x = base.x + (offset.x || 0);
      bone.rotation.y = base.y + (offset.y || 0);
      bone.rotation.z = base.z + (offset.z || 0);
    };

    const setMorph = (patterns, value) => {
      if (!rig) return;
      rig.morphTargets.forEach(({ mesh, index }) => {
        if (!mesh.morphTargetInfluences) return;
        const name = mesh.morphTargetDictionary
          ? Object.entries(mesh.morphTargetDictionary).find(([, i]) => i === index)?.[0] || ''
          : '';
        if (patterns.some((p) => p.test(name))) {
          mesh.morphTargetInfluences[index] = value;
        }
      });
    };

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = performance.now() * 0.001;
      const nowMs = performance.now();
      const sp = clamp01(amplitudeRef.current);
      controls.update();

      if (avatarRoot) {
        const anim = animNameRef.current;
        const basePos = avatarBasePos;

        // gentle whole-body breathe/sway
        const breathe = Math.sin(t * 0.9) * 0.018;
        const swayX = Math.sin(t * 0.45) * (anim === 'Walking' ? 0.12 : 0.025);
        avatarRoot.position.y = basePos.y + breathe;
        avatarRoot.position.x = basePos.x + swayX;
        avatarRoot.rotation.z = Math.sin(t * 0.38) * 0.005;

        // per-state bone offsets
        const offsets = getBoneOffsets(anim, t, sp);
        Object.entries(offsets).forEach(([boneName, off]) => setBone(boneName, off));

        // mouse-follow on head
        if (rig?.bones.head) {
          const base = rig.basePose.head;
          if (base) {
            const headOffsets = offsets.head || {};
            rig.bones.head.rotation.y = base.y + (headOffsets.y || 0) + mouseXRef.current * 0.18;
            rig.bones.head.rotation.x = base.x + (headOffsets.x || 0) - mouseYRef.current * 0.12;
          }
        }

        // saccade (random eye flick)
        if (nowMs >= nextSaccadeAt) {
          saccadeYaw   = (Math.random() - 0.5) * 0.06;
          saccadePitch = (Math.random() - 0.5) * 0.04;
          saccadeEndAt  = nowMs + 280 + Math.random() * 320;
          nextSaccadeAt = nowMs + 9000 + Math.random() * 12000;
        }
        if (rig?.bones.head && rig.basePose.head) {
          const isSaccade = nowMs <= saccadeEndAt;
          if (isSaccade) {
            rig.bones.head.rotation.y += saccadeYaw;
            rig.bones.head.rotation.x += saccadePitch;
          }
        }

        // blink
        const blinkRate = anim === 'Talking' ? 1600 : 2600;
        if (nowMs >= nextBlinkAt) {
          blinkEndAt = nowMs + 110;
          nextBlinkAt = nowMs + blinkRate + Math.random() * 2800;
        }
        const blinkV = nowMs <= blinkEndAt ? 1 : 0;
        setMorph([/blink/i, /eyeclose/i, /eye_close/i, /eyelid/i], blinkV);

        // speaking visemes / jaw
        const speakV = anim === 'Talking'
          ? clamp01(Math.max(sp * 1.4, 0.4 + Math.max(0, Math.sin(t * 9.5)) * 0.4))
          : 0;
        const wideV = anim === 'Talking'
          ? clamp01(0.18 + Math.max(0, Math.sin(t * 10.5 + 1.1)) * 0.72) * speakV
          : 0;
        const roundV = anim === 'Talking'
          ? clamp01(0.14 + Math.max(0, Math.sin(t * 10.5 + 2.3)) * 0.68) * speakV
          : 0;

        setMorph([/mouthopen/i, /jawopen/i, /mouth_open/i, /jaw_open/i, /viseme[_-]?aa/i, /^a$/i, /^aa$/i, /_a$/i, /^ah$/i], speakV);
        setMorph([/viseme[_-]?(ih|e)/i, /^i$/i, /^e$/i, /_i$/i, /_e$/i, /^ee$/i, /wide/i], wideV * 0.75);
        setMorph([/viseme[_-]?(ou|oh|u|o)/i, /^u$/i, /^o$/i, /_u$/i, /_o$/i, /^oo$/i, /round/i, /pucker/i], roundV * 0.8);

        if (rig?.bones.jaw && rig.basePose.jaw) {
          const base = rig.basePose.jaw;
          rig.bones.jaw.rotation.x = base.x - speakV * (rig.hasMorph ? 0.32 : 0.56);
          rig.bones.jaw.rotation.z = base.z + roundV * 0.06;
        }

        // face emotion morphs
        const isHappy = anim === 'Waving';
        setMorph([/smile/i, /happy/i], isHappy ? 0.55 : anim === 'Talking' ? 0.1 : 0);
      }

      renderer.render(scene, camera);
    };

    const onLoaded = (gltf) => {
      if (!mounted) return;

      const root = gltf.scene;

      // scale to fit
      const box0 = new THREE.Box3().setFromObject(root);
      const size0 = new THREE.Vector3();
      box0.getSize(size0);
      const scale = 3.2 / Math.max(size0.y, 0.001);
      root.scale.setScalar(scale);

      // ground the model
      const box1 = new THREE.Box3().setFromObject(root);
      const center1 = new THREE.Vector3();
      box1.getCenter(center1);
      root.position.sub(center1);
      root.position.y += (box1.max.y - box1.min.y) / 2;

      // face forward
      root.rotation.y = -Math.PI / 2;

      // apply texture anisotropy
      maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
      root.traverse((child) => {
        if (!child.isMesh) return;
        const applyMat = (mat) => {
          if (mat?.map) { mat.map.anisotropy = maxAnisotropy; mat.map.needsUpdate = true; }
        };
        Array.isArray(child.material) ? child.material.forEach(applyMat) : applyMat(child.material);
      });

      scene.add(root);
      avatarRoot = root;
      avatarBasePos.copy(root.position);

      rig = collectRig(root);

      const box2 = new THREE.Box3().setFromObject(root);
      frameModel(camera, controls, box2);

      animate();
    };

    new GLTFLoader().load(
      glbUrl,
      onLoaded,
      undefined,
      (err) => {
        if (!mounted) return;
        console.error('AvaQAvatar: failed to load GLB', err);
        setLoadError('Could not load avatar.glb');
      }
    );

    const resize = () => {
      const w = Math.max(1, canvas.clientWidth || 480);
      const h = Math.max(1, canvas.clientHeight || 480);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      if (avatarRoot) {
        frameModel(camera, controls, new THREE.Box3().setFromObject(avatarRoot));
      }
    };

    resize();
    window.addEventListener('resize', resize);

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      controls.dispose();
      scene.traverse((obj) => {
        if (obj.isMesh) {
          obj.geometry?.dispose();
          const mat = obj.material;
          Array.isArray(mat) ? mat.forEach((m) => m.dispose()) : mat?.dispose();
        }
      });
      renderer.dispose();
      avatarRoot = null;
      rig = null;
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      {loadError && (
        <div style={{
          position: 'absolute', bottom: 12, left: 12, right: 12,
          background: 'rgba(127,29,29,0.7)', color: '#fecaca',
          borderRadius: 8, padding: '8px 12px', fontSize: 13,
        }}>
          {loadError}
        </div>
      )}
    </div>
  );
}
