// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SoundService } from '../services/sound';

interface ParamCall {
  method: 'setValueAtTime' | 'linearRampToValueAtTime' | 'exponentialRampToValueAtTime';
  value: number;
  time: number;
}

interface FakeParam {
  value: number;
  calls: ParamCall[];
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, time: number): void;
  exponentialRampToValueAtTime(value: number, time: number): void;
}

function param(initial = 0): FakeParam {
  const calls: ParamCall[] = [];
  return {
    value: initial,
    calls,
    setValueAtTime(this: FakeParam, value, time) {
      this.value = value;
      calls.push({ method: 'setValueAtTime', value, time });
    },
    linearRampToValueAtTime(value, time) {
      calls.push({ method: 'linearRampToValueAtTime', value, time });
    },
    exponentialRampToValueAtTime(value, time) {
      calls.push({ method: 'exponentialRampToValueAtTime', value, time });
    },
  };
}

interface FakeNode {
  kind: string;
  connect(target: unknown): unknown;
  started?: number;
  stopped?: number;
}

interface FakeSource extends FakeNode {
  start(time: number): void;
  stop(time: number): void;
}

interface FakeOscillator extends FakeNode {
  type: string;
  frequency: FakeParam;
  start(time: number): void;
  stop(time: number): void;
}

interface FakeAudio {
  nodes: FakeNode[];
  oscillators: FakeOscillator[];
  gains: Array<FakeNode & { gain: FakeParam }>;
  filters: Array<FakeNode & { type: string; frequency: FakeParam; Q: FakeParam }>;
  sources: FakeNode[];
  delays: Array<FakeNode & { delayTime: FakeParam }>;
  contexts: number;
}

function installAudio(): FakeAudio {
  const audio: FakeAudio = {
    nodes: [],
    oscillators: [],
    gains: [],
    filters: [],
    sources: [],
    delays: [],
    contexts: 0,
  };
  const connect = function connect(this: FakeNode, target: unknown) {
    return target;
  };

  class FakeAudioContext {
    state = 'running';
    currentTime = 0;
    sampleRate = 48000;
    destination = { kind: 'destination' };

    constructor() {
      audio.contexts += 1;
    }

    resume(): Promise<void> {
      return Promise.resolve();
    }

    createGain() {
      const node = { kind: 'gain', gain: param(1), connect } as unknown as FakeNode & {
        gain: FakeParam;
      };
      audio.nodes.push(node);
      audio.gains.push(node);
      return node;
    }

    createOscillator() {
      const node: FakeOscillator = {
        kind: 'osc',
        type: 'sine',
        frequency: param(440),
        connect,
        start(time: number) {
          node.started = time;
        },
        stop(time: number) {
          node.stopped = time;
        },
      };
      audio.nodes.push(node);
      audio.oscillators.push(node);
      return node;
    }

    createBiquadFilter() {
      const node = {
        kind: 'filter',
        type: 'lowpass',
        frequency: param(350),
        Q: param(1),
        connect,
      } as unknown as FakeNode & { type: string; frequency: FakeParam; Q: FakeParam };
      audio.nodes.push(node);
      audio.filters.push(node);
      return node;
    }

    createBufferSource() {
      const node: FakeSource = {
        kind: 'buffer',
        connect,
        start(time: number) {
          node.started = time;
        },
        stop(time: number) {
          node.stopped = time;
        },
      };
      audio.nodes.push(node);
      audio.sources.push(node);
      return node;
    }

    createBuffer(_channels: number, length: number, _rate: number) {
      return { getChannelData: () => new Float32Array(length) };
    }

    createDelay(_max: number) {
      const node = { kind: 'delay', delayTime: param(0), connect } as unknown as FakeNode & {
        delayTime: FakeParam;
      };
      audio.nodes.push(node);
      audio.delays.push(node);
      return node;
    }
  }

  (globalThis as unknown as { window: unknown }).window = { AudioContext: FakeAudioContext };
  return audio;
}

let audio: FakeAudio;

beforeEach(() => {
  audio = installAudio();
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe('sound: мягкий клубный звук вместо 8-битных бипов', () => {
  it('не использует square и sawtooth ни в одном эффекте', () => {
    const sound = new SoundService();
    for (const kind of ['select', 'move', 'flip', 'deal', 'undo', 'error', 'click', 'win'] as const) {
      sound.play(kind);
    }
    expect(audio.oscillators.length).toBeGreaterThan(0);
    for (const osc of audio.oscillators) {
      expect(['sine', 'triangle']).toContain(osc.type);
    }
  });

  it('проводит звук через общий мягкий фильтр и короткое эхо', () => {
    const sound = new SoundService();
    sound.play('move');
    const softener = audio.filters.find(
      (filter) => filter.type === 'lowpass' && filter.frequency.value === 4800,
    );
    expect(softener).toBeTruthy();
    // Эхо зала: задержка с обратной связью и влажным уровнем.
    expect(audio.delays.length).toBeGreaterThan(0);
    expect(audio.delays[0].delayTime.value).toBeGreaterThan(0);
    expect(audio.delays[0].delayTime.value).toBeLessThan(0.3);
  });

  it('шорох карты сделан фильтрованным шумом, а не тоном', () => {
    const sound = new SoundService();
    sound.play('move');
    expect(audio.sources.length).toBeGreaterThan(0);
    const band = audio.filters.find((filter) => filter.type === 'bandpass');
    expect(band).toBeTruthy();
    expect(band!.frequency.value).toBeGreaterThan(500);
  });

  it('у каждого звука плавная атака и затухание, без резкого старта', () => {
    const sound = new SoundService();
    sound.play('move');
    const ramps = audio.gains.flatMap((gain) => gain.gain.calls);
    expect(ramps.some((call) => call.method === 'linearRampToValueAtTime')).toBe(true);
    expect(ramps.some((call) => call.method === 'exponentialRampToValueAtTime')).toBe(true);
    // Атака не короче 8 мс — именно мгновенный старт звучит «цифрово».
    const attacks = ramps.filter((call) => call.method === 'linearRampToValueAtTime');
    expect(Math.min(...attacks.map((call) => call.time))).toBeGreaterThanOrEqual(0.008);
  });

  it('сигнал ошибки — низкий и глухой, без резких высоких частот', () => {
    const sound = new SoundService();
    sound.play('error');
    expect(audio.oscillators.every((osc) => osc.frequency.value < 400)).toBe(true);
    expect(audio.filters.every((filter) => filter.type !== 'highpass')).toBe(true);
  });

  it('победа — аккорд из четырёх нот с паузами, а не один писк', () => {
    const sound = new SoundService();
    sound.play('win');
    expect(audio.oscillators.length).toBeGreaterThanOrEqual(8);
    const lowpass = audio.filters.filter((filter) => filter.type === 'lowpass');
    expect(lowpass.length).toBeGreaterThan(0);
    // Основные ноты идут с задержкой друг за другом.
    expect(audio.oscillators.length).toBeGreaterThan(4);
  });

  it('выключенный звук вообще не создаёт аудиоконтекст', () => {
    const sound = new SoundService();
    sound.setEnabled(false);
    sound.play('move');
    sound.play('win');
    expect(audio.contexts).toBe(0);
    expect(audio.nodes.length).toBe(0);
  });

  it('контекст создаётся один раз и переиспользуется', () => {
    const sound = new SoundService();
    sound.play('move');
    sound.play('select');
    sound.play('win');
    expect(audio.contexts).toBe(1);
  });

  it('все узлы запускаются и останавливаются, утечки нет', () => {
    const sound = new SoundService();
    sound.play('move');
    for (const node of [...audio.oscillators, ...audio.sources]) {
      expect(node.started).toBeTypeOf('number');
      expect(node.stopped).toBeTypeOf('number');
      expect((node.stopped as number) - (node.started as number)).toBeGreaterThan(0);
      expect((node.stopped as number) - (node.started as number)).toBeLessThan(2);
    }
  });
});
