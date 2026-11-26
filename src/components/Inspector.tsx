import type { Align, Field, FieldPatch, ImageAsset, PageSize, Variable } from '../types';

interface Props {
  field: Field;
  pageSize: PageSize;
  variables: Variable[];
  assets: ImageAsset[];
  onChange: (patch: FieldPatch) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onCopyToAllPages: () => void;
  pageCount: number;
}

function Num({ label, value, onChange, min = 0 }: { label: string; value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <label className="stack">
      {label}
      <input
        type="number"
        min={min}
        step={1}
        value={Math.round(value * 10) / 10}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(Math.max(min, v));
        }}
      />
    </label>
  );
}

export function Inspector({ field: f, pageSize, variables, assets, onChange, onDelete, onDuplicate, onCopyToAllPages, pageCount }: Props) {
  const imageVars = variables.filter((v) => v.type === 'image');
  const textVars = variables.filter((v) => v.type === 'text');

  return (
    <div className="inspector">
      <div className="panel__title">{f.kind === 'text' ? 'Text box' : 'Image'}</div>

      {f.kind === 'text' ? (
        <>
          <label className="stack">
            Content
            <textarea rows={3} value={f.text} onChange={(e) => onChange({ text: e.target.value })} />
          </label>
          {textVars.length > 0 && (
            <div className="chips">
              {textVars.map((v) => (
                <button key={v.id} className="chip" onClick={() => onChange({ text: `${f.text}{{${v.name}}}` })}>
                  + {v.name}
                </button>
              ))}
              <button className="chip" title="Record number" onClick={() => onChange({ text: `${f.text}{{#}}` })}>
                + #
              </button>
            </div>
          )}
          <div className="grid2">
            <Num label="Font size" value={f.fontSize} min={4} onChange={(v) => onChange({ fontSize: v })} />
            <label className="stack">
              Color
              <input type="color" value={f.color} onChange={(e) => onChange({ color: e.target.value })} />
            </label>
          </div>
          <div className="seg">
            {(['left', 'center', 'right'] as Align[]).map((a) => (
              <button key={a} className={f.align === a ? 'seg--on' : ''} onClick={() => onChange({ align: a })}>
                {a}
              </button>
            ))}
          </div>
        </>
      ) : (
        <label className="stack">
          Source
          <select
            value={f.source.type === 'asset' ? `a:${f.source.assetId}` : `v:${f.source.variableId}`}
            onChange={(e) => {
              const [t, id] = [e.target.value.slice(0, 1), e.target.value.slice(2)];
              onChange({ source: t === 'a' ? { type: 'asset', assetId: id } : { type: 'variable', variableId: id } });
            }}
          >
            <optgroup label="Same image on every record">
              {assets.map((a) => (
                <option key={a.id} value={`a:${a.id}`}>
                  {a.name}
                </option>
              ))}
            </optgroup>
            {imageVars.length > 0 && (
              <optgroup label="Image variable (per record)">
                {imageVars.map((v) => (
                  <option key={v.id} value={`v:${v.id}`}>
                    {`{{${v.name}}}`}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
      )}

      <div className="panel__sub">Position (pt) · page {pageSize.width.toFixed(0)}×{pageSize.height.toFixed(0)}</div>
      <div className="grid2">
        <Num label="X" value={f.x} onChange={(v) => onChange({ x: v })} />
        <Num label="Y" value={f.y} onChange={(v) => onChange({ y: v })} />
        <Num label="Width" value={f.w} min={8} onChange={(v) => onChange({ w: v })} />
        <Num label="Height" value={f.h} min={8} onChange={(v) => onChange({ h: v })} />
      </div>

      <div className="stack-btns">
        <button className="btn" onClick={onDuplicate}>
          Duplicate
        </button>
        {pageCount > 1 && (
          <button className="btn" onClick={onCopyToAllPages}>
            Copy to all pages
          </button>
        )}
        <button className="btn btn--danger" onClick={onDelete}>
          Delete
        </button>
      </div>
      <p className="hint">Drag to move, drag the corner to resize. Arrow keys nudge (Shift = 10pt), Delete removes.</p>
    </div>
  );
}
