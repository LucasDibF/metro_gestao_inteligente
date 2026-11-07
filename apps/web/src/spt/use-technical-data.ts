import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, auth } from '../auth/client';
import type { SheetLayer } from './sheet/types';
import type { Layer, ReviewAction, TechnicalData, TechnicalForm } from './technical-types';

export interface TechnicalDataState {
  data: TechnicalData | null;
  revision: number;
  busy: boolean;
  error: string;
  /** Code of the last failed save, when the API sent one. */
  errorCode: string | undefined;
  message: string;
  fieldEditor: boolean;
  layerEditor: Layer | 'new' | null;
  history: boolean;
  reviewAction: ReviewAction | null;
  setMessage: (message: string) => void;
  setFieldEditor: (open: boolean) => void;
  setLayerEditor: (layer: Layer | 'new' | null) => void;
  toggleHistory: () => void;
  setReviewAction: (action: ReviewAction | null) => void;
  refresh: () => void;
  reload: () => void;
  editSheetLayer: (selected: SheetLayer) => Promise<void>;
  save: (event: FormEvent<HTMLFormElement>, kind: TechnicalForm) => Promise<void>;
}

/** Loads a borehole's technical data and saves field data, soil layers and review steps. */
export function useTechnicalData({
  workId,
  holeId,
  onError,
}: {
  workId: string;
  holeId: string;
  onError: (error: unknown) => void;
}): TechnicalDataState {
  const [data, setData] = useState<TechnicalData | null>(null),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [errorCode, setErrorCode] = useState<string | undefined>(),
    [message, setMessage] = useState('');
  const [fieldEditor, setFieldEditor] = useState(false),
    [layerEditor, setLayerEditor] = useState<Layer | 'new' | null>(null),
    [history, setHistory] = useState(false),
    [reviewAction, setReviewAction] = useState<ReviewAction | null>(null);
  const base = `/obras/${workId}/furos/${holeId}/tecnico`;
  useEffect(() => {
    let active = true;
    auth
      .request<TechnicalData>(base)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          onError(e);
        }
      });
    return () => {
      active = false;
    };
  }, [base, revision, onError]);
  async function editSheetLayer(selected: SheetLayer) {
    setBusy(true);
    setError('');
    try {
      const fresh = await auth.request<TechnicalData>(base);
      setData(fresh);
      const found = fresh.layers.find((layer) => layer.id === selected.id);
      if (!found) throw Error('A camada mudou. Atualize a folha para selecionar novamente.');
      setLayerEditor(found);
      requestAnimationFrame(() =>
        document.getElementById('soil-from')?.scrollIntoView({ block: 'center' }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir a camada.');
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>, kind: TechnicalForm) {
    event.preventDefault();
    if (!data) return;
    const values = new FormData(event.currentTarget);
    setError('');
    setErrorCode(undefined);
    setMessage('');
    if (kind === 'layer' && Number(values.get('from')) >= Number(values.get('to'))) {
      setError('A profundidade em “Até” precisa ser maior que em “De”.');
      return;
    }
    setBusy(true);
    let path = base,
      method = 'PUT',
      body: Record<string, unknown> = {};
    if (kind === 'fields')
      body = {
        technicalVersion: data.hole.technicalVersion,
        executedDepthM: String(values.get('executed')) || null,
        waterLevelM: String(values.get('water')) || null,
        fieldDate: String(values.get('date')) || null,
      };
    if (kind === 'layer') {
      const current = layerEditor && layerEditor !== 'new' ? layerEditor : null;
      path += `/camadas${current ? '/' + current.id : ''}`;
      method = current ? 'PUT' : 'POST';
      body = {
        fromM: String(values.get('from')),
        toM: String(values.get('to')),
        soilType: String(values.get('type')).trim(),
        description: String(values.get('description')),
        ...(current ? { version: current.version } : {}),
      };
    }
    if (kind === 'review') {
      path += '/' + reviewAction;
      method = 'POST';
      body = {
        technicalVersion: data.hole.technicalVersion,
        note: String(values.get('note')).trim(),
      };
    }
    try {
      await auth.request(path, { method, body: JSON.stringify(body) });
      setFieldEditor(false);
      setLayerEditor(null);
      setReviewAction(null);
      setRevision((v) => v + 1);
      setMessage('Dados salvos.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
      const code = e instanceof ApiError ? e.code : undefined;
      setErrorCode(code);
      // The profile changed elsewhere: close the approval so the page can be opened to fix it.
      if (code === 'PROFESSIONAL_PROFILE_INCOMPLETE') setReviewAction(null);
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  function refresh() {
    setRevision((v) => v + 1);
  }
  function reload() {
    setError('');
    setErrorCode(undefined);
    setFieldEditor(false);
    setLayerEditor(null);
    setReviewAction(null);
    refresh();
  }
  return {
    data,
    revision,
    busy,
    error,
    errorCode,
    message,
    fieldEditor,
    layerEditor,
    history,
    reviewAction,
    setMessage,
    setFieldEditor,
    setLayerEditor,
    toggleHistory: () => setHistory((v) => !v),
    setReviewAction,
    refresh,
    reload,
    editSheetLayer,
    save,
  };
}
