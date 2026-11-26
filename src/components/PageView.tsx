import { useEffect, useRef, type ReactNode } from 'react';
import { isCancelled, type PdfDoc } from '../lib/pdf';
import type { Field, FieldPatch, PageSize, PlacePayload } from '../types';

export const DRAG_MIME = 'application/x-pdf-signer';

interface Props {
  pdf: PdfDoc;
  index: number;
  size: PageSize;
  scale: number;
  fields: Field[];
  selectedId: string | null;
  active: boolean;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: FieldPatch) => void;
  onActivate: () => void;
  onDropItem: (page: number, x: number, y: number, payload: PlacePayload) => void;
  renderField: (f: Field) => ReactNode;
}

type DragState = {
  id: string;
  mode: 'move' | 'resize';
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  ow: number;
  oh: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function PageView(p: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<DragState | null>(null);
  const W = p.size.width;
  const H = p.size.height;

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    (async () => {
      const page = await p.pdf.getPage(p.index + 1);
      if (cancelled || !canvasRef.current) return;
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: p.scale * dpr });
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = page.render({ canvas, viewport });
      try {
        await task.promise;
      } catch (e) {
        if (!isCancelled(e)) console.error(e);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [p.pdf, p.index, p.scale]);

  const startDrag = (e: React.PointerEvent, f: Field, mode: DragState['mode']) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    p.onSelect(f.id);
    p.onActivate();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { id: f.id, mode, sx: e.clientX, sy: e.clientY, ox: f.x, oy: f.y, ow: f.w, oh: f.h };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / p.scale;
    const dy = (e.clientY - d.sy) / p.scale;
    if (d.mode === 'move') {
      p.onChange(d.id, { x: clamp(d.ox + dx, 0, W - d.ow), y: clamp(d.oy + dy, 0, H - d.oh) });
    } else {
      p.onChange(d.id, { w: clamp(d.ow + dx, 8, W - d.ox), h: clamp(d.oh + dy, 8, H - d.oy) });
    }
  };

  const endDrag = () => {
    drag.current = null;
  };

  const onDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    p.onDropItem(p.index, (e.clientX - rect.left) / p.scale, (e.clientY - rect.top) / p.scale, JSON.parse(raw));
  };

  return (
    <div className={`page ${p.active ? 'page--active' : ''}`}>
      <div className="page__label">Page {p.index + 1}</div>
      <div
        className="page__sheet"
        style={{ width: W * p.scale, height: H * p.scale }}
        onPointerDown={() => {
          p.onSelect(null);
          p.onActivate();
        }}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(DRAG_MIME)) e.preventDefault();
        }}
        onDrop={onDrop}
      >
        <canvas ref={canvasRef} className="page__canvas" style={{ width: W * p.scale, height: H * p.scale }} />
        {p.fields.map((f) => (
          <div
            key={f.id}
            className={`field field--${f.kind} ${p.selectedId === f.id ? 'field--selected' : ''}`}
            style={{ left: f.x * p.scale, top: f.y * p.scale, width: f.w * p.scale, height: f.h * p.scale }}
            onPointerDown={(e) => startDrag(e, f, 'move')}
          >
            {p.renderField(f)}
            <div className="field__handle" onPointerDown={(e) => startDrag(e, f, 'resize')} />
          </div>
        ))}
      </div>
    </div>
  );
}
