// Lightweight haptic feedback. No-op on devices without the Vibration API.
type Pattern = 'tick' | 'success' | 'warning';

const PATTERNS: Record<Pattern, number | number[]> = {
  tick: 10,
  success: [0, 30, 40, 30],
  warning: [0, 40, 60, 40],
};

export function haptic(pattern: Pattern): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) {
    return;
  }
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // Ignore — some browsers reject vibrate outside a user gesture.
  }
}
