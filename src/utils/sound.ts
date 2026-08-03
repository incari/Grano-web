// Lightweight beep via the Web Audio API. No-op where unsupported.
type Beep = "step" | "done";

const TONES: Record<Beep, { freq: number; duration: number }> = {
  step: { freq: 880, duration: 0.12 }, // short high blip when a new pour begins
  done: { freq: 1320, duration: 0.18 }, // brighter blip on completion
};

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) {
    return null;
  }
  if (!ctx) {
    ctx = new Ctor();
  }
  return ctx;
}

// Play the note now, assuming the context is running.
function playNote(audio: AudioContext, tone: Beep): void {
  const { freq, duration } = TONES[tone];
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  const now = audio.currentTime;

  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, now);

  // Short attack/decay envelope to avoid clicks.
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.18, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + duration);
}

export function beep(tone: Beep): void {
  const audio = getContext();
  if (!audio) {
    return;
  }
  try {
    // Browsers suspend the context until a user gesture resumes it. Scheduling a
    // note against a suspended context drops it, so resume first and only play
    // once the context is actually running.
    if (audio.state === "suspended") {
      void audio
        .resume()
        .then(() => playNote(audio, tone))
        .catch(() => {});
      return;
    }
    playNote(audio, tone);
  } catch {
    // Ignore — audio may be blocked outside a user gesture.
  }
}

// Unlock the audio context on the first user interaction so later beeps (e.g.
// from a physical scale button) play even without an immediate gesture.
export function primeAudio(): void {
  const audio = getContext();
  if (audio && audio.state === "suspended") {
    void audio.resume().catch(() => {});
  }
}

if (typeof window !== "undefined") {
  const unlock = () => primeAudio();
  window.addEventListener("pointerdown", unlock, { once: false });
  window.addEventListener("keydown", unlock, { once: false });
  window.addEventListener("touchstart", unlock, { once: false });
}
