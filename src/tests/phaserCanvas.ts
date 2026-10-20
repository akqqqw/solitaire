/* Минимальная заглушка 2D-контекста для headless-проверки Phaser под jsdom. */
type Ctx = Record<string, unknown>;

function makeContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const state: Ctx = {
    canvas,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    font: '10px serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    lineCap: 'butt',
    lineJoin: 'miter',
    shadowBlur: 0,
    shadowColor: 'rgba(0,0,0,0)',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    imageSmoothingEnabled: true,
    miterLimit: 10,
    lineDashOffset: 0,
  };
  const measure = { width: 8, actualBoundingBoxAscent: 6, actualBoundingBoxDescent: 2 };
  const gradient = { addColorStop: () => undefined };
  const target = new Proxy(state, {
    get(obj, prop: string) {
      if (prop in obj) return obj[prop];
      if (prop === 'measureText') return () => measure;
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      if (prop === 'createPattern') return () => null;
      if (prop === 'getImageData') {
        return (_x: number, _y: number, w = 1, h = 1) => ({
          data: new Uint8ClampedArray(Math.max(4, w * h * 4)).fill(255),
          width: w,
          height: h,
        });
      }
      if (prop === 'createImageData') {
        return (w = 1, h = 1) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      }
      if (prop === 'getLineDash') return () => [];
      if (prop === 'isPointInPath' || prop === 'isPointInStroke') return () => false;
      return () => undefined;
    },
    set(obj, prop: string, value) {
      obj[prop] = value;
      return true;
    },
  });
  return target as unknown as CanvasRenderingContext2D;
}

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement) {
    return makeContext(this);
  } as unknown as HTMLCanvasElement['getContext'];
}
