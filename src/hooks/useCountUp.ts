import { useState, useEffect, useRef } from 'react';

/**
 * Lightweight, high-performance numeric count-up animation hook
 * Operates purely with requestAnimationFrame, respects prefers-reduced-motion
 * Animates smoothly over 250-400ms without flickering or unnecessary re-runs
 */
export function useCountUp(targetValue: number, durationMs = 350): number {
  const [displayValue, setDisplayValue] = useState<number>(targetValue);
  const prevTargetRef = useRef<number>(targetValue);
  const isFirstMountRef = useRef<boolean>(true);

  useEffect(() => {
    // Check for reduced motion preference
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayValue(targetValue);
      prevTargetRef.current = targetValue;
      return;
    }

    // If target value is unchanged after mount, do not replay animation
    if (!isFirstMountRef.current && prevTargetRef.current === targetValue) {
      return;
    }

    const startVal = isFirstMountRef.current ? 0 : prevTargetRef.current;
    prevTargetRef.current = targetValue;
    isFirstMountRef.current = false;

    if (startVal === targetValue) {
      setDisplayValue(targetValue);
      return;
    }

    let animationFrameId: number;
    let startTimestamp: number | null = null;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const elapsed = timestamp - startTimestamp;
      const progress = Math.min(elapsed / durationMs, 1);
      // Ease-out cubic: fast start, soft stop
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startVal + (targetValue - startVal) * easeOut);

      setDisplayValue(current);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        setDisplayValue(targetValue);
      }
    };

    animationFrameId = requestAnimationFrame(step);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [targetValue, durationMs]);

  return displayValue;
}
