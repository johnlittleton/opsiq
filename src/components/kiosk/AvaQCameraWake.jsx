import React from 'react';

export default function AvaQCameraWake({ isPresent, cameraError }) {
  return (
    <section className="avaq-camera-wake">
      <h3>Camera Wake</h3>
      <div className={`avaq-pill ${isPresent ? 'active' : ''}`}>
        {isPresent ? 'Driver detected' : 'Waiting for driver'}
      </div>
      {cameraError ? <div className="avaq-error">Camera error: {cameraError}</div> : null}
    </section>
  );
}
