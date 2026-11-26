import type { DataRecord, Field, ImageAsset, Variable } from '../types';

const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g;

/**
 * Replace {{name}} placeholders with record values. `{{#}}` is the 1-based record number.
 * When `record` is undefined the placeholders are left visible (design preview).
 */
export function interpolate(
  text: string,
  record: DataRecord | undefined,
  variables: Variable[],
  rowNumber?: number,
): string {
  return text.replace(PLACEHOLDER, (match, name: string) => {
    if (name === '#') return rowNumber != null ? String(rowNumber) : match;
    const v = variables.find((x) => x.name === name);
    if (!v || !record) return match;
    return record[v.id] ?? '';
  });
}

export function renamePlaceholder(text: string, oldName: string, newName: string) {
  const esc = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`\\{\\{\\s*${esc}\\s*\\}\\}`, 'g'), `{{${newName}}}`);
}

export function resolveImage(
  field: Field,
  record: DataRecord | undefined,
  assets: ImageAsset[],
): ImageAsset | undefined {
  if (field.kind !== 'image') return undefined;
  if (field.source.type === 'asset') {
    const id = field.source.assetId;
    return assets.find((a) => a.id === id);
  }
  const name = record?.[field.source.variableId];
  return name ? assets.find((a) => a.name === name) : undefined;
}

export function isValidVarName(name: string) {
  return /^[^{}\s#][^{}]*$/.test(name) && name.trim() === name;
}
