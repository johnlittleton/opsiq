import React, { useRef, useState } from 'react';
import { avatarStorageService } from '../services/avatarStorageService';

export default function AvatarUploader({ onUploaded, onError, disabled = false }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!/image\/(png|jpeg|jpg)/i.test(file.type)) {
      onError?.('Only PNG/JPG avatars are supported.');
      return;
    }

    setUploading(true);
    try {
      const avatar = await avatarStorageService.saveAvatarFile(file);
      onUploaded?.(avatar);
    } catch (error) {
      onError?.(error?.message || 'Avatar upload failed.');
    } finally {
      setUploading(false);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  return (
    <div className="avaq-uploader">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        onChange={handleUpload}
        disabled={disabled || uploading}
        className="avaq-uploader__input"
      />
      <div className="avaq-uploader__hint">Upload a front-facing PNG/JPG avatar image.</div>
    </div>
  );
}
