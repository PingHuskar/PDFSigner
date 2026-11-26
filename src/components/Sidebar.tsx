import { useRef, useState } from 'react';
import type { FontAsset, ImageAsset, PlacePayload, Template, VarType, Variable } from '../types';
import { isValidVarName } from '../lib/placeholders';
import { DRAG_MIME } from './PageView';

interface Props {
  template: Template | null;
  variables: Variable[];
  assets: ImageAsset[];
  font: FontAsset | null;
  onTemplateFile: (f: File) => void;
  onAddVariable: (name: string, type: VarType) => string | null;
  onRenameVariable: (id: string, name: string) => string | null;
  onDeleteVariable: (id: string) => void;
  onUploadImages: (files: File[], removeWhite: boolean) => void;
  onDrawSignature: () => void;
  onDeleteAsset: (id: string) => void;
  onFontFile: (f: File) => void;
  onClearFont: () => void;
  onPlace: (p: PlacePayload) => void;
}

const dragProps = (payload: PlacePayload) => ({
  draggable: true,
  onDragStart: (e: React.DragEvent) => {
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'copy';
  },
});

function VarRow({ v, onRename, onDelete, onPlace, canPlace }: {
  v: Variable;
  onRename: (name: string) => string | null;
  onDelete: () => void;
  onPlace: () => void;
  canPlace: boolean;
}) {
  const [name, setName] = useState(v.name);
  const [err, setErr] = useState<string | null>(null);
  const commit = () => {
    if (name === v.name) return setErr(null);
    const e = onRename(name.trim());
    setErr(e);
    if (e) setName(v.name);
  };
  return (
    <li className="item" {...(canPlace ? dragProps({ type: 'variable', variableId: v.id }) : {})} title={err ?? 'Drag onto the page'}>
      <span className="grip" aria-hidden>
        ⋮⋮
      </span>
      <input
        className="item__name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <span className={`badge badge--${v.type}`}>{v.type}</span>
      <button className="icon-btn" title="Place on active page" disabled={!canPlace} onClick={onPlace}>
        ＋
      </button>
      <button className="icon-btn" title="Delete variable" onClick={onDelete}>
        ✕
      </button>
    </li>
  );
}

export function Sidebar(p: Props) {
  const pdfRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const fontRef = useRef<HTMLInputElement>(null);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<VarType>('text');
  const [varErr, setVarErr] = useState<string | null>(null);
  const [removeWhite, setRemoveWhite] = useState(false);
  const canPlace = !!p.template;

  const addVar = () => {
    const name = newName.trim();
    if (!name) return;
    const e = !isValidVarName(name) ? 'Names cannot contain { } or start with # / space' : p.onAddVariable(name, newType);
    setVarErr(e);
    if (!e) setNewName('');
  };

  return (
    <aside className="sidebar">
      <section className="panel">
        <div className="panel__title">1 · Template PDF</div>
        {p.template ? (
          <div className="file-card">
            <div className="file-card__name" title={p.template.name}>
              {p.template.name}
            </div>
            <div className="hint">
              {p.template.pages.length} page{p.template.pages.length > 1 ? 's' : ''}
            </div>
          </div>
        ) : (
          <p className="hint">Upload the PDF you want to fill and sign.</p>
        )}
        <button className="btn btn--block" onClick={() => pdfRef.current?.click()}>
          {p.template ? 'Replace PDF…' : 'Upload PDF…'}
        </button>
        <input
          ref={pdfRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) p.onTemplateFile(f);
            e.target.value = '';
          }}
        />
      </section>

      <section className="panel">
        <div className="panel__title">2 · Variables</div>
        <p className="hint">
          Values that change per record. Text variables are written as <code>{'{{name}}'}</code>.
        </p>
        <div className="row">
          <input
            className="grow"
            placeholder="e.g. full_name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addVar()}
          />
          <select value={newType} onChange={(e) => setNewType(e.target.value as VarType)}>
            <option value="text">Text</option>
            <option value="image">Image</option>
          </select>
          <button className="btn btn--primary" onClick={addVar}>
            Add
          </button>
        </div>
        {varErr && <div className="error-text">{varErr}</div>}
        <ul className="list">
          {p.variables.map((v) => (
            <VarRow
              key={v.id}
              v={v}
              canPlace={canPlace}
              onRename={(n) => p.onRenameVariable(v.id, n)}
              onDelete={() => p.onDeleteVariable(v.id)}
              onPlace={() => p.onPlace({ type: 'variable', variableId: v.id })}
            />
          ))}
        </ul>
        <button
          className="btn btn--block btn--ghost"
          disabled={!canPlace}
          {...dragProps({ type: 'text' })}
          onClick={() => p.onPlace({ type: 'text' })}
        >
          ＋ Static text box
        </button>
      </section>

      <section className="panel">
        <div className="panel__title">3 · Logos &amp; signatures</div>
        <div className="row">
          <button className="btn grow" onClick={() => imgRef.current?.click()}>
            Upload image…
          </button>
          <button className="btn grow" onClick={p.onDrawSignature}>
            Draw signature
          </button>
        </div>
        <label className="inline hint">
          <input type="checkbox" checked={removeWhite} onChange={(e) => setRemoveWhite(e.target.checked)} />
          Remove white background on upload
        </label>
        <input
          ref={imgRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) p.onUploadImages(files, removeWhite);
            e.target.value = '';
          }}
        />
        {p.assets.length > 0 && (
          <div className="thumbs">
            {p.assets.map((a) => (
              <div
                key={a.id}
                className="thumb"
                {...(canPlace ? dragProps({ type: 'asset', assetId: a.id }) : {})}
                title={`${a.name} — drag onto the page or click ＋`}
              >
                <img src={a.dataUrl} alt={a.name} draggable={false} />
                <div className="thumb__name">{a.name}</div>
                <div className="thumb__actions">
                  <button className="icon-btn" disabled={!canPlace} onClick={() => p.onPlace({ type: 'asset', assetId: a.id })}>
                    ＋
                  </button>
                  <button className="icon-btn" onClick={() => p.onDeleteAsset(a.id)}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel__title">4 · Font</div>
        <p className="hint">
          {p.font ? (
            <>
              Using <b>{p.font.name}</b>.
            </>
          ) : (
            <>Built-in Helvetica (Latin only). Upload a .ttf/.otf for Thai or other scripts.</>
          )}
        </p>
        <div className="row">
          <button className="btn grow" onClick={() => fontRef.current?.click()}>
            {p.font ? 'Change font…' : 'Upload font…'}
          </button>
          {p.font && (
            <button className="btn btn--ghost" onClick={p.onClearFont}>
              Reset
            </button>
          )}
        </div>
        <input
          ref={fontRef}
          type="file"
          accept=".ttf,.otf,font/ttf,font/otf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) p.onFontFile(f);
            e.target.value = '';
          }}
        />
      </section>
    </aside>
  );
}
