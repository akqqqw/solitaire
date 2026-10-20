/**
 * Мягкие синтезированные звуки без внешних файлов.
 *
 * Раньше это были короткие «бипы» из одиночных осцилляторов (square/sawtooth),
 * которые читались как 8-битная аркада. Теперь звук строится как в настольном
 * клубе: короткий шорох карты по сукну (фильтрованный шум) плюс тихий низкий
 * «стук», общий мягкий фильтр и лёгкое эхо зала.
 */
export type SoundKind =
  | 'move'
  | 'select'
  | 'flip'
  | 'deal'
  | 'win'
  | 'undo'
  | 'error'
  | 'click';

interface ToneOptions {
  frequency: number;
  duration: number;
  volume: number;
  type?: OscillatorType;
  delay?: number;
  /** Плавная атака: резкий старт и даёт «писклявость». */
  attack?: number;
  /** Плавное скольжение частоты к концу звука. */
  glideTo?: number;
  filter?: number;
}

interface NoiseOptions {
  delay?: number;
  duration?: number;
  volume?: number;
  frequency?: number;
  q?: number;
  type?: BiquadFilterType;
}

export class SoundService {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
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

  /**
   * Общая шина: тише, мягче по верхам и с коротким эхом.
   * Без неё даже тихие осцилляторы звучат сухо и «цифрово».
   */
  private graph(ctx: AudioContext): GainNode | null {
    if (this.master) return this.master;
    try {
      const master = ctx.createGain();
      master.gain.value = 0.55;

      const softener = ctx.createBiquadFilter();
      softener.type = 'lowpass';
      softener.frequency.value = 4800;
      softener.Q.value = 0.3;

      const wet = ctx.createGain();
      wet.gain.value = 0.14;
      const delay = ctx.createDelay(0.5);
      delay.delayTime.value = 0.1;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.18;

      master.connect(softener);
      softener.connect(ctx.destination);
      master.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wet);
      wet.connect(softener);

      this.master = master;
      return master;
    } catch {
      return null;
    }
  }

  /** Белый шум для шороха карты: он звучит естественнее любого «бипа». */
  private noiseBuffer(ctx: AudioContext): AudioBuffer | null {
    if (this.noise) return this.noise;
    try {
      const length = Math.floor(ctx.sampleRate * 0.25);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let previous = 0;
      for (let i = 0; i < length; i += 1) {
        const white = Math.random() * 2 - 1;
        // Немного сглаживания: чистый белый шум шипит на высоких частотах.
        previous = previous * 0.35 + white * 0.65;
        data[i] = previous;
      }
      this.noise = buffer;
      return buffer;
    } catch {
      return null;
    }
  }

  private tone(options: ToneOptions): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const master = this.graph(ctx);
    if (!master) return;
    try {
      const start = ctx.currentTime + (options.delay ?? 0);
      const attack = Math.max(0.008, options.attack ?? 0.014);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = options.filter ?? 2400;
      filter.Q.value = 0.4;

      osc.type = options.type ?? 'sine';
      osc.frequency.setValueAtTime(options.frequency, start);
      if (options.glideTo) {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(20, options.glideTo),
          start + options.duration,
        );
      }

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(options.volume, start + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + options.duration + 0.03);
    } catch {
      // Звук не критичен для игры.
    }
  }

  private card(options: NoiseOptions = {}): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const master = this.graph(ctx);
    const buffer = this.noiseBuffer(ctx);
    if (!master || !buffer) return;
    try {
      const start = ctx.currentTime + (options.delay ?? 0);
      const duration = options.duration ?? 0.055;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = options.type ?? 'bandpass';
      filter.frequency.value = options.frequency ?? 1700;
      filter.Q.value = options.q ?? 0.8;
      const gain = ctx.createGain();
      const volume = options.volume ?? 0.05;

      gain.gain.setValueAtTime(0.0001, start);
      // Даже шорох карты начинается не мгновенно: щелчок на старте — это
      // первое, что выдаёт синтетический звук.
      gain.gain.linearRampToValueAtTime(volume, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(start);
      source.stop(start + duration + 0.02);
    } catch {
      // Звук не критичен для игры.
    }
  }

  play(kind: SoundKind): void {
    if (!this.enabled) return;
    switch (kind) {
      case 'select':
        this.card({ frequency: 2300, volume: 0.03, duration: 0.045 });
        this.tone({ frequency: 620, duration: 0.07, volume: 0.012, type: 'triangle' });
        break;
      case 'move':
        this.card({ frequency: 1500, volume: 0.055 });
        this.tone({
          frequency: 210,
          duration: 0.11,
          volume: 0.028,
          attack: 0.02,
          filter: 700,
        });
        break;
      case 'flip':
        this.card({ frequency: 2600, volume: 0.04, duration: 0.05 });
        break;
      case 'deal':
        this.card({ frequency: 1750, volume: 0.045 });
        this.card({ frequency: 1350, volume: 0.03, delay: 0.05 });
        this.tone({ frequency: 180, duration: 0.09, volume: 0.02, filter: 600 });
        break;
      case 'undo':
        this.card({ frequency: 1300, volume: 0.04, duration: 0.06 });
        this.tone({
          frequency: 330,
          duration: 0.16,
          volume: 0.022,
          type: 'sine',
          glideTo: 250,
          filter: 900,
        });
        break;
      case 'error':
        // Никакого sawtooth: мягкий низкий сигнал с плавной атакой.
        this.tone({
          frequency: 165,
          duration: 0.22,
          volume: 0.03,
          attack: 0.04,
          glideTo: 140,
          filter: 520,
        });
        this.tone({ frequency: 247, duration: 0.18, volume: 0.012, attack: 0.05, filter: 700 });
        break;
      case 'click':
        this.card({ frequency: 2400, volume: 0.022, duration: 0.04, q: 1.1 });
        break;
      case 'win':
        [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
          this.tone({
            frequency,
            duration: 0.55,
            volume: 0.03,
            type: 'sine',
            delay: index * 0.11,
            attack: 0.02,
            filter: 3200,
          });
          this.tone({
            frequency: frequency / 2,
            duration: 0.5,
            volume: 0.012,
            type: 'triangle',
            delay: index * 0.11,
            attack: 0.03,
            filter: 1200,
          });
        });
        this.card({ frequency: 3200, volume: 0.02, duration: 0.3, delay: 0.42, q: 0.6 });
        break;
    }
  }
}

export const sound = new SoundService();
