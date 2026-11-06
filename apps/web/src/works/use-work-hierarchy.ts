import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { auth } from '../auth/client';
import {
  mergeFolders,
  type Borehole,
  type BoreholeInput,
  type Folder,
  type Page,
} from './hierarchy-types';

export interface WorkHierarchyState {
  base: string;
  selectedFolder: Folder | null;
  folders: Folder[];
  folderTotal: number;
  folderLoading: boolean;
  holes: Page<Borehole> | null;
  page: number;
  revision: number;
  loading: boolean;
  busy: boolean;
  error: string;
  message: string;
  folderEdit: Folder | 'new' | null;
  holeEdit: Borehole | 'new' | null;
  setSelectedFolder: (folder: Folder | null) => void;
  setPage: Dispatch<SetStateAction<number>>;
  setError: (error: string) => void;
  setMessage: (message: string) => void;
  setFolderEdit: (folder: Folder | 'new' | null) => void;
  setHoleEdit: (hole: Borehole | 'new' | null) => void;
  refresh: () => void;
  moreFolders: () => Promise<void>;
  saveFolder: (name: string) => Promise<void>;
  saveHole: (input: BoreholeInput) => Promise<void>;
}

/** Loads a work's folders and boreholes and saves them; the screen chooses what to show. */
export function useWorkHierarchy(
  workId: string,
  onError: (error: unknown) => void,
): WorkHierarchyState {
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderPage, setFolderPage] = useState(1);
  const [folderTotal, setFolderTotal] = useState(0);
  const [folderLoading, setFolderLoading] = useState(true);
  const [holes, setHoles] = useState<Page<Borehole> | null>(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [folderEdit, setFolderEdit] = useState<Folder | 'new' | null>(null);
  const [holeEdit, setHoleEdit] = useState<Borehole | 'new' | null>(null);
  const base = `/obras/${workId}`;
  function failed(error: unknown) {
    setError(error instanceof Error ? error.message : 'Não foi possível concluir.');
    onError(error);
  }
  useEffect(() => {
    let active = true;
    setFolderLoading(true);
    Promise.all(
      Array.from({ length: folderPage }, (_, index) =>
        auth.request<Page<Folder>>(`${base}/pastas?page=${index + 1}`),
      ),
    )
      .then((pages) => {
        if (active) {
          setFolders(pages.flatMap((result) => result.items));
          setFolderTotal(pages[0].total);
        }
      })
      .catch((error) => {
        if (active) failed(error);
      })
      .finally(() => {
        if (active) setFolderLoading(false);
      });
    return () => {
      active = false;
    };
  }, [base, revision]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    auth
      .request<Page<Borehole>>(
        `${base}/furos?page=${page}&folderId=${selectedFolder?.id ?? 'root'}`,
      )
      .then((result) => {
        if (active) setHoles(result);
      })
      .catch((error) => {
        if (active) failed(error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [base, page, revision, selectedFolder?.id]);
  async function moreFolders() {
    setBusy(true);
    setError('');
    try {
      const result = await auth.request<Page<Folder>>(`${base}/pastas?page=${folderPage + 1}`);
      setFolders((current) => mergeFolders(current, result.items));
      setFolderPage(result.page);
      setFolderTotal(result.total);
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  async function saveFolder(name: string) {
    const current = folderEdit;
    if (!current) return;
    setBusy(true);
    setError('');
    try {
      const saved = await auth.request<Folder>(
        `${base}/pastas${current === 'new' ? '' : `/${current.id}`}`,
        {
          method: current === 'new' ? 'POST' : 'PUT',
          body: JSON.stringify({
            name,
            ...(current === 'new' ? {} : { version: current.version }),
          }),
        },
      );
      setFolderEdit(null);
      if (selectedFolder?.id === saved.id) setSelectedFolder(saved);
      setMessage('Pasta salva.');
      setRevision((value) => value + 1);
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  async function saveHole(input: BoreholeInput) {
    const current = holeEdit;
    if (!current) return;
    setBusy(true);
    setError('');
    try {
      await auth.request(`${base}/furos${current === 'new' ? '' : `/${current.id}`}`, {
        method: current === 'new' ? 'POST' : 'PUT',
        body: JSON.stringify({
          ...input,
          ...(current === 'new' ? {} : { version: current.version }),
        }),
      });
      setHoleEdit(null);
      setMessage('Furo salvo.');
      setRevision((value) => value + 1);
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  return {
    base,
    selectedFolder,
    folders,
    folderTotal,
    folderLoading,
    holes,
    page,
    revision,
    loading,
    busy,
    error,
    message,
    folderEdit,
    holeEdit,
    setSelectedFolder,
    setPage,
    setError,
    setMessage,
    setFolderEdit,
    setHoleEdit,
    refresh: () => setRevision((value) => value + 1),
    moreFolders,
    saveFolder,
    saveHole,
  };
}
