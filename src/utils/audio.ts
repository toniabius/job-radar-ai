// Web Audio API helper for scan completion chime / bell ring
export function playCompletionChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // Helper to play a sine oscillator tone with exponential decay
    const playTone = (freq: number, startTime: number, duration: number, volume = 0.2) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);

      // Envelope: fast attack, exponential decay
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + startTime);
      gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + startTime);
      osc.stop(ctx.currentTime + startTime + duration);
    };

    // Pleasant triple ascending arpeggio chime (C5 -> E5 -> G5 -> C6)
    playTone(523.25, 0.0, 0.35, 0.2);   // C5
    playTone(659.25, 0.1, 0.35, 0.2);   // E5
    playTone(783.99, 0.2, 0.45, 0.22);  // G5
    playTone(1046.50, 0.32, 0.7, 0.25); // C6
  } catch (e) {
    console.warn("Unable to play scan completion audio chime:", e);
  }
}
