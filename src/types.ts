export type VarType = 'text' | 'image';

/** A named placeholder whose value changes per record. */
export interface Variable {
  id: string;
  name: string;
  type: VarType;
}

/** An uploaded (or drawn) logo / signature image, stored as PNG or JPEG data URL. */
export interface ImageAsset {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
}

export type Align = 'left' | 'center' | 'right';

/** Geometry is in PDF points, origin at the top-left of the visible page. */
interface FieldBase {
  id: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextField extends FieldBase {
  kind: 'text';
  /** May contain {{variable}} placeholders. */
  text: string;
  fontSize: number;
  color: string;
  align: Align;
}

export type ImageSource =
  | { type: 'asset'; assetId: string }
  | { type: 'variable'; variableId: string };

export interface ImageField extends FieldBase {
  kind: 'image';
  source: ImageSource;
}

export type Field = TextField | ImageField;
export type FieldPatch = Partial<Omit<TextField, 'kind'>> & Partial<Omit<ImageField, 'kind'>>;

/** variableId -> value. For image variables the value is an image asset name. */
export type DataRecord = Record<string, string>;

export interface PageSize {
  width: number;
  height: number;
}

export interface Template {
  name: string;
  bytes: Uint8Array;
  pages: PageSize[];
}

export interface FontAsset {
  name: string;
  family: string;
  bytes: Uint8Array;
}

/** Something dragged from the sidebar onto a page. */
export type PlacePayload =
  | { type: 'variable'; variableId: string }
  | { type: 'asset'; assetId: string }
  | { type: 'text' };
