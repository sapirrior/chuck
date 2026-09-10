import { useCallback, useEffect, useRef } from 'react';

export const DOUBLE_PRESS_TIMEOUT_MS = 800;

/**
 * Hook matching Claude Code's useDoublePress behavior.
 * Invokes onFirstPress and sets pending on first stroke,
 * then invokes onDoublePress if triggered again within DOUBLE_PRESS_TIMEOUT_MS.
 */
export function useDoublePress(
  setPending: (pending: boolean) => void,
  onDoublePress: () => void,
  onFirstPress?: () => void,
  timeoutMs: number = DOUBLE_PRESS_TIMEOUT_MS,
): () => void {
  const lastPressRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const clearTimeoutSafe = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimeoutSafe();
    };
  }, [clearTimeoutSafe]);

  return useCallback(() => {
    const now = Date.now();
    const timeSinceLastPress = now - lastPressRef.current;
    const isDoublePress = timeSinceLastPress <= timeoutMs && timeoutRef.current !== undefined;

    if (isDoublePress) {
      clearTimeoutSafe();
      setPending(false);
      lastPressRef.current = 0;
      onDoublePress();
    } else {
      lastPressRef.current = now;
      onFirstPress?.();
      setPending(true);

      clearTimeoutSafe();
      timeoutRef.current = setTimeout(() => {
        setPending(false);
        timeoutRef.current = undefined;
      }, timeoutMs);
    }
  }, [clearTimeoutSafe, onDoublePress, onFirstPress, setPending, timeoutMs]);
}
