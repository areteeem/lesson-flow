import { useState } from 'react';

/** Stable shuffle seed that persists across re-renders but resets on remount. */
export function useShuffleSeed() {
  const [seed] = useState(() => crypto.randomUUID());
  return seed;
}
