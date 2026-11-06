export interface Folder {
  id: string;
  name: string;
  version: number;
}
export interface Borehole {
  id: string;
  code: string;
  folderId: string | null;
  plannedDepthM: string | null;
  version: number;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
/** What the borehole form submits; the version is added when an existing one is edited. */
export interface BoreholeInput {
  code: string;
  folderId: string | null;
  plannedDepthM: string | null;
}
/** Folders already loaded plus the new page, without repeating a folder seen before. */
export function mergeFolders(current: Folder[], next: Folder[]): Folder[] {
  return [
    ...current,
    ...next.filter((item) => !current.some((existing) => existing.id === item.id)),
  ];
}
