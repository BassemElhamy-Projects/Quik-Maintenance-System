import { useEffect } from 'react';

// Global reference counter for active modals
let activeLockCount = 0;
let originalOverflow: string | null = null;
let originalPaddingRight: string | null = null;

/**
 * Locks background page scrolling in a ref-counted manner.
 * Safe for nested modals, modal-to-modal transitions, and rapid unmounting.
 * Returns an unlock cleanup function.
 */
export function lockScroll(): () => void {
  if (typeof document === 'undefined') return () => {};

  if (activeLockCount === 0) {
    const currentOverflow = document.body.style.overflow;
    // Only capture original if it wasn't already locked as 'hidden'
    if (currentOverflow && currentOverflow !== 'hidden') {
      originalOverflow = currentOverflow;
    } else {
      originalOverflow = '';
    }
    originalPaddingRight = document.body.style.paddingRight || '';
    document.body.style.overflow = 'hidden';
  }
  
  activeLockCount++;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeLockCount = Math.max(0, activeLockCount - 1);

    if (activeLockCount === 0) {
      if (originalOverflow !== null && originalOverflow !== 'hidden') {
        document.body.style.overflow = originalOverflow;
      } else {
        document.body.style.overflow = '';
      }
      
      if (originalPaddingRight !== null) {
        document.body.style.paddingRight = originalPaddingRight;
      } else {
        document.body.style.paddingRight = '';
      }

      originalOverflow = null;
      originalPaddingRight = null;
    }
  };
}

/**
 * Forcefully clears all scroll locks and restores normal page scrolling.
 */
export function forceUnlockScroll(): void {
  if (typeof document === 'undefined') return;
  activeLockCount = 0;
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
  originalOverflow = null;
  originalPaddingRight = null;
}

/**
 * React hook to lock scroll when `isOpen` is true and release when false or unmounted.
 */
export function useScrollLock(isOpen: boolean): void {
  useEffect(() => {
    if (!isOpen) return;
    const unlock = lockScroll();
    return () => {
      unlock();
    };
  }, [isOpen]);
}
