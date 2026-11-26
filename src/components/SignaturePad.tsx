import { useEffect, useRef, useState } from 'react';
import { trimTransparent } from '../lib/images';

interface Props {
  onSave: (img: { dataUrl: string; width: number; height: number }, name: string) => void;
  onClose: () => void;
}

const COLORS = ['#111827', '#1d3fbf', '#0b6b3a'];

export function SignaturePad({ onSave, onClose }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(3);
  const [empty, setEmpty] = useState(true);
  const [name, setName] = useState('Signature');

  useEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    c.getContext('2d')!.scale(dpr, dpr);
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent) => {
    ref.current!.setPointerCapture(e.pointerId);
    last.current = pos(e);
    const ctx = ref.current!.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, width / 2, 0, Math.PI * 2);
    ctx.fill();
    setEmpty(false);
  };

  const move = (e: React.PointerEvent) => {
    if (!last.current) return;
    const p = pos(e);
    const ctx = ref.current!.getContext('2d')!;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };

  const clear = () => {
    const c = ref.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
  };

  return (
    <div className="modal" onPointerDown={onClose}>
      <div className="modal__box" onPointerDown={(e) => e.stopPropagation()}>
        <h3>Draw a signature</h3>
        <canvas
          ref={ref}
          className="sigpad"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={() => (last.current = null)}
          onPointerCancel={() => (last.current = null)}
        />
        <div className="row">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`swatch ${c === color ? 'swatch--on' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Ink ${c}`}
            />
          ))}
          <label className="inline">
            Pen
            <input type="range" min={1} max={8} value={width} onChange={(e) => setWidth(+e.target.value)} />
          </label>
          <button className="btn btn--ghost" onClick={clear}>
            Clear
          </button>
        </div>
        <label className="stack">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="row row--end">
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            disabled={empty}
            onClick={() => onSave(trimTransparent(ref.current!), name.trim() || 'Signature')}
          >
            Save image
          </button>
        </div>
      </div>
    </div>
  );
}
