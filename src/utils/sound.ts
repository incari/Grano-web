// Lightweight beep via the Web Audio API. No-op where unsupported.
type Beep = 'step' | 'done';

const TONES: Record<Beep, { freq: number; duration: number }> = {
  step: { freq: 880, duration: 0.12 }, // short high blip when a new pour begins
  done: { freq: 1320, duration: 0.18 }, // brighter blip on completion
};

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    return null;
  }
  if (!ctx) {
    ctx = new Ctor();
  }
  return ctx;
}

export function beep(tone: Beep): void {
  const audio = getContext();
  if (!audio) {
    return;
  }
  try {
    // Some browsers suspend the context until a user gesture resumes it.
    if (audio.state === 'suspended') {
      void audio.resume();
    }
    const { freq, duration } = TONES[tone];
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const now = audio.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    // Short attack/decay envelope to avoid clicks.
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain).connect(audio.destination);
    osc.start(now);
    osc.stop(now + duration);
  } catch {
    // Ignore — audio may be blocked outside a user gesture.
  }
}
