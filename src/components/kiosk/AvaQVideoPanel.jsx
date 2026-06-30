import React from 'react';

export default function AvaQVideoPanel({ videoSrc, fallbackImage, isPlaying }) {
  return (
    <section className="avaq-video-panel">
      {videoSrc ? (
        <video src={videoSrc} autoPlay muted loop playsInline className="avaq-video" />
      ) : (
        <img src={fallbackImage} alt="AvaQ avatar" className="avaq-video" />
      )}
      <div className="avaq-video-state">{isPlaying ? 'AvaQ speaking...' : 'AvaQ ready'}</div>
    </section>
  );
}
