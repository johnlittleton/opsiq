import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { API_BASE } from '../services/config';
import { useAuth } from '../context/AuthContext';
import CameraCaptureModal from '../components/CameraCaptureModal';
import './DockCheckerForms.css';

type UploadedImage = {
  url: string;
  fileName: string;
  fullUrl: string;
  uploadedAt: string;
};

type BoolFields = {
  appliedAllFamousLabels: boolean;
  manifestMatchedPallets: boolean;
  qcIssues: boolean;
  damages: boolean;
  tempRecorderRemoved: boolean;
  trailerTemperatureChecked: boolean;
  paperworkSubmittedToShippingReceiving: boolean;
};

const defaultBools: BoolFields = {
  appliedAllFamousLabels: false,
  manifestMatchedPallets: false,
  qcIssues: false,
  damages: false,
  tempRecorderRemoved: false,
  trailerTemperatureChecked: false,
  paperworkSubmittedToShippingReceiving: false,
};

const yesNo = (
  value: boolean,
  onChange: (next: boolean) => void,
  name: string
) => (
  <div className="dock-checker-form__bool">
    <label>
      <input
        type="radio"
        name={name}
        checked={value === true}
        onChange={() => onChange(true)}
      />
      Yes
    </label>
    <label>
      <input
        type="radio"
        name={name}
        checked={value === false}
        onChange={() => onChange(false)}
      />
      No
    </label>
  </div>
);

export default function InboundDockCheckerForm() {
  const navigate = useNavigate();
  const { executiveName } = useAuth();

  const [referenceNumber, setReferenceNumber] = useState('');
  const [company, setCompany] = useState('');
  const [doorId, setDoorId] = useState('');
  const [checkinId, setCheckinId] = useState('');
  const [palletsOffloaded, setPalletsOffloaded] = useState('0');
  const [qcIssueNotes, setQcIssueNotes] = useState('');
  const [damageNotes, setDamageNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [bools, setBools] = useState<BoolFields>(defaultBools);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const imagePayload = useMemo(
    () => uploadedImages.map((item) => ({ url: item.url, uploadedAt: item.uploadedAt, fileName: item.fileName })),
    [uploadedImages]
  );

  const formatUploadedTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setUploading(true);
    try {
      const uploadedItems: UploadedImage[] = [];
      for (const file of files) {
        const uploaded = await apiClient.uploadDockCheckerImage(file);
        const fileName = String(uploaded.filename || uploaded.url.split('/').pop() || 'image');
        uploadedItems.push({
          url: uploaded.url,
          fileName,
          fullUrl: String(uploaded.url).startsWith('http') ? uploaded.url : `${API_BASE}${uploaded.url}`,
          uploadedAt: String(uploaded.uploadedAt || new Date().toISOString()),
        });
      }
      setUploadedImages((current) => [...current, ...uploadedItems]);
    } catch (error: any) {
      alert(error?.message || 'Image upload failed.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const submit = async () => {
    if (submitting) return;

    const normalizedReference = referenceNumber.trim();
    const offloaded = Number(palletsOffloaded);

    if (!normalizedReference) {
      alert('Sales Order/PO reference is required.');
      return;
    }
    if (!Number.isFinite(offloaded) || offloaded < 0) {
      alert('Pallets off loaded must be a non-negative number.');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.saveInboundDockCheckerForm({
        referenceNumber: normalizedReference,
        company: company.trim(),
        doorId: doorId.trim() ? Number(doorId) : null,
        checkinId: checkinId.trim() ? Number(checkinId) : null,
        palletsOffloaded: offloaded,
        appliedAllFamousLabels: bools.appliedAllFamousLabels,
        manifestMatchedPallets: bools.manifestMatchedPallets,
        qcIssues: bools.qcIssues,
        qcIssueNotes: qcIssueNotes.trim(),
        damages: bools.damages,
        damageNotes: damageNotes.trim(),
        tempRecorderRemoved: bools.tempRecorderRemoved,
        trailerTemperatureChecked: bools.trailerTemperatureChecked,
        paperworkSubmittedToShippingReceiving: bools.paperworkSubmittedToShippingReceiving,
        imagePaths: imagePayload,
        notes: notes.trim(),
        submittedBy: executiveName || 'Dock Team',
      });

      alert('Inbound dock checker form saved.');
      navigate('/dock-checker/history');
    } catch (error: any) {
      alert(error?.message || 'Failed to save inbound form.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCameraCapture = async (file: File) => {
    setUploading(true);
    try {
      const uploaded = await apiClient.uploadDockCheckerImage(file);
      const fileName = String(uploaded.filename || uploaded.url.split('/').pop() || 'image');
      setUploadedImages((current) => [
        ...current,
        {
          url: uploaded.url,
          fileName,
          fullUrl: String(uploaded.url).startsWith('http') ? uploaded.url : `${API_BASE}${uploaded.url}`,
          uploadedAt: String(uploaded.uploadedAt || new Date().toISOString()),
        },
      ]);
    } catch (error: any) {
      alert(error?.message || 'Camera upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="dock-checker-page">
      <CameraCaptureModal
        isOpen={cameraOpen}
        busy={uploading || submitting}
        title="Inbound Photo Capture"
        onClose={() => setCameraOpen(false)}
        onCapture={handleCameraCapture}
      />

      <div className="dock-checker-page__header">
        <h1 className="dock-checker-page__title">Inbound Dock Checker Form</h1>
        <button className="dock-checker-page__home-btn" onClick={() => navigate('/home')}>Back Home</button>
      </div>

      <div className="dock-checker-form">
        <div className="dock-checker-form__scroll">
          <div className="dock-checker-form__grid">
            <div className="dock-checker-form__field">
              <label>Sales Order / PO Reference</label>
              <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="SO or PO number" />
            </div>
            <div className="dock-checker-form__field">
              <label>Company</label>
              <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Optional" />
            </div>
            <div className="dock-checker-form__field">
              <label>Door ID</label>
              <input type="number" min="1" value={doorId} onChange={(e) => setDoorId(e.target.value)} placeholder="Optional" />
            </div>
            <div className="dock-checker-form__field">
              <label>Check-in ID</label>
              <input type="number" min="1" value={checkinId} onChange={(e) => setCheckinId(e.target.value)} placeholder="Optional" />
            </div>
            <div className="dock-checker-form__field">
              <label>How many pallets were off loaded</label>
              <input type="number" min="0" value={palletsOffloaded} onChange={(e) => setPalletsOffloaded(e.target.value)} />
            </div>
          </div>

          <div className="dock-checker-form__questions">
            <div className="dock-checker-form__question">
              <span>Did you apply all Famous labels?</span>
              {yesNo(bools.appliedAllFamousLabels, (next) => setBools((c) => ({ ...c, appliedAllFamousLabels: next })), 'appliedAllFamousLabels')}
            </div>
            <div className="dock-checker-form__question">
              <span>Did the manifest match the pallets?</span>
              {yesNo(bools.manifestMatchedPallets, (next) => setBools((c) => ({ ...c, manifestMatchedPallets: next })), 'manifestMatchedPallets')}
            </div>
            <div className="dock-checker-form__question">
              <span>Any QC issues?</span>
              {yesNo(bools.qcIssues, (next) => setBools((c) => ({ ...c, qcIssues: next })), 'qcIssues')}
            </div>
            <div className="dock-checker-form__question">
              <span>Any damages?</span>
              {yesNo(bools.damages, (next) => setBools((c) => ({ ...c, damages: next })), 'damages')}
            </div>
            <div className="dock-checker-form__question">
              <span>Did you remove the temp recorder?</span>
              {yesNo(bools.tempRecorderRemoved, (next) => setBools((c) => ({ ...c, tempRecorderRemoved: next })), 'tempRecorderRemoved')}
            </div>
            <div className="dock-checker-form__question">
              <span>Did you check the temperature of the trailer?</span>
              {yesNo(bools.trailerTemperatureChecked, (next) => setBools((c) => ({ ...c, trailerTemperatureChecked: next })), 'trailerTemperatureChecked')}
            </div>
            <div className="dock-checker-form__question">
              <span>Did you submit paperwork to shipping and receiving?</span>
              {yesNo(bools.paperworkSubmittedToShippingReceiving, (next) => setBools((c) => ({ ...c, paperworkSubmittedToShippingReceiving: next })), 'paperworkSubmittedToShippingReceiving')}
            </div>
          </div>

          <div className="dock-checker-form__field" style={{ marginBottom: '10px' }}>
            <label>QC issue notes</label>
            <textarea rows={2} value={qcIssueNotes} onChange={(e) => setQcIssueNotes(e.target.value)} placeholder="Optional details" />
          </div>
          <div className="dock-checker-form__field" style={{ marginBottom: '10px' }}>
            <label>Damage notes</label>
            <textarea rows={2} value={damageNotes} onChange={(e) => setDamageNotes(e.target.value)} placeholder="Optional details" />
          </div>

          <div className="dock-checker-form__upload-row">
            <div className="dock-checker-form__field">
              <label>Upload pictures</label>
              <input
                ref={imageInputRef}
                className="dock-checker-form__file-input"
                type="file"
                accept="image/*"
                multiple
                onChange={handleUpload}
                disabled={uploading || submitting}
              />
              <div className="dock-checker-form__upload-buttons">
                <button
                  type="button"
                  className="dock-checker-form__submit"
                  onClick={() => setCameraOpen(true)}
                  disabled={uploading || submitting}
                >
                  {uploading ? 'Uploading...' : 'Open Live Camera'}
                </button>
                <button
                  type="button"
                  className="dock-checker-form__secondary"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploading || submitting}
                >
                  {uploading ? 'Uploading...' : 'Browse Existing Photos'}
                </button>
              </div>
              <div style={{ marginTop: '6px', color: '#94a3b8', fontSize: '0.8rem' }}>
                Open Live Camera uses webcam/tablet camera. Browse Existing Photos opens file picker.
              </div>
            </div>
            <div style={{ marginTop: '6px', color: '#94a3b8', fontSize: '0.85rem' }}>
              {uploading ? 'Uploading images...' : `${uploadedImages.length} image(s) attached`}
            </div>
            <div className="dock-checker-form__upload-list">
              {uploadedImages.map((item) => (
                <a key={item.url} className="dock-checker-form__upload-thumb" href={item.fullUrl} target="_blank" rel="noreferrer" title={item.fileName}>
                  <img src={item.fullUrl} alt={item.fileName} loading="lazy" />
                  <span className="dock-checker-form__upload-thumb-status">Saved</span>
                  <span className="dock-checker-form__upload-thumb-time">{formatUploadedTime(item.uploadedAt)}</span>
                  <span className="dock-checker-form__upload-thumb-name">{item.fileName}</span>
                </a>
              ))}
            </div>
          </div>

          <div className="dock-checker-form__field">
            <label>Notes</label>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </div>

        <div className="dock-checker-form__actions">
          <button className="dock-checker-form__secondary" onClick={() => navigate('/dock-checker/history')} disabled={submitting}>View History</button>
          <button className="dock-checker-form__submit" onClick={submit} disabled={submitting || uploading}>
            {submitting ? 'Submitting...' : 'Submit Inbound Form'}
          </button>
        </div>
      </div>
    </div>
  );
}
