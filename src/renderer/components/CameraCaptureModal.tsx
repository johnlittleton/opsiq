import React, { useCallback, useEffect, useRef, useState } from 'react';

type CameraCaptureModalProps = {
  isOpen: boolean;
  busy?: boolean;
  title?: string;
  onClose: () => void;
  onCapture: (file: File) => Promise<void>;
};

export default function CameraCaptureModal({
  isOpen,
  busy = false,
  title = 'Capture Photo',
  onClose,
  onCapture,
}: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef('');
  const [error, setError] = useState('');
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');

  const clearCapturedPreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = '';
    }
    setCapturedPreviewUrl('');
  }, []);

  const stopCurrentStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const refreshCameraList = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setAvailableCameras([]);
      return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === 'videoinput');
    setAvailableCameras(cameras);

    if (!selectedCameraId && cameras.length > 0) {
      setSelectedCameraId(cameras[0].deviceId);
    }
  }, [selectedCameraId]);

  const startCamera = useCallback(async (deviceId?: string) => {
    try {
      setError('');
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera is not supported on this device.');
        return;
      }

      stopCurrentStream();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId
          ? {
              deviceId: { exact: deviceId },
            }
          : {
              facingMode: 'environment',
            },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const activeTrack = stream.getVideoTracks()[0];
      const activeSettings = activeTrack?.getSettings?.();
      if (activeSettings?.deviceId && !deviceId) {
        setSelectedCameraId(String(activeSettings.deviceId));
      }

      await refreshCameraList();
    } catch (err: any) {
      setError(err?.message || 'Unable to open camera. Check camera permissions.');
    }
  }, [refreshCameraList, stopCurrentStream]);

  useEffect(() => {
    if (!isOpen) return;

    setStatusMessage('');
    setCapturedFile(null);
    clearCapturedPreview();
    void startCamera(selectedCameraId || undefined);

    return () => {
      clearCapturedPreview();
      stopCurrentStream();
    };
  }, [clearCapturedPreview, isOpen, selectedCameraId, startCamera, stopCurrentStream]);

  if (!isOpen) {
    return null;
  }

  const handleSnapshot = async () => {
    if (busy) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('Unable to capture image context.');
      return;
    }

    ctx.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.92);
    });

    if (!blob) {
      setError('Failed to capture image.');
      return;
    }

    const file = new File([blob], `dock-photo-${Date.now()}.jpg`, {
      type: 'image/jpeg',
    });

    clearCapturedPreview();

    setCapturedFile(file);
    const previewUrl = URL.createObjectURL(file);
    previewUrlRef.current = previewUrl;
    setCapturedPreviewUrl(previewUrl);
    setStatusMessage('Photo captured. Upload or retake.');
  };

  const handleUploadCaptured = async () => {
    if (busy || !capturedFile) return;

    try {
      await onCapture(capturedFile);
      clearCapturedPreview();
      setCapturedFile(null);
      setStatusMessage('Uploaded. You can take another photo or close.');
    } catch {
      // Parent handler shows upload errors.
    }
  };

  const handleRetake = () => {
    clearCapturedPreview();
    setCapturedFile(null);
    setStatusMessage('');
  };

  const handleCameraSelectionChange = async (nextCameraId: string) => {
    setSelectedCameraId(nextCameraId);
    setCapturedFile(null);
    clearCapturedPreview();
    setStatusMessage('');
    await startCamera(nextCameraId);
  };

  return (
    <div className="dock-checker-camera-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="dock-checker-camera-modal__panel">
        <div className="dock-checker-camera-modal__header">
          <h2>{title}</h2>
          <button type="button" onClick={onClose} disabled={busy}>Close</button>
        </div>

        {availableCameras.length > 0 && (
          <div className="dock-checker-camera-modal__controls">
            <label htmlFor="dock-camera-select">Camera</label>
            <select
              id="dock-camera-select"
              value={selectedCameraId}
              onChange={(e) => void handleCameraSelectionChange(e.target.value)}
              disabled={busy}
            >
              {availableCameras.map((camera, index) => (
                <option key={camera.deviceId || `${index}`} value={camera.deviceId}>
                  {camera.label || `Camera ${index + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {error ? (
          <div className="dock-checker-camera-modal__error">{error}</div>
        ) : capturedPreviewUrl ? (
          <img src={capturedPreviewUrl} alt="Captured preview" className="dock-checker-camera-modal__preview" />
        ) : (
          <video ref={videoRef} className="dock-checker-camera-modal__video" autoPlay playsInline muted />
        )}

        {statusMessage && !error && (
          <div className="dock-checker-camera-modal__status">{statusMessage}</div>
        )}

        <div className="dock-checker-camera-modal__actions">
          <button type="button" className="dock-checker-form__secondary" onClick={onClose} disabled={busy}>
            Done
          </button>
          {capturedFile ? (
            <>
              <button type="button" className="dock-checker-form__secondary" onClick={handleRetake} disabled={busy}>
                Retake
              </button>
              <button type="button" className="dock-checker-form__submit" onClick={handleUploadCaptured} disabled={busy || !!error}>
                {busy ? 'Uploading...' : 'Upload Photo'}
              </button>
            </>
          ) : (
            <button type="button" className="dock-checker-form__submit" onClick={handleSnapshot} disabled={busy || !!error}>
              Take Snapshot
            </button>
          )}
        </div>
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
