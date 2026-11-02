import { useEffect, useState, type FormEvent } from 'react';
import { Save, RefreshCw } from 'lucide-react';
import { auth } from '../auth/client';
import { Button } from '../ui/Button';
export interface Identification {
  id: string;
  code: string;
  version: number;
  folderId: string | null;
  plannedDepthM: string | null;
}
export function BoreholeIdentification({
  workId,
  hole,
  onSaved,
  onError,
  onEditingChange,
}: {
  workId: string;
  hole: Identification;
  onSaved: (hole: Identification) => void;
  onError: (e: unknown) => void;
  onEditingChange?: (value: boolean) => void;
}) {
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [page, setPage] = useState(1),
    [total, setTotal] = useState(0);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setLoadingFolders(true);
    auth
      .request<{ items: Array<{ id: string; name: string }>; total: number }>(
        `/obras/${workId}/pastas?page=${page}`,
      )
      .then((v) => {
        if (active) {
          setFolders((old) =>
            page === 1
              ? v.items
              : [...old, ...v.items.filter((f) => !old.some((o) => o.id === f.id))],
          );
          setTotal(v.total);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          onError(e);
        }
      })
      .finally(() => {
        if (active) setLoadingFolders(false);
      });
    return () => {
      active = false;
    };
  }, [workId, page, onError]);
  useEffect(() => {
    onEditingChange?.(dirty);
    return () => onEditingChange?.(false);
  }, [dirty, onEditingChange]);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      const saved = await auth.request<Identification>(`/obras/${workId}/furos/${hole.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          code: String(values.get('code')),
          folderId: String(values.get('folderId')) || null,
          plannedDepthM: String(values.get('plannedDepthM')) || null,
          version: hole.version,
        }),
      });
      setDirty(false);
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar a identificação.');
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="identification-title">
      <h3 id="identification-title">Identificação e planejamento</h3>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}
      <form
        className="panel"
        key={`${hole.id}:${hole.version}`}
        onSubmit={save}
        onChange={() => setDirty(true)}
      >
        <fieldset disabled={busy}>
          <label htmlFor="identification-code">Identificação do furo</label>
          <input
            id="identification-code"
            name="code"
            required
            maxLength={60}
            defaultValue={hole.code}
          />
          <label htmlFor="identification-folder">Pasta</label>
          <select id="identification-folder" name="folderId" defaultValue={hole.folderId ?? ''}>
            <option value="">Diretamente na obra</option>
            {hole.folderId && !folders.some((f) => f.id === hole.folderId) ? (
              <option value={hole.folderId}>Pasta atual</option>
            ) : null}
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          {folders.length < total ? (
            <Button
              type="button"
              className="secondary"
              icon={RefreshCw}
              disabled={loadingFolders}
              onClick={() => {
                if (!loadingFolders) {
                  setLoadingFolders(true);
                  setPage((v) => v + 1);
                }
              }}
            >
              Carregar mais pastas
            </Button>
          ) : null}
          <label htmlFor="identification-depth">Profundidade planejada em metros (opcional)</label>
          <input
            id="identification-depth"
            name="plannedDepthM"
            type="number"
            min="0.01"
            max="999999.99"
            step="0.01"
            defaultValue={hole.plannedDepthM ?? ''}
          />
          <div className="form-actions">
            <Button icon={Save}>Salvar identificação</Button>
            <Button type="reset" className="secondary" onClick={() => setDirty(false)}>
              Descartar alterações
            </Button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
