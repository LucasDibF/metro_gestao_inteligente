import { LoadingState } from '../ui/LoadingState';
import { Button } from '../ui/Button';
import { RefreshCw, RotateCcw, ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { auth } from '../auth/client';
interface Item {
  id: string;
  label: string;
  version: number;
  deletedAt: string;
  workName?: string | null;
  folderName?: string | null;
}
interface Page {
  items: Item[];
  total: number;
  page: number;
  pageSize: number;
}
export function Trash({ onError }: { onError: (error: unknown) => void }) {
  const [kind, setKind] = useState('obras');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    auth
      .request<Page>(`/lixeira?tipo=${kind}&page=${page}`)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((error) => {
        if (active) {
          setError(error instanceof Error ? error.message : 'Não foi possível carregar a lixeira.');
          onError(error);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [kind, page, revision, onError]);
  async function restore(item: Item) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await auth.request(`/lixeira/${kind}/${item.id}/restaurar`, {
        method: 'POST',
        body: JSON.stringify({ version: item.version }),
      });
      setMessage(`${item.label} foi restaurado.`);
      setPage(1);
      setRevision((value) => value + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível restaurar.');
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="trash-title">
      <h2 id="trash-title">Lixeira</h2>
      <p>
        Restaure primeiro a obra, depois a pasta e, por último, os furos vinculados. Nenhum item é
        apagado definitivamente aqui.
      </p>
      <label htmlFor="trash-kind">Tipo de registro</label>
      <select
        id="trash-kind"
        className="trash-filter"
        value={kind}
        disabled={busy}
        onChange={(event) => {
          setKind(event.target.value);
          setPage(1);
          setMessage('');
        }}
      >
        <option value="obras">Obras</option>
        <option value="pastas">Pastas</option>
        <option value="furos">Furos</option>
      </select>
      {message ? (
        <p className="notice" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <div className="error" role="alert">
          <p>{error}</p>
          <Button
            icon={RefreshCw}
            className="secondary"
            disabled={busy}
            onClick={() => setRevision((value) => value + 1)}
          >
            Recarregar lixeira
          </Button>
        </div>
      ) : null}
      {loading ? (
        <LoadingState>Carregando lixeira…</LoadingState>
      ) : !error && data?.items.length ? (
        <>
          <ul className="work-list">
            {data.items.map((item) => (
              <li key={item.id}>
                <div>
                  <h3>{item.label}</h3>
                  {item.workName ? (
                    <p>
                      Obra: {item.workName}
                      {item.folderName ? ` · Pasta: ${item.folderName}` : ''}
                    </p>
                  ) : null}
                  <p>Enviado em {new Date(item.deletedAt).toLocaleString('pt-BR')}</p>
                </div>
                <Button
                  icon={RotateCcw}
                  className="secondary"
                  disabled={busy}
                  onClick={() => restore(item)}
                >
                  Restaurar<span className="sr-only"> {item.label}</span>
                </Button>
              </li>
            ))}
          </ul>
          <nav className="pagination" aria-label="Páginas da lixeira">
            <Button
              icon={ArrowLeft}
              className="secondary"
              disabled={busy || page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Anterior
            </Button>
            <span>Página {page}</span>
            <Button
              icon={ArrowRight}
              className="secondary"
              disabled={busy || page * 20 >= data.total}
              onClick={() => setPage((value) => value + 1)}
            >
              Próxima
            </Button>
          </nav>
        </>
      ) : !error ? (
        <div className="empty">
          <h3>Nenhum registro nesta lixeira</h3>
          <p>Os registros enviados para a lixeira aparecerão aqui.</p>
          {page > 1 ? (
            <Button icon={ArrowLeft} className="secondary" onClick={() => setPage(1)}>
              Voltar à primeira página
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
