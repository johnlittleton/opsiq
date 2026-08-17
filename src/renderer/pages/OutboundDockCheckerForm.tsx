import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { API_BASE } from '../services/config';
import { useAuth } from '../context/AuthContext';
import CameraCaptureModal from '../components/CameraCaptureModal';
import './DockCheckerForms.css';

const OUTBOUND_DRAFT_KEY = 'opsiq-outbound-dock-checker-draft';

const readOutboundDraft = () => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(OUTBOUND_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as {
      referenceNumber: string;
      company: string;
      doorId: string;
      checkinId: string;
      palletsOffloaded: string;
      checkerName: string;
      forkliftOperatorName: string;
      palletsLoaded: string;
      notes: string;
      bools: BoolFields;
    };
  } catch {
    return null;
  }
};

type UploadedImage = {
  url: string;
  fileName: string;
  fullUrl: string;
  uploadedAt: string;
};

type BoolFields = {
  salesOrderPoMatchesPickTicket: boolean;
  qtyOnPickTicketsMatch: boolean;
  palletTagsMatchPickTicket: boolean;
  babyTagsAndLabelsRemoved: boolean;
  loadingSheetPalletQtyMatchesPickTicket: boolean;
  shipToAddressVerifiedWithClerk: boolean;
  paperworkVerifiedByClerkOrManager: boolean;
  tempRecorderRequired: boolean;
  palletsOnChep: boolean;
  picturesTakenEachPallet: boolean;
};

const defaultBools: BoolFields = {
  salesOrderPoMatchesPickTicket: false,
  qtyOnPickTicketsMatch: false,
  palletTagsMatchPickTicket: false,
  babyTagsAndLabelsRemoved: false,
  loadingSheetPalletQtyMatchesPickTicket: false,
  shipToAddressVerifiedWithClerk: false,
  paperworkVerifiedByClerkOrManager: false,
  tempRecorderRequired: false,
  palletsOnChep: false,
  picturesTakenEachPallet: false,
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

export default function OutboundDockCheckerForm() {
  const navigate = useNavigate();
  const { executiveName } = useAuth();

  const savedDraft = readOutboundDraft();
  const [referenceNumber, setReferenceNumber] = useState(savedDraft?.referenceNumber ?? '');
  const [company, setCompany] = useState(savedDraft?.company ?? '');
  const [doorId, setDoorId] = useState(savedDraft?.doorId ?? '');
  const [checkinId, setCheckinId] = useState(savedDraft?.checkinId ?? '');
  const [palletsOffloaded, setPalletsOffloaded] = useState(savedDraft?.palletsOffloaded ?? '0');
  const [checkerName, setCheckerName] = useState(savedDraft?.checkerName ?? '');
  const [forkliftOperatorName, setForkliftOperatorName] = useState(savedDraft?.forkliftOperatorName ?? '');
  const [palletsLoaded, setPalletsLoaded] = useState(savedDraft?.palletsLoaded ?? '0');
  const [notes, setNotes] = useState(savedDraft?.notes ?? '');
  const [bools, setBools] = useState<BoolFields>(savedDraft?.bools ?? defaultBools);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [lastUndoState, setLastUndoState] = useState<{
    referenceNumber: string;
    company: string;
    doorId: string;
    checkinId: string;
    palletsOffloaded: string;
    checkerName: string;
    forkliftOperatorName: string;
    palletsLoaded: string;
    notes: string;
    bools: BoolFields;
  } | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (submitting) return;

    const draft = {
      referenceNumber,
      company,
      doorId,
      checkinId,
      palletsOffloaded,
      checkerName,
      forkliftOperatorName,
      palletsLoaded,
      notes,
      bools,
    };

    window.localStorage.setItem(OUTBOUND_DRAFT_KEY, JSON.stringify(draft));
  }, [bools, checkinId, checkerName, company, doorId, forkliftOperatorName, notes, palletsLoaded, palletsOffloaded, referenceNumber, submitting]);

  const pushUndoState = () => {
    setLastUndoState({
      referenceNumber,
      company,
      doorId,
      checkinId,
      palletsOffloaded,
      checkerName,
      forkliftOperatorName,
      palletsLoaded,
      notes,
      bools,
    });
  };

  const handleUndo = () => {
    if (!lastUndoState) return;

    setReferenceNumber(lastUndoState.referenceNumber);
    setCompany(lastUndoState.company);
    setDoorId(lastUndoState.doorId);
    setCheckinId(lastUndoState.checkinId);
    setPalletsOffloaded(lastUndoState.palletsOffloaded);
    setCheckerName(lastUndoState.checkerName);
    setForkliftOperatorName(lastUndoState.forkliftOperatorName);
    setPalletsLoaded(lastUndoState.palletsLoaded);
    setNotes(lastUndoState.notes);
    setBools(lastUndoState.bools);
    setLastUndoState(null);
  };

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
    const normalizedChecker = checkerName.trim();
    const normalizedForklift = forkliftOperatorName.trim();
    const offloaded = Number(palletsOffloaded);
    const loaded = Number(palletsLoaded);

    if (!normalizedReference) {
      alert('Sales Order/PO reference is required.');
      return;
    }
    if (!normalizedChecker || !normalizedForklift) {
      alert('Checker and forklift operator are required.');
      return;
    }
    if (!Number.isFinite(offloaded) || offloaded < 0 || !Number.isFinite(loaded) || loaded < 0) {
      alert('Pallet counts must be non-negative numbers.');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.saveOutboundDockCheckerForm({
        referenceNumber: normalizedReference,
        company: company.trim(),
        doorId: doorId.trim() ? Number(doorId) : null,
        checkinId: checkinId.trim() ? Number(checkinId) : null,
        palletsOffloaded: offloaded,
        checkerName: normalizedChecker,
        forkliftOperatorName: normalizedForklift,
        salesOrderPoMatchesPickTicket: bools.salesOrderPoMatchesPickTicket,
        qtyOnPickTicketsMatch: bools.qtyOnPickTicketsMatch,
        palletTagsMatchPickTicket: bools.palletTagsMatchPickTicket,
        babyTagsAndLabelsRemoved: bools.babyTagsAndLabelsRemoved,
        loadingSheetPalletQtyMatchesPickTicket: bools.loadingSheetPalletQtyMatchesPickTicket,
        shipToAddressVerifiedWithClerk: bools.shipToAddressVerifiedWithClerk,
        palletsLoaded: loaded,
        paperworkVerifiedByClerkOrManager: bools.paperworkVerifiedByClerkOrManager,
        tempRecorderRequired: bools.tempRecorderRequired,
        palletsOnChep: bools.palletsOnChep,
        picturesTakenEachPallet: bools.picturesTakenEachPallet,
        imagePaths: imagePayload,
        notes: notes.trim(),
        submittedBy: executiveName || 'Dock Team',
      });

      window.localStorage.removeItem(OUTBOUND_DRAFT_KEY);
      setLastUndoState(null);
      alert('Outbound dock checker form saved.');
      navigate('/dock-checker/history');
    } catch (error: any) {
      alert(error?.message || 'Failed to save outbound form.');
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
        title="Outbound Photo Capture"
        onClose={() => setCameraOpen(false)}
        onCapture={handleCameraCapture}
      />

      <div className="dock-checker-page__header">
        <h1 className="dock-checker-page__title">Outbound Dock Checker Form</h1>
        <button className="dock-checker-page__home-btn" onClick={() => navigate('/home')}>Back Home</button>
      </div>

      <div className="dock-checker-form">
        <div className="dock-checker-form__scroll">
          <div className="dock-checker-form__grid">
            <div className="dock-checker-form__field">
              <label>Sales Order / PO Reference</label>
              <input value={referenceNumber} onChange={(e) => { pushUndoState(); setReferenceNumber(e.target.value); }} placeholder="SO or PO number" />
            </div>
            <div className="dock-checker-form__field">
              <label>Company</label>
              <input value={company} onChange={(e) => { pushUndoState(); setCompany(e.target.value); }} placeholder="Optional" />
            </div>
            <div className="dock-checker-form__field">
              <label>Door ID</label>
              <input type="number" min="1" value={doorId} onChange={(e) => { pushUndoState(); setDoorId(e.target.value); }} placeholder="Optional" />
            </div>
            <div className="dock-checker-form__field">
              <label>Check-in ID</label>
              <input type="number" min="1" value={checkinId} onChange={(e) => { pushUndoState(); setCheckinId(e.target.value); }} placeholder="Optional" />
            </div>
            <div className="dock-checker-form__field">
              <label>How many pallets were off loaded</label>
              <input type="number" min="0" value={palletsOffloaded} onChange={(e) => { pushUndoState(); setPalletsOffloaded(e.target.value); }} />
            </div>
            <div className="dock-checker-form__field">
              <label>How many pallets were loaded</label>
              <input type="number" min="0" value={palletsLoaded} onChange={(e) => { pushUndoState(); setPalletsLoaded(e.target.value); }} />
            </div>
            <div className="dock-checker-form__field">
              <label>QC</label>
              <input value={checkerName} onChange={(e) => { pushUndoState(); setCheckerName(e.target.value); }} placeholder="Required" />
            </div>
            <div className="dock-checker-form__field">
              <label>Forklift Operator</label>
              <input value={forkliftOperatorName} onChange={(e) => { pushUndoState(); setForkliftOperatorName(e.target.value); }} placeholder="Required" />
            </div>
          </div>

          <div className="dock-checker-form__questions">
            <div className="dock-checker-form__question">
              <span>Does the Sales Order/PO match the pick ticket?</span>
              {yesNo(bools.salesOrderPoMatchesPickTicket, (next) => { pushUndoState(); setBools((c) => ({ ...c, salesOrderPoMatchesPickTicket: next })); }, 'salesOrderPoMatchesPickTicket')}
            </div>
            <div className="dock-checker-form__question">
              <span>Does the qty on the pick tickets match?</span>
              {yesNo(bools.qtyOnPickTicketsMatch, (next) => { pushUndoState(); setBools((c) => ({ ...c, qtyOnPickTicketsMatch: next })); }, 'qtyOnPickTicketsMatch')}
            </div>
            <div className="dock-checker-form__question">
              <span>Do the pallet tags match the pick ticket?</span>
              {yesNo(bools.palletTagsMatchPickTicket, (next) => { pushUndoState(); setBools((c) => ({ ...c, palletTagsMatchPickTicket: next })); }, 'palletTagsMatchPickTicket')}
            </div>
            <div className="dock-checker-form__question">
              <span>Have all baby tags and labels been removed?</span>
              {yesNo(bools.babyTagsAndLabelsRemoved, (next) => { pushUndoState(); setBools((c) => ({ ...c, babyTagsAndLabelsRemoved: next })); }, 'babyTagsAndLabelsRemoved')}
            </div>
            <div className="dock-checker-form__question">
              <span>Does loading sheet pallet qty match the pick ticket pallet qty?</span>
              {yesNo(bools.loadingSheetPalletQtyMatchesPickTicket, (next) => { pushUndoState(); setBools((c) => ({ ...c, loadingSheetPalletQtyMatchesPickTicket: next })); }, 'loadingSheetPalletQtyMatchesPickTicket')}
            </div>
            <div className="dock-checker-form__question">
              <span>Is the ship-to address correct (verified with clerk)?</span>
              {yesNo(bools.shipToAddressVerifiedWithClerk, (next) => { pushUndoState(); setBools((c) => ({ ...c, shipToAddressVerifiedWithClerk: next })); }, 'shipToAddressVerifiedWithClerk')}
            </div>
            <div className="dock-checker-form__question">
              <span>Was paperwork verified by clerk or manager?</span>
              {yesNo(bools.paperworkVerifiedByClerkOrManager, (next) => { pushUndoState(); setBools((c) => ({ ...c, paperworkVerifiedByClerkOrManager: next })); }, 'paperworkVerifiedByClerkOrManager')}
            </div>
            <div className="dock-checker-form__question">
              <span>Is a temp recorder required?</span>
              {yesNo(bools.tempRecorderRequired, (next) => { pushUndoState(); setBools((c) => ({ ...c, tempRecorderRequired: next })); }, 'tempRecorderRequired')}
            </div>
            <div className="dock-checker-form__question">
              <span>Were the pallets on CHEP?</span>
              {yesNo(bools.palletsOnChep, (next) => { pushUndoState(); setBools((c) => ({ ...c, palletsOnChep: next })); }, 'palletsOnChep')}
            </div>
            <div className="dock-checker-form__question">
              <span>Did you take pictures of each pallet?</span>
              {yesNo(bools.picturesTakenEachPallet, (next) => { pushUndoState(); setBools((c) => ({ ...c, picturesTakenEachPallet: next })); }, 'picturesTakenEachPallet')}
            </div>
          </div>

          <div className="dock-checker-form__upload-row">
            <div className="dock-checker-form__field">
              <label>Upload pallet pictures</label>
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
            <textarea rows={3} value={notes} onChange={(e) => { pushUndoState(); setNotes(e.target.value); }} placeholder="Optional" />
          </div>
        </div>

        <div className="dock-checker-form__actions">
          <button className="dock-checker-form__secondary" onClick={() => navigate('/dock-checker/history')} disabled={submitting}>View History</button>
          <button className="dock-checker-form__secondary" onClick={handleUndo} disabled={submitting || !lastUndoState}>Undo Last Edit</button>
          <button className="dock-checker-form__submit" onClick={submit} disabled={submitting || uploading}>
            {submitting ? 'Submitting...' : 'Submit Outbound Form'}
          </button>
        </div>
      </div>
    </div>
  );
}
