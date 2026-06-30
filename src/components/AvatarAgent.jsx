import React, { useEffect, useMemo, useRef } from 'react';
import { useFaceLandmarks } from '../hooks/useFaceLandmarks';
import { useLipSync } from '../hooks/useLipSync';

function toCanvasPoint(point, width, height) {
  return {
    x: point.x * width,
    y: point.y * height,
  };
}

function avg(points, fallback) {
  if (!points?.length) return fallback;
  const total = points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 }
  );
  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
}

export default function AvatarAgent({ avatar, isSpeaking, speechLevel, mode }) {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const frameRef = useRef(null);
  const { detectFromImage, landmarks, error: landmarkError, isLoading: isFaceLoading } = useFaceLandmarks();

  const thinking = mode === 'thinking';
  const lookDirection = useMemo(() => {
    if (mode === 'alert') return 'left';
    if (mode === 'happy') return 'right';
    return 'center';
  }, [mode]);

  const pose = useLipSync({
    isSpeaking,
    speechLevel,
    thinking,
    lookDirection,
  });

  useEffect(() => {
    if (!avatar?.dataUrl) {
      imageRef.current = null;
      return;
    }

    const image = new Image();
    image.onload = async () => {
      imageRef.current = image;
      await detectFromImage(image);
    };
    image.src = avatar.dataUrl;
  }, [avatar?.dataUrl, detectFromImage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const width = canvas.clientWidth || 420;
      const height = canvas.clientHeight || 420;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#081225';
      ctx.fillRect(0, 0, width, height);

      const image = imageRef.current;
      if (image) {
        const breatheScale = pose.breath;
        const drawW = width * 0.78 * breatheScale;
        const drawH = height * 0.9 * breatheScale;
        const drawX = (width - drawW) / 2 + pose.lookX * 20;
        const drawY = (height - drawH) / 2 + pose.headY * 80;

        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.rotate(pose.headX);
        ctx.translate(-width / 2, -height / 2);

        ctx.drawImage(image, drawX, drawY, drawW, drawH);

        const mouthPoint = toCanvasPoint(
          avg(landmarks?.mouth, { x: 0.5, y: 0.72 }),
          width,
          height
        );

        const eyePoint = toCanvasPoint(
          avg(landmarks?.eyes, { x: 0.5, y: 0.4 }),
          width,
          height
        );

        const mouthOpenPx = 6 + pose.mouthOpen * 16;
        ctx.fillStyle = 'rgba(17, 24, 39, 0.58)';
        ctx.beginPath();
        ctx.ellipse(mouthPoint.x, mouthPoint.y, 24, mouthOpenPx, 0, 0, Math.PI * 2);
        ctx.fill();

        if (pose.blink > 0) {
          ctx.fillStyle = 'rgba(8, 18, 37, 0.72)';
          ctx.fillRect(eyePoint.x - 42, eyePoint.y - 3, 30, 6);
          ctx.fillRect(eyePoint.x + 12, eyePoint.y - 3, 30, 6);
        }

        if (thinking) {
          ctx.fillStyle = 'rgba(56, 189, 248, 0.75)';
          ctx.beginPath();
          ctx.arc(width - 30, 28, 8 + Math.sin(performance.now() * 0.01) * 2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      } else {
        ctx.fillStyle = '#9fb7d5';
        ctx.font = '16px sans-serif';
        ctx.fillText('Upload an avatar image to begin.', 24, height / 2);
      }

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [landmarks, pose, thinking]);

  return (
    <section className="avaq-agent" aria-label="AvaQ Avatar Panel">
      <canvas className="avaq-agent__canvas" ref={canvasRef} />
      {isFaceLoading && <div className="avaq-agent__status">Detecting face landmarks...</div>}
      {landmarkError && <div className="avaq-agent__status avaq-agent__status--error">{landmarkError}</div>}
    </section>
  );
}
