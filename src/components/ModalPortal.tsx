import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../utils/scrollLock';

interface ModalPortalProps {
  isOpen: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  maxWidthClass?: string;
  zIndexClass?: string;
  closeOnBackdrop?: boolean;
}

export const ModalPortal: React.FC<ModalPortalProps> = ({
  isOpen,
  onClose,
  children,
  maxWidthClass = 'max-w-2xl',
  zIndexClass = 'z-[9999]',
  closeOnBackdrop = false
}) => {
  // Use centralized ref-counted scroll lock
  useScrollLock(isOpen);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto`}
      style={{ zIndex: 9999 }}
      role="dialog"
      aria-modal="true"
    >
      {/* Darkened Backdrop Overlay */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs animate-fade-in transition-opacity duration-200"
        style={{ zIndex: 1 }}
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Modal Dialog Box - Guaranteed visible, centered, responsive, on top of backdrop */}
      <div
        className={`relative bg-white rounded-2xl shadow-2xl border border-slate-200/90 ${maxWidthClass} w-full max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden my-auto pointer-events-auto animate-modal-enter`}
        style={{ zIndex: 10, position: 'relative', opacity: 1, pointerEvents: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};
