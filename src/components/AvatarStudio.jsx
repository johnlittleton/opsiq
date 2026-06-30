import React, { useEffect, useMemo, useState } from 'react';
import AvatarUploader from './AvatarUploader';
import { avatarStorageService } from '../services/avatarStorageService';

export default function AvatarStudio({ onAvatarChange }) {
  const [avatars, setAvatars] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [error, setError] = useState(null);

  const activeAvatar = useMemo(() => avatars.find((avatar) => avatar.id === activeId) || null, [avatars, activeId]);

  const refresh = () => {
    const all = avatarStorageService.getAvatars();
    const active = avatarStorageService.getActiveAvatar();
    setAvatars(all);
    setActiveId(active?.id || null);
    onAvatarChange?.(active || null);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleUploaded = (avatar) => {
    setError(null);
    refresh();
    onAvatarChange?.(avatar);
  };

  const handleSetActive = (avatarId) => {
    avatarStorageService.setActiveAvatar(avatarId);
    refresh();
  };

  const handleDelete = (avatarId) => {
    avatarStorageService.deleteAvatar(avatarId);
    refresh();
  };

  return (
    <section className="avaq-studio" aria-label="AvaQ Avatar Studio">
      <div className="avaq-studio__header">
        <h3>Avatar Studio</h3>
      </div>

      <AvatarUploader onUploaded={handleUploaded} onError={setError} />

      {error && <div className="avaq-studio__error">{error}</div>}

      {activeAvatar && (
        <div className="avaq-studio__preview">
          <img src={activeAvatar.dataUrl} alt="Active AvaQ avatar preview" />
          <div className="avaq-studio__preview-label">Active: {activeAvatar.name}</div>
        </div>
      )}

      <div className="avaq-studio__list">
        {avatars.length === 0 && <p className="avaq-studio__empty">No avatar uploaded yet.</p>}

        {avatars.map((avatar) => (
          <div className="avaq-studio__item" key={avatar.id}>
            <img src={avatar.dataUrl} alt={avatar.name} />
            <div className="avaq-studio__item-meta">
              <div className="avaq-studio__item-name">{avatar.name}</div>
              <div className="avaq-studio__item-actions">
                <button
                  type="button"
                  className="avaq-button"
                  onClick={() => handleSetActive(avatar.id)}
                  disabled={avatar.id === activeId}
                >
                  {avatar.id === activeId ? 'Active' : 'Set Active'}
                </button>
                <button
                  type="button"
                  className="avaq-button avaq-button--danger"
                  onClick={() => handleDelete(avatar.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
