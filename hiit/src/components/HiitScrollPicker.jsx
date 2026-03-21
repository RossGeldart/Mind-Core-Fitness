import { useEffect, useRef, useCallback } from 'react';
import './HiitScrollPicker.css';

const ITEM_HEIGHT = 56;

export default function HiitScrollPicker({ open, title, values, selected, format, onSelect, onClose }) {
  const listRef = useRef(null);
  const touchStartRef = useRef(null);

  // Scroll to selected item on open
  useEffect(() => {
    if (open && listRef.current) {
      const idx = values.indexOf(selected);
      if (idx >= 0) {
        requestAnimationFrame(() => {
          listRef.current.scrollTop = idx * ITEM_HEIGHT;
        });
      }
    }
  }, [open, values, selected]);

  // Close on escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Prevent background scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const handleSnap = useCallback(() => {
    if (!listRef.current) return;
    const scrollTop = listRef.current.scrollTop;
    const idx = Math.round(scrollTop / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(idx, values.length - 1));
    listRef.current.scrollTo({ top: clamped * ITEM_HEIGHT, behavior: 'smooth' });
  }, [values.length]);

  const handleScroll = useCallback(() => {
    // Debounced snap on scroll end
    if (listRef.current._snapTimeout) clearTimeout(listRef.current._snapTimeout);
    listRef.current._snapTimeout = setTimeout(handleSnap, 120);
  }, [handleSnap]);

  if (!open) return null;

  return (
    <div className="hiit-picker-overlay" onClick={onClose}>
      <div className="hiit-picker-panel" onClick={e => e.stopPropagation()}>
        <div className="hiit-picker-header">
          <h3>{title}</h3>
          <button className="hiit-picker-close" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="hiit-picker-body">
          {/* Selection highlight bar */}
          <div className="hiit-picker-highlight" />

          {/* Scrollable list */}
          <div
            className="hiit-picker-list"
            ref={listRef}
            onScroll={handleScroll}
            onTouchStart={() => { touchStartRef.current = true; }}
            onTouchEnd={() => {
              touchStartRef.current = false;
              setTimeout(handleSnap, 150);
            }}
          >
            {/* Top spacer (3 blank items to center first item) */}
            <div style={{ height: ITEM_HEIGHT * 3 }} />

            {values.map((val) => {
              const isSelected = val === selected;
              return (
                <button
                  key={val}
                  className={`hiit-picker-item${isSelected ? ' selected' : ''}`}
                  style={{ height: ITEM_HEIGHT }}
                  onClick={() => onSelect(val)}
                >
                  {format(val)}
                </button>
              );
            })}

            {/* Bottom spacer */}
            <div style={{ height: ITEM_HEIGHT * 3 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
