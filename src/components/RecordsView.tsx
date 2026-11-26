import { useRef } from 'react';
import type { DataRecord, ImageAsset, Variable } from '../types';
import { parseCsv, toCsv } from '../lib/csv';
import { isValidVarName } from '../lib/placeholders';

interface Props {
  variables: Variable[];
  records: DataRecord[];
  assets: ImageAsset[];
  previewIndex: number;
  setRecords: (r: DataRecord[]) => void;
  setPreviewIndex: (i: number) => void;
  /** Create text variables for CSV headers that don't exist yet; returns all variables. */
  ensureVariables: (names: string[]) => Variable[];
  download: (blob: Blob, name: string) => void;
}

export function RecordsView(p: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const update = (row: number, varId: string, value: string) => {
    const next = p.records.slice();
    next[row] = { ...next[row], [varId]: value };
    p.setRecords(next);
  };

  const importCsv = async (file: File) => {
    const rows = parseCsv(await file.text());
    if (rows.length < 1) return;
    const headers = rows[0].map((h) => h.trim());
    const usable = headers.filter((h) => h && isValidVarName(h));
    const vars = p.ensureVariables(usable);
    const byName = new Map(vars.map((v) => [v.name, v.id]));
    const imported = rows.slice(1).map((r) => {
      const rec: DataRecord = {};
      headers.forEach((h, i) => {
        const id = byName.get(h);
        if (id) rec[id] = (r[i] ?? '').trim();
      });
      return rec;
    });
    const replace = p.records.length === 0 || confirm(`Replace the ${p.records.length} existing record(s)? Cancel appends instead.`);
    p.setRecords(replace ? imported : [...p.records, ...imported]);
  };

  const exportCsv = () => {
    const rows = [p.variables.map((v) => v.name), ...p.records.map((r) => p.variables.map((v) => r[v.id] ?? ''))];
    p.download(new Blob([toCsv(rows)], { type: 'text/csv' }), 'records.csv');
  };

  const templateCsv = () => {
    p.download(new Blob([toCsv([p.variables.map((v) => v.name)])], { type: 'text/csv' }), 'records-template.csv');
  };

  return (
    <div className="records">
      <div className="records__bar">
        <div>
          <h2>Records</h2>
          <p className="hint">
            Each row produces one filled copy of the template. For image variables pick an uploaded image (CSV: use the
            image name).
          </p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import CSV
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importCsv(f);
              e.target.value = '';
            }}
          />
          <button className="btn" onClick={templateCsv} disabled={!p.variables.length}>
            CSV template
          </button>
          <button className="btn" onClick={exportCsv} disabled={!p.records.length}>
            Export CSV
          </button>
          <button
            className="btn btn--primary"
            disabled={!p.variables.length}
            onClick={() => p.setRecords([...p.records, {}])}
          >
            + Add record
          </button>
        </div>
      </div>

      {p.variables.length === 0 ? (
        <div className="empty">
          <p>No variables yet. Add variables in the Design tab, or import a CSV — its header row becomes your variables.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="col-n">#</th>
                {p.variables.map((v) => (
                  <th key={v.id}>
                    {v.name}
                    {v.type === 'image' && <span className="badge">image</span>}
                  </th>
                ))}
                <th className="col-act" />
              </tr>
            </thead>
            <tbody>
              {p.records.map((r, i) => (
                <tr key={i} className={i === p.previewIndex ? 'row--preview' : ''}>
                  <td className="col-n">
                    <button className="link" title="Preview this record" onClick={() => p.setPreviewIndex(i)}>
                      {i + 1}
                    </button>
                  </td>
                  {p.variables.map((v) => (
                    <td key={v.id}>
                      {v.type === 'image' ? (
                        <select value={r[v.id] ?? ''} onChange={(e) => update(i, v.id, e.target.value)}>
                          <option value="">— none —</option>
                          {p.assets.map((a) => (
                            <option key={a.id} value={a.name}>
                              {a.name}
                            </option>
                          ))}
                          {r[v.id] && !p.assets.some((a) => a.name === r[v.id]) && (
                            <option value={r[v.id]}>{r[v.id]} (missing)</option>
                          )}
                        </select>
                      ) : (
                        <input value={r[v.id] ?? ''} onChange={(e) => update(i, v.id, e.target.value)} />
                      )}
                    </td>
                  ))}
                  <td className="col-act">
                    <button
                      className="icon-btn"
                      title="Duplicate"
                      onClick={() => p.setRecords([...p.records.slice(0, i + 1), { ...r }, ...p.records.slice(i + 1)])}
                    >
                      ⧉
                    </button>
                    <button
                      className="icon-btn"
                      title="Delete"
                      onClick={() => p.setRecords(p.records.filter((_, j) => j !== i))}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {p.records.length === 0 && <div className="empty">No records yet — add one or import a CSV.</div>}
        </div>
      )}
    </div>
  );
}
