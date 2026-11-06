import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { auth } from '../auth/client';
import type { Work, WorkList, WorkSummary } from './work-types';

export interface WorksState {
  data: WorkList | null;
  loading: boolean;
  error: string;
  message: string;
  query: string;
  status: string;
  summary: WorkSummary | null;
  page: number;
  editing: Work | 'new' | null;
  saving: boolean;
  saveError: string;
  setMessage: (message: string) => void;
  setQuery: (query: string) => void;
  setStatus: (status: string) => void;
  setPage: Dispatch<SetStateAction<number>>;
  setEditing: (work: Work | 'new' | null) => void;
  setSaveError: (error: string) => void;
  refresh: () => void;
  choose: (work: Work | 'new') => void;
  save: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  reloadWork: () => Promise<void>;
}

/** Loads the company's works and summary, and saves the work being edited. */
export function useWorks(onError: (error: unknown) => void): WorksState {
  const [data, setData] = useState<WorkList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [summary, setSummary] = useState<WorkSummary | null>(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<Work | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    auth
      .request<WorkList>(
        `/obras?page=${page}&q=${encodeURIComponent(query)}${status ? `&status=${status}` : ''}`,
      )
      .then((result) => {
        if (active) setData(result);
      })
      .catch((error) => {
        if (active) {
          setError(error instanceof Error ? error.message : 'Não foi possível carregar as obras.');
          onError(error);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, query, status, revision, onError]);
  useEffect(() => {
    let active = true;
    auth
      .request<WorkSummary>('/workspace/resumo')
      .then((v) => {
        if (active) setSummary(v);
      })
      .catch(onError);
    return () => {
      active = false;
    };
  }, [revision, onError]);
  function choose(work: Work | 'new') {
    setEditing(work);
    setSaveError('');
    setMessage('');
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const input = Object.fromEntries(
      ['name', 'clientName', 'city', 'state', 'address'].map((key) => [
        key,
        String(values.get(key)).trim() || null,
      ]),
    );
    const current = editing;
    if (!current) return;
    setSaving(true);
    setSaveError('');
    try {
      await auth.request<Work>(current === 'new' ? '/obras' : `/obras/${current.id}`, {
        method: current === 'new' ? 'POST' : 'PUT',
        body: JSON.stringify({
          ...input,
          ...(current === 'new'
            ? {
                initialBoreholeCount: Number(values.get('initialBoreholeCount')),
                initialFolderName: String(values.get('initialFolderName')).trim() || null,
              }
            : { version: current.version }),
        }),
      });
      setEditing(null);
      setMessage(current === 'new' ? 'Obra cadastrada.' : 'Obra atualizada.');
      setRevision((value) => value + 1);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Não foi possível salvar.');
      onError(error);
    } finally {
      setSaving(false);
    }
  }
  async function reloadWork() {
    if (!editing || editing === 'new') return;
    setSaving(true);
    try {
      setEditing(await auth.request<Work>(`/obras/${editing.id}`));
      setSaveError('');
      setRevision((value) => value + 1);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Não foi possível atualizar.');
      onError(error);
    } finally {
      setSaving(false);
    }
  }
  return {
    data,
    loading,
    error,
    message,
    query,
    status,
    summary,
    page,
    editing,
    saving,
    saveError,
    setMessage,
    setQuery,
    setStatus,
    setPage,
    setEditing,
    setSaveError,
    refresh: () => setRevision((value) => value + 1),
    choose,
    save,
    reloadWork,
  };
}
