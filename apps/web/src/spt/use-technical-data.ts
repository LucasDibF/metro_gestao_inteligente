import { useEffect, useState, type FormEvent } from 'react';
import { auth } from '../auth/client';
import type { SheetLayer } from './sheet/types';
import type { Layer, ReviewAction, TechnicalData, TechnicalForm } from './technical-types';

export interface TechnicalDataState {
  data: TechnicalData | null;
  revision: number;
  busy: boolean;
  error: string;
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
        ...(reviewAction === 'aprovar'
          ? {
              reviewerName: String(values.get('name')),
              reviewerRegistration: String(values.get('registration')),
            }
          : {}),
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
