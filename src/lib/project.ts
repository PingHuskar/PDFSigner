import type { DataRecord, Field, FontAsset, ImageAsset, Variable } from '../types';

export interface ProjectFile {
  app: 'pdf-signer';
  version: 1;
  template: { name: string; data: string } | null;
  variables: Variable[];
  fields: Field[];
  assets: ImageAsset[];
  records: DataRecord[];
  font: { name: string; family: string; data: string } | null;
  filePattern: string;
}

export function bytesToBase64(bytes: Uint8Array) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

export function base64ToBytes(b64: string) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function serializeProject(p: {
  template: { name: string; bytes: Uint8Array } | null;
  variables: Variable[];
  fields: Field[];
  assets: ImageAsset[];
  records: DataRecord[];
  font: FontAsset | null;
  filePattern: string;
}): string {
  const file: ProjectFile = {
    app: 'pdf-signer',
    version: 1,
    template: p.template ? { name: p.template.name, data: bytesToBase64(p.template.bytes) } : null,
    variables: p.variables,
    fields: p.fields,
    assets: p.assets,
    records: p.records,
    font: p.font ? { name: p.font.name, family: p.font.family, data: bytesToBase64(p.font.bytes) } : null,
    filePattern: p.filePattern,
  };
  return JSON.stringify(file);
}

export function parseProject(json: string): ProjectFile {
  const p = JSON.parse(json) as ProjectFile;
  if (p.app !== 'pdf-signer' || p.version !== 1) throw new Error('Not a PDF Signer project file');
  return p;
}
