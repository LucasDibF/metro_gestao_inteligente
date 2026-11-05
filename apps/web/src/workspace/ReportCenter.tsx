import { useEffect, useState, type FormEvent } from 'react';
import { auth, longRequestSignal } from '../auth/client';
import { Button } from '../ui/Button';
import { LoadingState } from '../ui/LoadingState';
import { Search, Download, FolderOpen, ArrowLeft, ArrowRight } from 'lucide-react';
import type { WorkTarget } from './WorkDestination';
interface Entry {
  id: string;
  title: string;
  workId: string;
  workName: string;
  clientName: string | null;
  state: string;
  issueId: string | null;
  issueNumber: number | null;
}
const states: Record<string, string> = {
  UNISSUED: 'Não emitido',
  PENDING: 'Na fila',
  PROCESSING: 'Gerando PDF',
  READY: 'PDF disponível',
  FAILED: 'Geração não concluída',
};
export function ReportCenter({
  onOpen,
  onError,
  canDownload = true,
}: {
  canDownload?: boolean;
  onOpen: (target: WorkTarget) => void;
  onError: (e: unknown) => void;
}) {
  const [data, setData] = useState<{ items: Entry[]; total: number } | null>(null),
    [page, setPage] = useState(1),
    [query, setQuery] = useState(''),
    [state, setState] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setError('');
    setData(null);
    auth
      .request<{ items: Entry[]; total: number }>(
        `/workspace/relatorios?page=${page}&q=${encodeURIComponent(query)}&state=${state}`,
      )
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
  }, [page, query, state, onError]);
  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setQuery(String(new FormData(e.currentTarget).get('q')).trim());
    setPage(1);
  }
  async function download(entry: Entry) {
    setBusy(true);
    setError('');
    try {
      const blob = await auth.request<Blob>(
        `/obras/${entry.workId}/relatorios/${entry.id}/emissoes/${entry.issueId}/pdf`,
        { signal: longRequestSignal() },
        (r) => r.blob(),
      );
      const url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = `sondagem-emissao-${entry.issueNumber}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível baixar.');
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="report-center-title">
      <h2 id="report-center-title">Central de relatórios</h2>
      <p>Composições e emissões de todas as obras da empresa.</p>
      <form className="work-search" onSubmit={search}>
        <label htmlFor="report-search">Buscar por relatório, obra ou contratante</label>
        <div className="search-controls">
          <input id="report-search" name="q" maxLength={100} type="search" />
          <Button icon={Search} type="submit" className="secondary">
            Buscar
          </Button>
        </div>
        <label htmlFor="report-state">Situação da emissão mais recente</label>
        <select
          id="report-state"
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todas</option>
          {Object.entries(states).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </form>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {!data && !error ? (
        <LoadingState>Carregando relatórios…</LoadingState>
      ) : data ? (
        <>
          <p className="help">{data.total} relatório(s) encontrado(s).</p>
          {!data.items.length ? (
            <div className="empty">
              <h3>Nenhum relatório encontrado</h3>
              <p>Ajuste os filtros ou monte uma composição dentro da obra.</p>
            </div>
          ) : (
            <ul className="work-list">
              {data.items.map((entry) => (
                <li key={entry.id}>
                  <div>
                    <h3>{entry.title}</h3>
                    <p>
                      {entry.workName}
                      {entry.clientName ? ` · ${entry.clientName}` : ''}
                    </p>
                    <p>
                      {states[entry.state]}
                      {entry.issueNumber ? ` · Emissão ${entry.issueNumber}` : ''}
                    </p>
                  </div>
                  <div className="row-actions">
                    <Button
                      icon={FolderOpen}
                      className="secondary"
                      onClick={() => onOpen({ workId: entry.workId, reportId: entry.id })}
                    >
                      Abrir relatórios da obra<span className="sr-only"> {entry.workName}</span>
                    </Button>
                    {entry.state === 'READY' && entry.issueId ? (
                      <Button
                        icon={Download}
                        disabled={busy || !canDownload}
                        className="secondary"
                        onClick={() => void download(entry)}
                      >
                        Baixar PDF<span className="sr-only"> {entry.title}</span>
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <nav className="pagination" aria-label="Páginas da central de relatórios">
            <Button
              icon={ArrowLeft}
              className="secondary"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <span>Página {page}</span>
            <Button
              icon={ArrowRight}
              className="secondary"
              disabled={page * 20 >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </nav>
        </>
      ) : null}
    </section>
  );
}
