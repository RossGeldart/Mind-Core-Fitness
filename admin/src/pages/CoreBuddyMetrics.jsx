import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs, doc, getDoc, setDoc,
  updateDoc, deleteDoc, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useTier } from '../contexts/TierContext';
import CoreBuddyNav from '../components/CoreBuddyNav';

import './CoreBuddyMetrics.css';

const BODY_METRICS = [
  { key: 'chest', name: 'Chest', suffix: 'cm' },
  { key: 'waist', name: 'Waist', suffix: 'cm' },
  { key: 'hips', name: 'Hips', suffix: 'cm' },
  { key: 'leftArm', name: 'Left Arm', suffix: 'cm' },
  { key: 'rightArm', name: 'Right Arm', suffix: 'cm' },
  { key: 'leftThigh', name: 'Left Thigh', suffix: 'cm' },
  { key: 'rightThigh', name: 'Right Thigh', suffix: 'cm' },
  { key: 'leftCalf', name: 'Left Calf', suffix: 'cm' },
  { key: 'rightCalf', name: 'Right Calf', suffix: 'cm' },
];

function formatPeriod(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function calcProgress(baseline, current, target) {
  const total = target - baseline;
  if (total === 0) return current === target ? 100 : 0;
  const raw = ((current - baseline) / total) * 100;
  return Math.max(0, Math.min(Math.round(raw), 100));
}

function getDirection(baseline, target) {
  if (target > baseline) return 'gain';
  if (target < baseline) return 'lose';
  return 'maintain';
}

function compressImage(file, maxSize = 800) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width;
      let h = img.height;
      if (w > h) { if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; } }
      else { if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; } }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8);
    };
    img.src = URL.createObjectURL(file);
  });
}

function ZoomablePhoto({ src, alt, zoom, setZoom, touchStateRef, id }) {
  const containerRef = useRef(null);

  const getDistance = (t1, t2) => Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  const getMidpoint = (t1, t2) => ({ x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 });

  const handleTouchStart = (e) => {
    const ts = touchStateRef.current;
    if (e.touches.length === 2) {
      e.preventDefault();
      ts[id] = {
        startDist: getDistance(e.touches[0], e.touches[1]),
        startScale: zoom.scale,
        startMid: getMidpoint(e.touches[0], e.touches[1]),
        startX: zoom.x,
        startY: zoom.y,
        mode: 'pinch',
      };
    } else if (e.touches.length === 1 && zoom.scale > 1) {
      e.preventDefault();
      ts[id] = {
        startTouch: { x: e.touches[0].clientX, y: e.touches[0].clientY },
        startX: zoom.x,
        startY: zoom.y,
        mode: 'pan',
      };
    }
  };

  const handleTouchMove = (e) => {
    const ts = touchStateRef.current[id];
    if (!ts) return;

    if (ts.mode === 'pinch' && e.touches.length === 2) {
      e.preventDefault();
      const dist = getDistance(e.touches[0], e.touches[1]);
      const newScale = Math.max(1, Math.min(5, ts.startScale * (dist / ts.startDist)));
      const mid = getMidpoint(e.touches[0], e.touches[1]);
      const dx = mid.x - ts.startMid.x;
      const dy = mid.y - ts.startMid.y;
      setZoom({ scale: newScale, x: ts.startX + dx, y: ts.startY + dy });
    } else if (ts.mode === 'pan' && e.touches.length === 1) {
      e.preventDefault();
      const dx = e.touches[0].clientX - ts.startTouch.x;
      const dy = e.touches[0].clientY - ts.startTouch.y;
      setZoom(prev => ({ ...prev, x: ts.startX + dx, y: ts.startY + dy }));
    }
  };

  const handleTouchEnd = (e) => {
    if (e.touches.length < 2) {
      const ts = touchStateRef.current[id];
      // Switch from pinch to pan if one finger remains
      if (ts?.mode === 'pinch' && e.touches.length === 1) {
        touchStateRef.current[id] = {
          startTouch: { x: e.touches[0].clientX, y: e.touches[0].clientY },
          startX: zoom.x,
          startY: zoom.y,
          mode: 'pan',
        };
      } else if (e.touches.length === 0) {
        delete touchStateRef.current[id];
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="cbm-compare-photo-zoomable"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <img
        src={src}
        alt={alt}
        className="cbm-compare-photo-img"
        style={{
          transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
          transformOrigin: 'center center',
        }}
        draggable={false}
      />
      {zoom.scale > 1 && (
        <button
          className="cbm-zoom-reset-btn"
          onClick={(e) => { e.stopPropagation(); setZoom({ scale: 1, x: 0, y: 0 }); }}
          aria-label="Reset zoom"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
        </button>
      )}
    </div>
  );
}

export default function CoreBuddyMetrics() {
  const { currentUser, clientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { isPremium } = useTier();
  const navigate = useNavigate();

  // Data state
  const [targetsDoc, setTargetsDoc] = useState(null);
  const [history, setHistory] = useState([]);
  const [photos, setPhotos] = useState({}); // { period: [{ url, label, uploadedAt }] }
  const [loading, setLoading] = useState(true);

  // UI state
  const [showSetup, setShowSetup] = useState(false);
  const [showMeasure, setShowMeasure] = useState(false);
  const [showEditTargets, setShowEditTargets] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');
  const [comparePhotoA, setComparePhotoA] = useState(0);
  const [comparePhotoB, setComparePhotoB] = useState(0);
  const [expandedPeriod, setExpandedPeriod] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Form state
  const [formValues, setFormValues] = useState({});
  const [targetValues, setTargetValues] = useState({});

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const photoInputRef = useRef(null);
  const [photoUploadPeriod, setPhotoUploadPeriod] = useState(null);

  // Compare photo zoom/pan state
  const [zoomA, setZoomA] = useState({ scale: 1, x: 0, y: 0 });
  const [zoomB, setZoomB] = useState({ scale: 1, x: 0, y: 0 });
  const touchStateRef = useRef({});
  const [savingCompare, setSavingCompare] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !currentUser) navigate('/');
  }, [authLoading, currentUser, navigate]);

  // Load data
  const loadData = useCallback(async () => {
    if (!clientData) return;
    setLoading(true);
    try {
      // Load targets
      const targetsRef = doc(db, 'coreBuddyMetricTargets', clientData.id);
      const targetsSnap = await getDoc(targetsRef);

      if (targetsSnap.exists()) {
        setTargetsDoc(targetsSnap.data());
      } else {
        setTargetsDoc(null);
      }

      // Load measurement history
      const metricsSnap = await getDocs(
        query(collection(db, 'coreBuddyMetrics'), where('clientId', '==', clientData.id))
      );
      const records = metricsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.period || '').localeCompare(a.period || ''));
      setHistory(records);

      // Load photos
      const photosSnap = await getDocs(
        query(collection(db, 'coreBuddyMetricPhotos'), where('clientId', '==', clientData.id))
      );
      const photoMap = {};
      photosSnap.docs.forEach(d => {
        const data = d.data();
        photoMap[data.period] = data.photos || [];
      });
      setPhotos(photoMap);

      // If no targets set up, show setup
      if (!targetsSnap.exists()) {
        setShowSetup(true);
      }
    } catch (err) {
      console.error('Error loading metrics:', err);
      showToast('Error loading data', 'error');
    } finally {
      setLoading(false);
    }
  }, [clientData, showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Setup: save initial measurements + targets
  const handleSetupSave = async () => {
    if (!clientData) return;
    // Validate all fields filled
    const missingMeasurement = BODY_METRICS.find(m => !formValues[m.key] || isNaN(Number(formValues[m.key])));
    if (missingMeasurement) {
      showToast(`Please enter a value for ${missingMeasurement.name}`, 'error');
      return;
    }
    const missingTarget = BODY_METRICS.find(m => !targetValues[m.key] || isNaN(Number(targetValues[m.key])));
    if (missingTarget) {
      showToast(`Please enter a target for ${missingTarget.name}`, 'error');
      return;
    }

    setSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const measurements = {};
      const targets = {};
      const baseline = {};

      BODY_METRICS.forEach(m => {
        measurements[m.key] = Number(formValues[m.key]);
        targets[m.key] = Number(targetValues[m.key]);
        baseline[m.key] = Number(formValues[m.key]);
      });

      // Save targets + baseline
      await setDoc(doc(db, 'coreBuddyMetricTargets', clientData.id), {
        clientId: clientData.id,
        targets,
        baseline,
        setupComplete: true,
        lastMeasured: Timestamp.now(),
        updatedAt: serverTimestamp(),
      });

      // Save first measurement
      await setDoc(doc(db, 'coreBuddyMetrics', `${clientData.id}_${today}`), {
        clientId: clientData.id,
        period: today,
        measurements,
        createdAt: serverTimestamp(),
      });

      showToast('Setup complete!', 'success');
      setShowSetup(false);
      setFormValues({});
      setTargetValues({});
      await loadData();
    } catch (err) {
      console.error('Setup save error:', err);
      showToast('Error saving — please try again', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Log new measurements
  const handleMeasureSave = async () => {
    if (!clientData) return;
    const missingMeasurement = BODY_METRICS.find(m => !formValues[m.key] || isNaN(Number(formValues[m.key])));
    if (missingMeasurement) {
      showToast(`Please enter a value for ${missingMeasurement.name}`, 'error');
      return;
    }

    setSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const measurements = {};
      BODY_METRICS.forEach(m => {
        measurements[m.key] = Number(formValues[m.key]);
      });

      await setDoc(doc(db, 'coreBuddyMetrics', `${clientData.id}_${today}`), {
        clientId: clientData.id,
        period: today,
        measurements,
        createdAt: serverTimestamp(),
      });

      // Update lastMeasured
      await updateDoc(doc(db, 'coreBuddyMetricTargets', clientData.id), {
        lastMeasured: Timestamp.now(),
        updatedAt: serverTimestamp(),
      });

      showToast('Measurements logged!', 'success');
      setShowMeasure(false);
      setFormValues({});
      await loadData();
    } catch (err) {
      console.error('Measure save error:', err);
      showToast('Error saving — please try again', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Update targets
  const handleTargetsSave = async () => {
    if (!clientData || !targetsDoc) return;
    const missingTarget = BODY_METRICS.find(m => !targetValues[m.key] || isNaN(Number(targetValues[m.key])));
    if (missingTarget) {
      showToast(`Please enter a target for ${missingTarget.name}`, 'error');
      return;
    }

    setSaving(true);
    try {
      const newTargets = {};
      BODY_METRICS.forEach(m => {
        newTargets[m.key] = Number(targetValues[m.key]);
      });

      await updateDoc(doc(db, 'coreBuddyMetricTargets', clientData.id), {
        targets: newTargets,
        updatedAt: serverTimestamp(),
      });

      showToast('Targets updated!', 'success');
      setShowEditTargets(false);
      setTargetValues({});
      await loadData();
    } catch (err) {
      console.error('Target save error:', err);
      showToast('Error saving — please try again', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Photo upload
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    // Always reset input so the same file can be re-selected
    if (photoInputRef.current) photoInputRef.current.value = '';
    if (!file || !photoUploadPeriod || !clientData) return;
    if (!file.type.startsWith('image/')) { showToast('Please select an image', 'error'); return; }

    setUploadingPhoto(true);
    try {
      // Compress first — this resizes large camera photos to 800px JPEG,
      // so a 10MB raw photo becomes well under 1MB after compression.
      const compressed = await compressImage(file);
      if (compressed.size > 5 * 1024 * 1024) { showToast('Image still too large after compression', 'error'); setUploadingPhoto(false); return; }

      const imgId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const storageRef = ref(storage, `progressPhotos/${clientData.id}/${photoUploadPeriod}/${imgId}.jpg`);
      await uploadBytes(storageRef, compressed);
      const url = await getDownloadURL(storageRef);

      const docId = `${clientData.id}_${photoUploadPeriod}`;
      const existingPhotos = photos[photoUploadPeriod] || [];
      const newPhotos = [...existingPhotos, { url, label: `Photo ${existingPhotos.length + 1}`, uploadedAt: new Date().toISOString() }];

      await setDoc(doc(db, 'coreBuddyMetricPhotos', docId), {
        clientId: clientData.id,
        period: photoUploadPeriod,
        photos: newPhotos,
      });

      showToast('Photo uploaded!', 'success');
      await loadData();
    } catch (err) {
      console.error('Photo upload error:', err);
      showToast('Upload failed — try again', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Delete photo
  const handleDeletePhoto = async (period, photoIndex) => {
    if (!clientData) return;
    try {
      const existing = photos[period] || [];
      const updated = existing.filter((_, i) => i !== photoIndex);
      const docId = `${clientData.id}_${period}`;

      if (updated.length === 0) {
        await deleteDoc(doc(db, 'coreBuddyMetricPhotos', docId));
      } else {
        await setDoc(doc(db, 'coreBuddyMetricPhotos', docId), {
          clientId: clientData.id,
          period,
          photos: updated,
        });
      }
      showToast('Photo removed', 'info');
      await loadData();
    } catch (err) {
      console.error('Delete photo error:', err);
      showToast('Error removing photo', 'error');
    }
  };

  // Computed values
  const latestRecord = history[0] || null;
  const previousRecord = history[1] || null;

  const getProgressForMetric = (key) => {
    if (!targetsDoc || !latestRecord) return 0;
    const baseline = targetsDoc.baseline?.[key];
    const target = targetsDoc.targets?.[key];
    const current = latestRecord.measurements?.[key];
    if (baseline == null || target == null || current == null) return 0;
    return calcProgress(baseline, current, target);
  };

  const getOverallProgress = () => {
    if (!targetsDoc || !latestRecord) return 0;
    let total = 0;
    let count = 0;
    BODY_METRICS.forEach(m => {
      const p = getProgressForMetric(m.key);
      total += p;
      count++;
    });
    return count > 0 ? Math.round(total / count) : 0;
  };

  // Check if 4 weeks since last measured
  const needsRemeasure = (() => {
    if (!targetsDoc?.lastMeasured) return false;
    const last = targetsDoc.lastMeasured.toDate ? targetsDoc.lastMeasured.toDate() : new Date(targetsDoc.lastMeasured);
    const fourWeeks = 28 * 24 * 60 * 60 * 1000;
    return (Date.now() - last.getTime()) >= fourWeeks;
  })();

  const handleSaveCompare = async () => {
    const urlA = photos[compareA]?.[comparePhotoA]?.url;
    const urlB = photos[compareB]?.[comparePhotoB]?.url;
    if (!urlA && !urlB) { showToast('No photos to save', 'error'); return; }
    setSavingCompare(true);
    try {
      const loadImg = (url) => new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const timeout = setTimeout(() => reject(new Error('Image load timeout')), 15000);
        img.onload = () => { clearTimeout(timeout); resolve(img); };
        img.onerror = () => { clearTimeout(timeout); reject(new Error('Image load failed')); };
        // Append cache-bust to force CORS-aware reload (browser may have cached non-CORS version)
        img.src = url + (url.includes('?') ? '&' : '?') + '_cb=' + Date.now();
      });
      const rRect = (ctx2, x, y, w, h, r) => {
        ctx2.beginPath();
        ctx2.moveTo(x + r, y);
        ctx2.lineTo(x + w - r, y);
        ctx2.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx2.lineTo(x + w, y + h - r);
        ctx2.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx2.lineTo(x + r, y + h);
        ctx2.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx2.lineTo(x, y + r);
        ctx2.quadraticCurveTo(x, y, x + r, y);
        ctx2.closePath();
      };
      const [imgA, imgB] = await Promise.all([
        urlA ? loadImg(urlA) : null,
        urlB ? loadImg(urlB) : null,
      ]);
      const W = 1080;
      const gap = 20;
      const photoW = Math.floor((W - gap * 3) / 2);
      const photoH = Math.floor(photoW * 4 / 3);
      const labelH = 48;
      const H = gap + labelH + photoH + gap;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, W, H);
      ctx.font = '600 24px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#444';
      ctx.textAlign = 'center';
      const drawPhoto = (img, x, y, w, h, zoom) => {
        if (!img) {
          ctx.fillStyle = '#e0e0e0';
          rRect(ctx, x, y, w, h, 16);
          ctx.fill();
          ctx.fillStyle = '#999';
          ctx.font = '500 20px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('No photo', x + w / 2, y + h / 2 + 7);
          ctx.font = '600 24px Inter, system-ui, sans-serif';
          ctx.fillStyle = '#444';
          return;
        }
        // Crop source to 3:4 aspect (object-fit: cover equivalent)
        const imgRatio = img.width / img.height;
        const targetRatio = w / h;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (imgRatio > targetRatio) {
          sw = img.height * targetRatio;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / targetRatio;
          sy = (img.height - sh) / 2;
        }
        ctx.save();
        rRect(ctx, x, y, w, h, 16);
        ctx.clip();
        // Apply zoom/pan: translate to center, apply scale + pan, translate back
        const cx = x + w / 2;
        const cy = y + h / 2;
        const { scale = 1, x: panX = 0, y: panY = 0 } = zoom || {};
        // Screen container is roughly half the overlay width (~180px on phone)
        // Scale pan from screen pixels to canvas pixels
        const screenW = 170; // approximate on-screen photo width in px
        const ratio = w / screenW;
        ctx.translate(cx + panX * ratio, cy + panY * ratio);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);
        ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
        ctx.restore();
      };
      const x1 = gap;
      const x2 = gap + photoW + gap;
      const yLabel = gap + 28;
      const yPhoto = gap + labelH;
      ctx.textAlign = 'center';
      ctx.fillText(formatPeriod(compareA), x1 + photoW / 2, yLabel);
      ctx.fillText(formatPeriod(compareB), x2 + photoW / 2, yLabel);
      drawPhoto(imgA, x1, yPhoto, photoW, photoH, zoomA);
      drawPhoto(imgB, x2, yPhoto, photoW, photoH, zoomB);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.92));
      const file = new File([blob], 'progress-compare.jpg', { type: 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'progress-compare.jpg';
        a.click();
        URL.revokeObjectURL(a.href);
        showToast('Photo saved!', 'success');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Save compare error:', err);
        showToast(err.message || 'Failed to save photo', 'error');
      }
    } finally {
      setSavingCompare(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="cbm-page">
        <div className="cbm-loading"><div className="cbm-spinner" /></div>
      </div>
    );
  }

  const R = 38;
  const CIRC = 2 * Math.PI * R;

  return (
    <>
    <div className="cbm-page">
      <header className="client-header">
        <div className="header-content">
          <button className="header-back-btn" onClick={() => navigate('/client/core-buddy')} aria-label="Go back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
          <div className="header-actions">
            <button onClick={toggleTheme} aria-label="Toggle theme">
              {isDark ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="cbm-main">
        <h1 className="cbm-title">Body Metrics</h1>

        {/* Remeasure banner */}
        {needsRemeasure && targetsDoc?.setupComplete && (
          <button className="cbm-remeasure-banner" onClick={() => { setFormValues({}); setShowMeasure(true); }}>
            <div className="cbm-banner-ring">
              <svg viewBox="0 0 100 100">
                <circle className="cbm-banner-ring-track" cx="50" cy="50" r={R} />
                <circle className="cbm-banner-ring-fill" cx="50" cy="50" r={R}
                  strokeDasharray={CIRC}
                  strokeDashoffset={CIRC - (getOverallProgress() / 100) * CIRC} />
              </svg>
              <span className="cbm-banner-ring-val">{getOverallProgress()}%</span>
            </div>
            <div className="cbm-banner-info">
              <span className="cbm-banner-label">BODY METRICS</span>
              <span className="cbm-banner-title">It's time to measure up!</span>
              <span className="cbm-banner-cta">Log measurements &rarr;</span>
            </div>
          </button>
        )}

        {/* Setup flow — first time only */}
        {showSetup && !targetsDoc?.setupComplete && (
          <div className="cbm-setup-card">
            <h2 className="cbm-setup-heading">Set Up Your Metrics</h2>
            <p className="cbm-setup-desc">Enter your current measurements and set targets. We'll track your progress every 4 weeks.</p>

            <div className="cbm-form-section">
              <h3 className="cbm-form-label">Current Measurements</h3>
              {BODY_METRICS.map(m => (
                <div key={m.key} className="cbm-form-row">
                  <label className="cbm-form-name">{m.name}</label>
                  <div className="cbm-form-input-wrap">
                    <input
                      type="number"
                      inputMode="decimal"
                      className="cbm-form-input"
                      placeholder="0"
                      value={formValues[m.key] || ''}
                      onChange={(e) => setFormValues(prev => ({ ...prev, [m.key]: e.target.value }))}
                    />
                    <span className="cbm-form-suffix">{m.suffix}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="cbm-form-section">
              <h3 className="cbm-form-label">Your Targets</h3>
              <p className="cbm-form-hint">Set where you want to be. If your target is smaller than current, we'll track loss as progress.</p>
              {BODY_METRICS.map(m => {
                const current = Number(formValues[m.key]) || 0;
                const target = Number(targetValues[m.key]) || 0;
                const dir = current && target ? getDirection(current, target) : null;
                return (
                  <div key={m.key} className="cbm-form-row">
                    <div className="cbm-form-name-wrap">
                      <label className="cbm-form-name">{m.name}</label>
                      {dir && (
                        <span className={`cbm-dir-badge cbm-dir-${dir}`}>
                          {dir === 'gain' ? 'Gain' : dir === 'lose' ? 'Lose' : 'Hold'}
                        </span>
                      )}
                    </div>
                    <div className="cbm-form-input-wrap">
                      <input
                        type="number"
                        inputMode="decimal"
                        className="cbm-form-input"
                        placeholder="0"
                        value={targetValues[m.key] || ''}
                        onChange={(e) => setTargetValues(prev => ({ ...prev, [m.key]: e.target.value }))}
                      />
                      <span className="cbm-form-suffix">{m.suffix}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <button className="cbm-btn-primary" onClick={handleSetupSave} disabled={saving}>
              {saving ? <div className="cbm-btn-spinner" /> : 'Save & Start Tracking'}
            </button>
          </div>
        )}

        {/* Main content — only if setup complete */}
        {targetsDoc?.setupComplete && (
          <>
            {/* Progress rings grid */}
            <div className="cbm-rings-grid">
              {BODY_METRICS.map(m => {
                const pct = getProgressForMetric(m.key);
                const offset = CIRC - (pct / 100) * CIRC;
                const isComplete = pct >= 100;
                const direction = getDirection(targetsDoc.baseline?.[m.key], targetsDoc.targets?.[m.key]);
                return (
                  <div key={m.key} className="cbm-ring-item">
                    <div className={`cbm-ring${isComplete ? ' cbm-ring-complete' : ''}`}>
                      <svg viewBox="0 0 100 100">
                        <circle className="cbm-ring-track" cx="50" cy="50" r={R} />
                        <circle className={`cbm-ring-fill${isComplete ? ' complete' : ''}`} cx="50" cy="50" r={R}
                          strokeDasharray={CIRC}
                          strokeDashoffset={offset} />
                      </svg>
                      <span className={`cbm-ring-val${isComplete ? ' complete' : ''}`}>{pct}%</span>
                    </div>
                    <span className="cbm-ring-name">{m.name}</span>
                    <span className="cbm-ring-dir">
                      {direction === 'gain' ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                      ) : direction === 'lose' ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Metric detail cards */}
            <div className="cbm-details">
              {BODY_METRICS.map(m => {
                const baseline = targetsDoc.baseline?.[m.key];
                const target = targetsDoc.targets?.[m.key];
                const current = latestRecord?.measurements?.[m.key];
                const prev = previousRecord?.measurements?.[m.key];
                const pct = getProgressForMetric(m.key);
                const direction = getDirection(baseline, target);
                const change = current != null && prev != null ? current - prev : null;

                return (
                  <div key={m.key} className="cbm-detail-card">
                    <div className="cbm-detail-header">
                      <span className="cbm-detail-name">{m.name}</span>
                      <span className={`cbm-dir-badge cbm-dir-${direction}`}>
                        {direction === 'gain' ? 'Gain' : direction === 'lose' ? 'Lose' : 'Hold'}
                      </span>
                    </div>
                    <div className="cbm-detail-row">
                      <div className="cbm-detail-stat">
                        <span className="cbm-detail-label">Start</span>
                        <span className="cbm-detail-value">{baseline ?? '-'}<span className="cbm-detail-unit">{m.suffix}</span></span>
                      </div>
                      <div className="cbm-detail-stat">
                        <span className="cbm-detail-label">Current</span>
                        <span className="cbm-detail-value">{current ?? '-'}<span className="cbm-detail-unit">{m.suffix}</span></span>
                      </div>
                      <div className="cbm-detail-stat">
                        <span className="cbm-detail-label">Target</span>
                        <span className="cbm-detail-value">{target ?? '-'}<span className="cbm-detail-unit">{m.suffix}</span></span>
                      </div>
                    </div>
                    <div className="cbm-detail-progress-row">
                      <div className="cbm-detail-bar">
                        <div className="cbm-detail-bar-fill" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <span className="cbm-detail-pct">{pct}%</span>
                    </div>
                    {change !== null && (
                      <span className="cbm-detail-change">
                        {change > 0 ? '+' : ''}{change.toFixed(1)}{m.suffix} since last
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Actions row */}
            <div className="cbm-actions">
              <button className="cbm-btn-primary" onClick={() => { setFormValues({}); setShowMeasure(true); }}>
                Log New Measurements
              </button>
              <button className="cbm-btn-secondary" onClick={() => {
                const current = {};
                BODY_METRICS.forEach(m => { current[m.key] = String(targetsDoc.targets?.[m.key] || ''); });
                setTargetValues(current);
                setShowEditTargets(true);
              }}>
                Edit Targets
              </button>
            </div>

            {/* History */}
            <div className="cbm-section">
              <h2 className="cbm-section-title">Measurement History</h2>
              {history.length === 0 ? (
                <p className="cbm-empty-text">No measurements yet</p>
              ) : (
                <div className="cbm-history-list">
                  {history.map((record, idx) => {
                    const isExpanded = expandedPeriod === record.period;
                    const prevRec = history[idx + 1] || null;
                    return (
                      <button key={record.id} className={`cbm-history-item${isExpanded ? ' expanded' : ''}`}
                        onClick={() => setExpandedPeriod(isExpanded ? null : record.period)}>
                        <div className="cbm-history-header">
                          <span className="cbm-history-date">{formatPeriod(record.period)}</span>
                          <svg className={`cbm-history-chevron${isExpanded ? ' open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                        </div>
                        {isExpanded && (
                          <div className="cbm-history-detail" onClick={(e) => e.stopPropagation()}>
                            {BODY_METRICS.map(m => {
                              const val = record.measurements?.[m.key];
                              const prevVal = prevRec?.measurements?.[m.key];
                              const diff = val != null && prevVal != null ? val - prevVal : null;
                              const direction = getDirection(targetsDoc.baseline?.[m.key], targetsDoc.targets?.[m.key]);
                              // Determine if the change is in the right direction
                              let changeIsGood = null;
                              if (diff !== null && diff !== 0) {
                                if (direction === 'gain') changeIsGood = diff > 0;
                                else if (direction === 'lose') changeIsGood = diff < 0;
                              }
                              return (
                                <div key={m.key} className="cbm-history-metric">
                                  <span className="cbm-history-metric-name">{m.name}</span>
                                  <span className="cbm-history-metric-val">{val ?? '-'}{m.suffix}</span>
                                  {diff !== null && (
                                    <span className={`cbm-history-metric-diff${changeIsGood === true ? ' good' : changeIsGood === false ? ' bad' : ''}`}>
                                      {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Progress Photos */}
            <div className="cbm-section">
              <div className="cbm-section-header">
                <h2 className="cbm-section-title">Progress Photos</h2>
                {history.length >= 1 && (
                  <button className="cbm-compare-btn" onClick={() => {
                    setCompareA(history[0]?.period || '');
                    setCompareB(history[1]?.period || history[0]?.period || '');
                    setComparePhotoA(0);
                    setComparePhotoB(0);
                    setZoomA({ scale: 1, x: 0, y: 0 });
                    setZoomB({ scale: 1, x: 0, y: 0 });
                    setShowCompare(true);
                  }}>Compare</button>
                )}
              </div>

              {history.length === 0 ? (
                <p className="cbm-empty-text">Log your first measurements to start adding photos</p>
              ) : (
                <div className="cbm-photos-list">
                  {history.map(record => {
                    const periodPhotos = photos[record.period] || [];
                    return (
                      <div key={record.period} className="cbm-photo-period">
                        <div className="cbm-photo-period-header">
                          <span className="cbm-photo-period-date">{formatPeriod(record.period)}</span>
                          <button className="cbm-photo-add-btn" onClick={() => {
                            setPhotoUploadPeriod(record.period);
                            photoInputRef.current?.click();
                          }} disabled={uploadingPhoto}>
                            {uploadingPhoto && photoUploadPeriod === record.period ? (
                              <div className="cbm-btn-spinner-sm" />
                            ) : (
                              <>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                Add
                              </>
                            )}
                          </button>
                        </div>
                        {periodPhotos.length > 0 ? (
                          <div className="cbm-photo-grid">
                            {periodPhotos.map((photo, i) => (
                              <div key={i} className="cbm-photo-thumb">
                                <img src={photo.url} alt={photo.label || `Photo ${i + 1}`} loading="lazy" />
                                <button className="cbm-photo-delete" onClick={() => handleDeletePhoto(record.period, i)} aria-label="Remove photo">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="cbm-photo-empty">No photos for this period</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                style={{ display: 'none' }}
              />
            </div>
          </>
        )}
      </main>

      {/* Measure overlay */}
      {showMeasure && (
        <div className="cbm-overlay" onClick={() => setShowMeasure(false)}>
          <div className="cbm-overlay-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="cbm-overlay-title">Log Measurements</h2>
            <p className="cbm-overlay-desc">Enter your current measurements below.</p>
            <div className="cbm-form-section">
              {BODY_METRICS.map(m => (
                <div key={m.key} className="cbm-form-row">
                  <label className="cbm-form-name">{m.name}</label>
                  <div className="cbm-form-input-wrap">
                    <input
                      type="number"
                      inputMode="decimal"
                      className="cbm-form-input"
                      placeholder={latestRecord?.measurements?.[m.key]?.toString() || '0'}
                      value={formValues[m.key] || ''}
                      onChange={(e) => setFormValues(prev => ({ ...prev, [m.key]: e.target.value }))}
                    />
                    <span className="cbm-form-suffix">{m.suffix}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="cbm-overlay-actions">
              <button className="cbm-btn-secondary" onClick={() => setShowMeasure(false)}>Cancel</button>
              <button className="cbm-btn-primary" onClick={handleMeasureSave} disabled={saving}>
                {saving ? <div className="cbm-btn-spinner" /> : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit targets overlay */}
      {showEditTargets && (
        <div className="cbm-overlay" onClick={() => setShowEditTargets(false)}>
          <div className="cbm-overlay-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="cbm-overlay-title">Edit Targets</h2>
            <p className="cbm-overlay-desc">Update your target measurements.</p>
            <div className="cbm-form-section">
              {BODY_METRICS.map(m => {
                const baseline = targetsDoc?.baseline?.[m.key] || 0;
                const target = Number(targetValues[m.key]) || 0;
                const dir = baseline && target ? getDirection(baseline, target) : null;
                return (
                  <div key={m.key} className="cbm-form-row">
                    <div className="cbm-form-name-wrap">
                      <label className="cbm-form-name">{m.name}</label>
                      {dir && (
                        <span className={`cbm-dir-badge cbm-dir-${dir}`}>
                          {dir === 'gain' ? 'Gain' : dir === 'lose' ? 'Lose' : 'Hold'}
                        </span>
                      )}
                    </div>
                    <div className="cbm-form-input-wrap">
                      <input
                        type="number"
                        inputMode="decimal"
                        className="cbm-form-input"
                        placeholder="0"
                        value={targetValues[m.key] || ''}
                        onChange={(e) => setTargetValues(prev => ({ ...prev, [m.key]: e.target.value }))}
                      />
                      <span className="cbm-form-suffix">{m.suffix}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="cbm-overlay-actions">
              <button className="cbm-btn-secondary" onClick={() => setShowEditTargets(false)}>Cancel</button>
              <button className="cbm-btn-primary" onClick={handleTargetsSave} disabled={saving}>
                {saving ? <div className="cbm-btn-spinner" /> : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compare overlay */}
      {showCompare && (
        <div className="cbm-overlay" onClick={() => setShowCompare(false)}>
          <div className="cbm-overlay-card cbm-compare-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="cbm-overlay-title">Compare Progress</h2>
            <div className="cbm-compare-selectors">
              <div className="cbm-compare-select-wrap">
                <label className="cbm-compare-label">From</label>
                <select className="cbm-compare-select" value={compareA} onChange={(e) => { setCompareA(e.target.value); setComparePhotoA(0); }}>
                  {history.map(r => <option key={r.period} value={r.period}>{formatPeriod(r.period)}</option>)}
                </select>
              </div>
              <div className="cbm-compare-select-wrap">
                <label className="cbm-compare-label">To</label>
                <select className="cbm-compare-select" value={compareB} onChange={(e) => { setCompareB(e.target.value); setComparePhotoB(0); }}>
                  {history.map(r => <option key={r.period} value={r.period}>{formatPeriod(r.period)}</option>)}
                </select>
              </div>
            </div>

            {/* Photo comparison */}
            {(photos[compareA]?.length > 0 || photos[compareB]?.length > 0) && (
              <div className="cbm-compare-photos">
                <div className="cbm-compare-photo-col">
                  <span className="cbm-compare-photo-label">{formatPeriod(compareA)}</span>
                  {photos[compareA]?.length > 0 ? (
                    <div className="cbm-compare-photo-wrap">
                      <ZoomablePhoto src={photos[compareA][comparePhotoA]?.url} alt="Before" zoom={zoomA} setZoom={setZoomA} touchStateRef={touchStateRef} id="a" />
                      {photos[compareA].length > 1 && (
                        <div className="cbm-compare-photo-nav">
                          <button className="cbm-compare-nav-btn" disabled={comparePhotoA === 0} onClick={() => { setComparePhotoA(i => i - 1); setZoomA({ scale: 1, x: 0, y: 0 }); }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                          </button>
                          <span className="cbm-compare-photo-count">{comparePhotoA + 1} / {photos[compareA].length}</span>
                          <button className="cbm-compare-nav-btn" disabled={comparePhotoA >= photos[compareA].length - 1} onClick={() => { setComparePhotoA(i => i + 1); setZoomA({ scale: 1, x: 0, y: 0 }); }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="cbm-compare-photo-empty">No photo</div>
                  )}
                </div>
                <div className="cbm-compare-photo-col">
                  <span className="cbm-compare-photo-label">{formatPeriod(compareB)}</span>
                  {photos[compareB]?.length > 0 ? (
                    <div className="cbm-compare-photo-wrap">
                      <ZoomablePhoto src={photos[compareB][comparePhotoB]?.url} alt="After" zoom={zoomB} setZoom={setZoomB} touchStateRef={touchStateRef} id="b" />
                      {photos[compareB].length > 1 && (
                        <div className="cbm-compare-photo-nav">
                          <button className="cbm-compare-nav-btn" disabled={comparePhotoB === 0} onClick={() => { setComparePhotoB(i => i - 1); setZoomB({ scale: 1, x: 0, y: 0 }); }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                          </button>
                          <span className="cbm-compare-photo-count">{comparePhotoB + 1} / {photos[compareB].length}</span>
                          <button className="cbm-compare-nav-btn" disabled={comparePhotoB >= photos[compareB].length - 1} onClick={() => { setComparePhotoB(i => i + 1); setZoomB({ scale: 1, x: 0, y: 0 }); }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="cbm-compare-photo-empty">No photo</div>
                  )}
                </div>
              </div>
            )}

            {/* Metric comparison */}
            {(() => {
              const recA = history.find(r => r.period === compareA);
              const recB = history.find(r => r.period === compareB);
              if (!recA || !recB) return null;
              return (
                <div className="cbm-compare-metrics">
                  {BODY_METRICS.map(m => {
                    const valA = recA.measurements?.[m.key];
                    const valB = recB.measurements?.[m.key];
                    const diff = valA != null && valB != null ? valB - valA : null;
                    const direction = getDirection(targetsDoc?.baseline?.[m.key], targetsDoc?.targets?.[m.key]);
                    let changeIsGood = null;
                    if (diff !== null && diff !== 0) {
                      if (direction === 'gain') changeIsGood = diff > 0;
                      else if (direction === 'lose') changeIsGood = diff < 0;
                    }
                    return (
                      <div key={m.key} className="cbm-compare-row">
                        <span className="cbm-compare-metric-name">{m.name}</span>
                        <span className="cbm-compare-val">{valA ?? '-'}</span>
                        <span className="cbm-compare-arrow">&rarr;</span>
                        <span className="cbm-compare-val">{valB ?? '-'}</span>
                        {diff !== null && (
                          <span className={`cbm-compare-diff${changeIsGood === true ? ' good' : changeIsGood === false ? ' bad' : ''}`}>
                            {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {(photos[compareA]?.length > 0 || photos[compareB]?.length > 0) && (
              <button
                className="cbm-btn-primary cbm-compare-close"
                onClick={handleSaveCompare}
                disabled={savingCompare}
              >
                {savingCompare ? <div className="cbm-btn-spinner" /> : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                    Share Photo
                  </>
                )}
              </button>
            )}
            <button className="cbm-btn-secondary cbm-compare-close" onClick={() => setShowCompare(false)}>Close</button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast-notification ${toast.type}`}>
          <div className="toast-icon">
            {toast.type === 'success' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>}
            {toast.type === 'error' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>}
            {toast.type === 'info' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>}
          </div>
          {toast.message}
        </div>
      )}

      <CoreBuddyNav active="home" />
    </div>
    </>
  );
}
