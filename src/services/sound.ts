/** Короткие синтезированные звуки без внешних файлов. */
class SoundService {
  private context: AudioContext | null = null;
  enabled = true;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private getContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      try {
        this.context = new Ctor();
      } catch {
        return null;
      }
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
    return this.context;
  }

  private tone(
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'sine',
    delay = 0,
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const start = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    } catch {
      // Звук не критичен для игры.
    }
  }

  play(kind: 'move' | 'select' | 'flip' | 'deal' | 'win' | 'undo' | 'error' | 'click'): void {
    if (!this.enabled) return;
    switch (kind) {
      case 'select':
        this.tone(520, 0.06, 0.03, 'triangle');
        break;
      case 'move':
        this.tone(330, 0.09, 0.035, 'triangle');
        this.tone(440, 0.07, 0.02, 'sine', 0.03);
        break;
      case 'flip':
        this.tone(660, 0.08, 0.025, 'triangle');
        break;
      case 'deal':
        this.tone(260, 0.06, 0.02, 'triangle');
        this.tone(300, 0.05, 0.015, 'triangle', 0.05);
        break;
      case 'undo':
        this.tone(400, 0.1, 0.03, 'sine');
        this.tone(300, 0.12, 0.02, 'sine', 0.05);
        break;
      case 'error':
        this.tone(160, 0.12, 0.03, 'sawtooth');
        break;
      case 'click':
        this.tone(480, 0.04, 0.015, 'square');
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((freq, i) =>
          this.tone(freq, 0.35, 0.04, 'sine', i * 0.12),
        );
        break;
    }
  }
}

export const sound = new SoundService();
