import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Tumpukan modal: hanya modal teratas yang menangani Escape dan fokus.
const modalStack = [];
let modalSeq = 0;

/**
 * Kerangka modal terpusat dengan perilaku aksesibilitas standar:
 * role="dialog", aria-modal, Escape, focus trap, fokus awal/pulih, dan
 * kunci scroll body. Semua kelas Tailwind lama tetap dipertahankan lewat
 * backdropClassName / panelClassName.
 */
export default function ModalShell({
  onClose,
  titleId,
  label = 'Dialog',
  backdropClassName = '',
  panelClassName = '',
  closeOnBackdrop = true,
  initialFocusRef,
  children,
}) {
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const modalIdRef = useRef(null);
  if (modalIdRef.current === null) {
    modalSeq += 1;
    modalIdRef.current = modalSeq;
  }

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return undefined;

    const modalId = modalIdRef.current;
    const isTopmost = () => modalStack[modalStack.length - 1] === modalId;
    modalStack.push(modalId);

    const previousActive = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const initial = initialFocusRef?.current || panel;
    if (typeof initial?.focus === 'function') initial.focus();

    const getFocusable = () => Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR));

    const handleKeyDown = (event) => {
      if (!isTopmost()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const outside = !panel.contains(active) || active === panel;

      if (event.shiftKey) {
        if (outside || active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (outside || active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // Jaring pengaman untuk fokus yang lolos lewat klik/program (bukan Tab).
    const handleFocusIn = (event) => {
      if (!isTopmost()) return;
      if (!panel.contains(event.target)) panel.focus();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
      const index = modalStack.lastIndexOf(modalId);
      if (index !== -1) modalStack.splice(index, 1);
      document.body.style.overflow = modalStack.length > 0 ? 'hidden' : previousOverflow;
      if (
        previousActive &&
        typeof previousActive.focus === 'function' &&
        document.contains(previousActive)
      ) {
        previousActive.focus();
      }
    };
  }, [initialFocusRef]);

  const handleBackdropClick = (event) => {
    if (closeOnBackdrop && event.target === event.currentTarget) onCloseRef.current?.();
  };

  return (
    <div
      className={`fixed inset-0 z-50 ${backdropClassName}`.trim()}
      onClick={handleBackdropClick}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId || undefined}
        aria-label={titleId ? undefined : label}
        tabIndex={-1}
        className={panelClassName}
      >
        {children}
      </div>
    </div>
  );
}
