import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { auth } from '../auth/client';
import { readAdvances } from './read-advances';
import { resolveInterruptionReason } from './interruption-reason';
import type { PreviousSoil } from './metre-soil';
import type { Advance, SptPage, SptRecord } from './record-types';

export type MetreEditing = SptRecord | 'new' | null;

export interface SptRecords {
  formRef: RefObject<HTMLFormElement | null>;
  data: SptPage | null;
  page: number;
  revision: number;
  loading: boolean;
  busy: boolean;
  error: string;
  errorAttempt: number;
  message: string;
  editing: MetreEditing;
  result: SptRecord | null;
  newMetreDepth: string;
  depthValue: string;
  formSequence: number;
  previousSoil: PreviousSoil | null;
  /** The editor is on the first metre (0–1 m), which records soil without blows. */
  initialSoil: boolean;
  setDepthValue: (depth: string) => void;
  refresh: () => void;
  changePage: (step: number) => void;
  startNewMetre: (nextDepth: string) => void;
  startCorrection: (record: SptRecord) => void;
  cancelEdit: () => void;
  closeAndReload: () => void;
  openMetre: (depth: string) => Promise<void>;
  save: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

/** Loads the borehole's SPT metres and saves, reopens and paginates them. */
export function useSptRecords({
  workId,
  holeId,
  submissionEditing,
  onError,
}: {
  workId: string;
  holeId: string;
  submissionEditing: boolean;
  onError: (error: unknown) => void;
}): SptRecords {
  const [newMetreDepth, setNewMetreDepth] = useState('1');
  const [formSequence, setFormSequence] = useState(0);
  const [depthValue, setDepthValue] = useState('1');
  const formRef = useRef<HTMLFormElement>(null);
  const [errorAttempt, setErrorAttempt] = useState(0);
  const [data, setData] = useState<SptPage | null>(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<MetreEditing>(null);
  const [result, setResult] = useState<SptRecord | null>(null);
  const base = `/obras/${workId}/furos/${holeId}/ensaios`;
  const initialSoil =
    Number(depthValue) === 1 &&
    (!editing || editing === 'new' || editing.result.status === 'NOT_TESTED');
  const [previousSoil, setPreviousSoil] = useState<PreviousSoil | null>(null);
  useEffect(() => {
    let active = true;
    setPreviousSoil(null);
    if (editing && Number(depthValue) > 1)
      auth
        .request<{ record: SptRecord | null }>(`${base}/metro?depth=${Number(depthValue) - 1}`)
        .then(({ record }) => {
          if (active) setPreviousSoil(record?.soil.at(-1) ?? null);
        })
        .catch((e) => {
          if (active) onError(e);
        });
    return () => {
      active = false;
    };
  }, [base, depthValue, editing, revision, onError]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    auth
      .request<SptPage>(`${base}?page=${page}`)
      .then((value) => {
        if (active) {
          setData(value);
          if (!formRef.current) {
            setNewMetreDepth(value.nextDepth);
            setDepthValue(value.nextDepth);
          }
        }
      })
      .catch((error) => {
        if (active) {
          setError(
            error instanceof Error ? error.message : 'Não foi possível carregar os ensaios.',
          );
          onError(error);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [base, page, revision, onError]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorAttempt((v) => v + 1);
    const current = editing;
    if (!current || !data || loading) return;
    const values = new FormData(event.currentTarget);
    setError('');
    setMessage('');
    let advances: Advance[];
    try {
      advances = readAdvances(values);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível ler os avanços.');
      return;
    }
    const next = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'next';
    const reason = initialSoil
      ? null
      : resolveInterruptionReason({
          typed: String(values.get('reason') ?? ''),
          ending: values.get('ending') === 'on',
          advances,
        });
    setBusy(true);
    try {
      const saved = await auth.request<SptRecord>(
        current === 'new' ? base : `${base}/${current.id}`,
        {
          method: current === 'new' ? 'POST' : 'PUT',
          body: JSON.stringify({
            depthM: String(values.get('depth')),
            advances,
            ...(initialSoil ? { recordType: 'INITIAL_SOIL' } : {}),
            soil: {
              soilType: String(values.get('soilType')).trim(),
              description: String(values.get('soilDescription')),
              soilColor: String(values.get('soilColor')) || null,
              soilMoisture: String(values.get('soilMoisture')) || null,
            },
            fieldDetails: {
              executionMethod: String(values.get('executionMethod')) || null,
            },
            technicalVersion: data.technicalVersion,
            interruptionReason: reason,
            ...(current === 'new' ? {} : { version: current.version }),
          }),
        },
      );
      const following = String(Number(values.get('depth')) + 1);
      setNewMetreDepth(following);
      setDepthValue(following);
      setFormSequence((v) => v + 1);
      if (next) {
        try {
          const { record: existing } = await auth.request<{ record: SptRecord | null }>(
            `${base}/metro?depth=${following}`,
          );
          setEditing(existing ?? 'new');
        } catch (e) {
          setEditing(null);
          onError(e);
        }
      } else setEditing(null);
      setResult(saved);
      setMessage('Ensaio e descrição do solo salvos juntos.');
      if (next)
        requestAnimationFrame(() => {
          formRef.current?.querySelector<HTMLInputElement>('input')?.focus();
        });
      setPage(1);
      setRevision((value) => value + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível salvar.');
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  async function openMetre(depth: string) {
    if (editing || submissionEditing) return;
    setBusy(true);
    setError('');
    try {
      const [{ record }, fresh] = await Promise.all([
        auth.request<{ record: SptRecord | null }>(`${base}/metro?depth=${depth}`),
        auth.request<SptPage>(base + '?page=1'),
      ]);
      setData(fresh);
      setDepthValue(depth);
      setNewMetreDepth(depth);
      setFormSequence((v) => v + 1);
      setEditing(record ?? 'new');
      setResult(null);
      setMessage('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir o metro.');
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  function refresh() {
    setRevision((value) => value + 1);
  }
  function startNewMetre(nextDepth: string) {
    setNewMetreDepth(nextDepth);
    setDepthValue(nextDepth);
    setFormSequence((v) => v + 1);
    setEditing('new');
    setResult(null);
    setError('');
    setMessage('');
  }
  function startCorrection(record: SptRecord) {
    setDepthValue(record.depthM);
    setEditing(record);
    setResult(null);
    setError('');
    setMessage('');
  }
  function closeAndReload() {
    setEditing(null);
    setResult(null);
    refresh();
  }
  return {
    formRef,
    data,
    page,
    revision,
    loading,
    busy,
    error,
    errorAttempt,
    message,
    editing,
    result,
    newMetreDepth,
    depthValue,
    formSequence,
    previousSoil,
    initialSoil,
    setDepthValue,
    refresh,
    changePage: (step) => setPage((value) => value + step),
    startNewMetre,
    startCorrection,
    cancelEdit: () => setEditing(null),
    closeAndReload,
    openMetre,
    save,
  };
}
