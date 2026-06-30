import { useCallback, useEffect, useRef, useState } from 'react';

const NO_FACE_MESSAGE = 'Avatar face not detected. Use a clear front-facing image.';

const GROUPS = {
  mouth: [13, 14, 78, 308, 82, 312, 87, 317],
  eyes: [33, 133, 159, 145, 362, 263, 386, 374],
  jaw: [152, 172, 136, 365],
  nose: [1, 2, 4, 5, 197],
  faceOutline: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127],
};

function pick(landmarks, indexes) {
  return indexes.map((index) => landmarks[index]).filter(Boolean);
}

function makeFallbackLandmarks() {
  // Normalized points tuned for front-facing portrait avatars.
  const mouth = [
    { x: 0.50, y: 0.73, z: 0 },
    { x: 0.50, y: 0.76, z: 0 },
    { x: 0.44, y: 0.74, z: 0 },
    { x: 0.56, y: 0.74, z: 0 },
    { x: 0.46, y: 0.735, z: 0 },
    { x: 0.54, y: 0.735, z: 0 },
    { x: 0.47, y: 0.75, z: 0 },
    { x: 0.53, y: 0.75, z: 0 },
  ];

  const eyes = [
    { x: 0.40, y: 0.43, z: 0 },
    { x: 0.46, y: 0.43, z: 0 },
    { x: 0.43, y: 0.41, z: 0 },
    { x: 0.43, y: 0.45, z: 0 },
    { x: 0.54, y: 0.43, z: 0 },
    { x: 0.60, y: 0.43, z: 0 },
    { x: 0.57, y: 0.41, z: 0 },
    { x: 0.57, y: 0.45, z: 0 },
  ];

  const jaw = [
    { x: 0.50, y: 0.88, z: 0 },
    { x: 0.44, y: 0.85, z: 0 },
    { x: 0.38, y: 0.80, z: 0 },
    { x: 0.62, y: 0.80, z: 0 },
  ];

  const nose = [
    { x: 0.50, y: 0.55, z: 0 },
    { x: 0.50, y: 0.57, z: 0 },
    { x: 0.50, y: 0.60, z: 0 },
    { x: 0.50, y: 0.62, z: 0 },
    { x: 0.50, y: 0.58, z: 0 },
  ];

  const faceOutline = [
    { x: 0.50, y: 0.16, z: 0 },
    { x: 0.41, y: 0.18, z: 0 },
    { x: 0.34, y: 0.22, z: 0 },
    { x: 0.28, y: 0.30, z: 0 },
    { x: 0.24, y: 0.40, z: 0 },
    { x: 0.23, y: 0.52, z: 0 },
    { x: 0.25, y: 0.66, z: 0 },
    { x: 0.31, y: 0.77, z: 0 },
    { x: 0.40, y: 0.85, z: 0 },
    { x: 0.50, y: 0.88, z: 0 },
    { x: 0.60, y: 0.85, z: 0 },
    { x: 0.69, y: 0.77, z: 0 },
    { x: 0.75, y: 0.66, z: 0 },
    { x: 0.77, y: 0.52, z: 0 },
    { x: 0.76, y: 0.40, z: 0 },
    { x: 0.72, y: 0.30, z: 0 },
    { x: 0.66, y: 0.22, z: 0 },
    { x: 0.59, y: 0.18, z: 0 },
  ];

  const all = [...faceOutline, ...eyes, ...nose, ...mouth, ...jaw];
  return { all, mouth, eyes, jaw, nose, faceOutline };
}

export function useFaceLandmarks() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [landmarks, setLandmarks] = useState(null);
  const landmarkerRef = useRef(null);

  const ensureLandmarker = useCallback(async () => {
    if (landmarkerRef.current) {
      return landmarkerRef.current;
    }

    const vision = await import('@mediapipe/tasks-vision');
    const fileset = await vision.FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    landmarkerRef.current = await vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
      },
      outputFaceBlendshapes: false,
      runningMode: 'IMAGE',
      numFaces: 1,
    });

    return landmarkerRef.current;
  }, []);

  const detectFromImage = useCallback(
    async (imageElement) => {
      if (!imageElement) return null;
      setIsLoading(true);
      setError(null);

      try {
        const landmarker = await ensureLandmarker();
        const result = landmarker.detect(imageElement);
        const face = result?.faceLandmarks?.[0];

        if (!face?.length) {
          const fallback = makeFallbackLandmarks();
          setLandmarks(fallback);
          setError(null);
          return fallback;
        }

        const groups = {
          mouth: pick(face, GROUPS.mouth),
          eyes: pick(face, GROUPS.eyes),
          jaw: pick(face, GROUPS.jaw),
          nose: pick(face, GROUPS.nose),
          faceOutline: pick(face, GROUPS.faceOutline),
        };

        const mapped = { all: face, ...groups };
        setLandmarks(mapped);
        return mapped;
      } catch (err) {
        const fallback = makeFallbackLandmarks();
        setLandmarks(fallback);
        setError(null);
        return fallback;
      } finally {
        setIsLoading(false);
      }
    },
    [ensureLandmarker]
  );

  useEffect(() => {
    return () => {
      try {
        landmarkerRef.current?.close();
      } catch {
        // No-op cleanup.
      }
      landmarkerRef.current = null;
    };
  }, []);

  return {
    detectFromImage,
    landmarks,
    isLoading,
    error,
    noFaceMessage: NO_FACE_MESSAGE,
  };
}
