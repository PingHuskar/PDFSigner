import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import type {
  DataRecord,
  Field,
  FieldPatch,
  FontAsset,
  ImageAsset,
  PlacePayload,
  Template,
  VarType,
  Variable,
} from './types';
import { openPdf, type PdfDoc } from './lib/pdf';
import { importImage } from './lib/images';
import { interpolate, renamePlaceholder, resolveImage } from './lib/placeholders';
import { generateMerged, generateZip, type RenderContext } from './lib/generate';
import { base64ToBytes, parseProject, serializeProject } from './lib/project';
import { PageView } from './components/PageView';
import { Sidebar } from './components/Sidebar';
import { Inspector } from './components/Inspector';
import { RecordsView } from './components/RecordsView';
import { SignaturePad } from './components/SignaturePad';

const uid = () => crypto.randomUUID().slice(0, 8);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function uniqueName(name: string, taken: string[]) {
  if (!taken.includes(name)) return name;
  for (let n = 2; ; n++) if (!taken.includes(`${name} ${n}`)) return `${name} ${n}`;
}

export default function App() {
  const [template, setTemplate] = useState<Template | null>(null);
  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [records, setRecords] = useState<DataRecord[]>([]);
  const [font, setFont] = useState<FontAsset | null>(null);
  const [filePattern, setFilePattern] = useState('document-{{#}}');

  const [view, setView] = useState<'design' | 'data'>('design');
  const [scale, setScale] = useState(1.25);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(0);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sigPad, setSigPad] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [outputMode, setOutputMode] = useState<'merged' | 'zip'>('merged');
  const projectRef = useRef<HTMLInputElement>(null);
  const disposePdf = useRef<(() => void) | null>(null);

  const selected = fields.find((f) => f.id === selectedId) ?? null;
  const previewRecord = records.length ? records[clamp(previewIndex, 0, records.length - 1)] : undefined;
  const previewRow = records.length ? clamp(previewIndex, 0, records.length - 1) + 1 : undefined;

  const run = useCallback(async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, []);

  // ---------- template ----------
  const loadTemplate = async (bytes: Uint8Array, name: string) => {
    const { doc, pages, dispose } = await openPdf(bytes);
    disposePdf.current?.();
    disposePdf.current = dispose;
    setPdf(doc);
    setTemplate({ name, bytes, pages });
    setFields((fs) => fs.filter((f) => f.page < pages.length));
    setActivePage(0);
  };

  const onTemplateFile = (file: File) =>
    run('Loading PDF…', async () => loadTemplate(new Uint8Array(await file.arrayBuffer()), file.name));

  // ---------- font ----------
  const applyFont = async (bytes: Uint8Array, name: string, family = `UserFont-${uid()}`) => {
    const face = new FontFace(family, bytes.slice().buffer);
    await face.load();
    document.fonts.add(face);
    setFont({ name, family, bytes });
  };

  const onFontFile = (file: File) =>
    run('Loading font…', async () => applyFont(new Uint8Array(await file.arrayBuffer()), file.name));

  // ---------- variables ----------
  const addVariable = (name: string, type: VarType) => {
    if (variables.some((v) => v.name === name)) return 'A variable with that name already exists';
    setVariables((vs) => [...vs, { id: uid(), name, type }]);
    return null;
  };

  const renameVariable = (id: string, name: string) => {
    if (!name) return 'Name required';
    if (/[{}]/.test(name) || name.startsWith('#')) return 'Invalid name';
    if (variables.some((v) => v.name === name && v.id !== id)) return 'Name already used';
    const old = variables.find((v) => v.id === id)!;
    setVariables((vs) => vs.map((v) => (v.id === id ? { ...v, name } : v)));
    setFields((fs) => fs.map((f) => (f.kind === 'text' ? { ...f, text: renamePlaceholder(f.text, old.name, name) } : f)));
    return null;
  };

  const deleteVariable = (id: string) => {
    const v = variables.find((x) => x.id === id)!;
    const used = fields.some(
      (f) => (f.kind === 'text' && f.text.includes(`{{${v.name}}}`)) || (f.kind === 'image' && f.source.type === 'variable' && f.source.variableId === id),
    );
    if (used && !confirm(`Delete "${v.name}" and the boxes that use only this variable?`)) return;
    setVariables((vs) => vs.filter((x) => x.id !== id));
    setFields((fs) =>
      fs.filter((f) =>
        f.kind === 'text' ? f.text.trim() !== `{{${v.name}}}` : !(f.source.type === 'variable' && f.source.variableId === id),
      ),
    );
    setRecords((rs) => rs.map(({ [id]: _drop, ...rest }) => rest));
  };

  const ensureVariables = (names: string[]) => {
    const created: Variable[] = names
      .filter((n, i) => names.indexOf(n) === i && !variables.some((v) => v.name === n))
      .map((name) => ({ id: uid(), name, type: 'text' }));
    const all = [...variables, ...created];
    if (created.length) setVariables(all);
    return all;
  };

  // ---------- images ----------
  const onUploadImages = (files: File[], removeWhite: boolean) =>
    run('Processing images…', async () => {
      const taken = assets.map((a) => a.name);
      const added: ImageAsset[] = [];
      for (const file of files) {
        const img = await importImage(file, removeWhite);
        const name = uniqueName(file.name.replace(/\.[^.]+$/, ''), taken);
        taken.push(name);
        added.push({ id: uid(), name, ...img });
      }
      setAssets((as) => [...as, ...added]);
    });

  const deleteAsset = (id: string) => {
    setAssets((as) => as.filter((a) => a.id !== id));
    setFields((fs) => fs.filter((f) => !(f.kind === 'image' && f.source.type === 'asset' && f.source.assetId === id)));
  };

  // ---------- fields ----------
  const place = (payload: PlacePayload, page = activePage, cx?: number, cy?: number) => {
    if (!template) return;
    const size = template.pages[page];
    let field: Field;
    const base = { id: uid(), page, x: 0, y: 0 };
    if (payload.type === 'asset') {
      const a = assets.find((x) => x.id === payload.assetId);
      if (!a) return;
      const w = 140;
      const h = Math.min(140, (w * a.height) / a.width);
      field = { ...base, kind: 'image', w, h, source: { type: 'asset', assetId: a.id } };
    } else if (payload.type === 'variable') {
      const v = variables.find((x) => x.id === payload.variableId);
      if (!v) return;
      field =
        v.type === 'image'
          ? { ...base, kind: 'image', w: 140, h: 56, source: { type: 'variable', variableId: v.id } }
          : { ...base, kind: 'text', w: 180, h: 22, text: `{{${v.name}}}`, fontSize: 12, color: '#111111', align: 'left' };
    } else {
      field = { ...base, kind: 'text', w: 180, h: 22, text: 'Text', fontSize: 12, color: '#111111', align: 'left' };
    }
    const px = cx ?? size.width / 2;
    const py = cy ?? size.height / 3 + (fields.filter((f) => f.page === page).length % 8) * 14;
    field.x = clamp(px - field.w / 2, 0, size.width - field.w);
    field.y = clamp(py - field.h / 2, 0, size.height - field.h);
    setFields((fs) => [...fs, field]);
    setSelectedId(field.id);
  };

  const changeField = useCallback((id: string, patch: FieldPatch) => {
    setFields((fs) => fs.map((f) => (f.id === id ? ({ ...f, ...patch } as Field) : f)));
  }, []);

  const deleteField = (id: string) => {
    setFields((fs) => fs.filter((f) => f.id !== id));
    setSelectedId(null);
  };

  const duplicateField = (f: Field) => {
    const copy = { ...f, id: uid(), x: f.x + 10, y: f.y + 10 } as Field;
    setFields((fs) => [...fs, copy]);
    setSelectedId(copy.id);
  };

  const copyToAllPages = (f: Field) => {
    if (!template) return;
    const copies = template.pages
      .map((_, i) => i)
      .filter((i) => i !== f.page)
      .map((page) => ({ ...f, id: uid(), page }) as Field);
    setFields((fs) => [...fs, ...copies]);
  };

  // keyboard: delete / nudge
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (!selected || view !== 'design' || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteField(selected.id);
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (d) {
        e.preventDefault();
        changeField(selected.id, { x: selected.x + d[0], y: selected.y + d[1] });
      }
      if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, view, changeField]);

  // ---------- rendering of fields in the editor ----------
  const fontFamily = font ? `'${font.family}', sans-serif` : 'Helvetica, Arial, sans-serif';
  const renderField = (f: Field) => {
    if (f.kind === 'image') {
      const a = resolveImage(f, previewRecord, assets);
      if (a) return <img src={a.dataUrl} alt="" draggable={false} />;
      const v = f.source.type === 'variable' ? variables.find((x) => x.id === (f.source as { variableId: string }).variableId) : null;
      return <span className="field__placeholder">{v ? `{{${v.name}}}` : 'missing image'}</span>;
    }
    const text = interpolate(f.text, previewRecord, variables, previewRow);
    return (
      <div
        className="field__text"
        style={{
          fontSize: f.fontSize * scale,
          color: f.color,
          textAlign: f.align,
          fontFamily,
          justifyContent: 'center',
        }}
      >
        {text.split('\n').map((l, i) => (
          <div key={i}>{l || ' '}</div>
        ))}
      </div>
    );
  };

  // ---------- generate ----------
  const ctx: RenderContext | null = useMemo(
    () => (template ? { template, fields, variables, assets, font } : null),
    [template, fields, variables, assets, font],
  );
  const baseName = template?.name.replace(/\.pdf$/i, '') ?? 'document';

  const previewPdf = () =>
    run('Building preview…', async () => {
      if (!ctx) return;
      const bytes = await generateMerged(ctx, previewRecord ? [previewRecord] : [], previewRow ?? 1);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      window.open(url, '_blank');
    });

  const generate = () =>
    run('Generating…', async () => {
      if (!ctx) return;
      if (outputMode === 'merged') {
        const bytes = await generateMerged(ctx, records);
        download(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${baseName}-filled.pdf`);
      } else {
        const blob = await generateZip(ctx, records, filePattern, (d, t) => setBusy(`Generating ${d}/${t}…`));
        download(blob, `${baseName}-documents.zip`);
      }
      setGenOpen(false);
    });

  // ---------- project save / open ----------
  const saveProject = () => {
    const json = serializeProject({ template, variables, fields, assets, records, font, filePattern });
    download(new Blob([json], { type: 'application/json' }), `${baseName}.pdfsigner.json`);
  };

  const openProject = (file: File) =>
    run('Opening project…', async () => {
      const p = parseProject(await file.text());
      if (p.template) await loadTemplate(base64ToBytes(p.template.data), p.template.name);
      else {
        disposePdf.current?.();
        disposePdf.current = null;
        setPdf(null);
        setTemplate(null);
      }
      if (p.font) await applyFont(base64ToBytes(p.font.data), p.font.name, p.font.family);
      else setFont(null);
      setVariables(p.variables);
      setFields(p.fields);
      setAssets(p.assets);
      setRecords(p.records);
      setFilePattern(p.filePattern);
      setSelectedId(null);
      setPreviewIndex(0);
    });

  // ---------- render ----------
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">✍</span> PDF Signer
        </div>
        <nav className="tabs">
          <button className={view === 'design' ? 'tab--on' : ''} onClick={() => setView('design')}>
            Design
          </button>
          <button className={view === 'data' ? 'tab--on' : ''} onClick={() => setView('data')}>
            Records <span className="count">{records.length}</span>
          </button>
        </nav>
        <div className="topbar__right">
          {records.length > 0 && (
            <label className="inline">
              Preview
              <select value={clamp(previewIndex, 0, records.length - 1)} onChange={(e) => setPreviewIndex(+e.target.value)}>
                {records.map((r, i) => {
                  const firstText = variables.find((v) => v.type === 'text');
                  return (
                    <option key={i} value={i}>
                      #{i + 1} {firstText && r[firstText.id] ? `· ${r[firstText.id]}` : ''}
                    </option>
                  );
                })}
              </select>
            </label>
          )}
          <button className="btn btn--ghost" onClick={() => projectRef.current?.click()}>
            Open project
          </button>
          <input
            ref={projectRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) openProject(f);
              e.target.value = '';
            }}
          />
          <button className="btn btn--ghost" onClick={saveProject} disabled={!template && !variables.length}>
            Save project
          </button>
          <button className="btn btn--primary" disabled={!template} onClick={() => setGenOpen(true)}>
            Generate PDF
          </button>
        </div>
      </header>

      {error && (
        <div className="banner banner--error">
          {error}
          <button className="icon-btn" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}

      {view === 'design' ? (
        <div className="workspace">
          <Sidebar
            template={template}
            variables={variables}
            assets={assets}
            font={font}
            onTemplateFile={onTemplateFile}
            onAddVariable={addVariable}
            onRenameVariable={renameVariable}
            onDeleteVariable={deleteVariable}
            onUploadImages={onUploadImages}
            onDrawSignature={() => setSigPad(true)}
            onDeleteAsset={deleteAsset}
            onFontFile={onFontFile}
            onClearFont={() => setFont(null)}
            onPlace={(pl) => place(pl)}
          />

          <main className="canvas-area">
            {template && pdf ? (
              <>
                <div className="zoom">
                  <button className="icon-btn" onClick={() => setScale((s) => clamp(s - 0.25, 0.5, 3))}>
                    −
                  </button>
                  <span>{Math.round(scale * 100)}%</span>
                  <button className="icon-btn" onClick={() => setScale((s) => clamp(s + 0.25, 0.5, 3))}>
                    +
                  </button>
                </div>
                <div className="pages">
                  {template.pages.map((size, i) => (
                    <PageView
                      key={i}
                      pdf={pdf}
                      index={i}
                      size={size}
                      scale={scale}
                      fields={fields.filter((f) => f.page === i)}
                      selectedId={selectedId}
                      active={activePage === i}
                      onSelect={setSelectedId}
                      onChange={changeField}
                      onActivate={() => setActivePage(i)}
                      onDropItem={(page, x, y, payload) => {
                        setActivePage(page);
                        place(payload, page, x, y);
                      }}
                      renderField={renderField}
                    />
                  ))}
                </div>
              </>
            ) : (
              <label
                className="dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f?.type === 'application/pdf' || f?.name.toLowerCase().endsWith('.pdf')) onTemplateFile(f);
                }}
              >
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onTemplateFile(f);
                  }}
                />
                <div className="dropzone__icon">📄</div>
                <div className="dropzone__title">Drop a PDF template here</div>
                <div className="hint">or click to choose a file — everything stays in your browser</div>
              </label>
            )}
          </main>

          <aside className="inspector-col">
            {selected && template ? (
              <Inspector
                field={selected}
                pageSize={template.pages[selected.page]}
                pageCount={template.pages.length}
                variables={variables}
                assets={assets}
                onChange={(patch) => changeField(selected.id, patch)}
                onDelete={() => deleteField(selected.id)}
                onDuplicate={() => duplicateField(selected)}
                onCopyToAllPages={() => copyToAllPages(selected)}
              />
            ) : (
              <div className="inspector">
                <div className="panel__title">How it works</div>
                <ol className="steps">
                  <li>Upload a PDF template.</li>
                  <li>Declare variables (text or image) and drag them onto the page.</li>
                  <li>Upload logos / signatures, or draw one, and place them.</li>
                  <li>Fill in records in the <b>Records</b> tab or import a CSV.</li>
                  <li>Generate one merged PDF or a ZIP with one PDF per record.</li>
                </ol>
                <p className="hint">Select a box on the page to edit it here.</p>
              </div>
            )}
          </aside>
        </div>
      ) : (
        <RecordsView
          variables={variables}
          records={records}
          assets={assets}
          previewIndex={previewIndex}
          setRecords={setRecords}
          setPreviewIndex={setPreviewIndex}
          ensureVariables={ensureVariables}
          download={download}
        />
      )}

      {sigPad && (
        <SignaturePad
          onClose={() => setSigPad(false)}
          onSave={(img, name) => {
            setAssets((as) => [...as, { id: uid(), name: uniqueName(name, as.map((a) => a.name)), ...img }]);
            setSigPad(false);
          }}
        />
      )}

      {genOpen && (
        <div className="modal" onPointerDown={() => !busy && setGenOpen(false)}>
          <div className="modal__box" onPointerDown={(e) => e.stopPropagation()}>
            <h3>Generate PDF</h3>
            <p className="hint">
              {records.length
                ? `${records.length} record${records.length > 1 ? 's' : ''} × ${template!.pages.length} page${template!.pages.length > 1 ? 's' : ''}.`
                : 'No records — the template will be filled once with static content only.'}
            </p>
            <div className="choice">
              <label className={outputMode === 'merged' ? 'choice--on' : ''}>
                <input type="radio" checked={outputMode === 'merged'} onChange={() => setOutputMode('merged')} />
                <div>
                  <b>One merged PDF</b>
                  <div className="hint">All records back to back in a single file.</div>
                </div>
              </label>
              <label className={outputMode === 'zip' ? 'choice--on' : ''}>
                <input type="radio" checked={outputMode === 'zip'} onChange={() => setOutputMode('zip')} />
                <div>
                  <b>ZIP of separate PDFs</b>
                  <div className="hint">One file per record.</div>
                </div>
              </label>
            </div>
            {outputMode === 'zip' && (
              <label className="stack">
                File name pattern
                <input value={filePattern} onChange={(e) => setFilePattern(e.target.value)} />
                <span className="hint">
                  Use <code>{'{{variable}}'}</code> and <code>{'{{#}}'}</code> for the record number.
                </span>
              </label>
            )}
            <div className="row row--end">
              <button className="btn btn--ghost" onClick={previewPdf} disabled={!!busy}>
                Preview current record
              </button>
              <button className="btn btn--primary" onClick={generate} disabled={!!busy}>
                {busy ?? 'Download'}
              </button>
            </div>
          </div>
        </div>
      )}

      {busy && !genOpen && <div className="toast">{busy}</div>}
    </div>
  );
}
