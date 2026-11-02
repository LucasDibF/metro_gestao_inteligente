import { hasRole } from '../auth/permissions';
import { LoadingState } from '../ui/LoadingState';
import { Button } from '../ui/Button';
import { Plus, Save, RefreshCw, X, Search, Pencil, ArrowLeft, ArrowRight } from 'lucide-react';
import { TrashAction } from './TrashAction';
import { WorkHierarchy } from './WorkHierarchy';
import { useEffect, useState, type FormEvent } from 'react';
import { auth, type Profile } from '../auth/client';

interface Work {
  id: string;
  name: string;
  clientName: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  version: number;
  holeCount?: number;
  approvedHoleCount?: number;
  status?: string;
}
interface WorkList {
  items: Work[];
  total: number;
  page: number;
  pageSize: number;
}
const workStates: Record<string, string> = {
  NOT_STARTED: 'Sem furos',
  IN_FIELD: 'Em preparação / campo',
  IN_REVIEW: 'Aguardando revisão',
  APPROVED: 'Furos aprovados',
};
const states =
  'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

export function Works({
  profile,
  onError,
}: {
  profile: Profile;
  onError: (error: unknown) => void;
}) {
  const [opened, setOpened] = useState<Work | null>(null);
  const [data, setData] = useState<WorkList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [summary, setSummary] = useState<{ total: number; counts: Record<string, number> } | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<Work | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const canWrite = hasRole(profile, 'ENGINEER', 'COMMERCIAL');
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
      .request<{ total: number; counts: Record<string, number> }>('/workspace/resumo')
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
  const current = editing && editing !== 'new' ? editing : null;
  if (opened)
    return (
      <WorkHierarchy
        work={opened}
        profile={profile}
        onBack={() => {
          setOpened(null);
          setRevision((v) => v + 1);
        }}
        onError={onError}
      />
    );
  return (
    <section aria-labelledby="works-title" className="works">
      <div className="section-heading">
        <div>
          <h2 id="works-title">Obras</h2>
          <p>Cadastros da sua empresa.</p>
        </div>
        {canWrite && !editing ? (
          <Button icon={Plus} onClick={() => choose('new')}>
            Cadastrar obra
          </Button>
        ) : null}
      </div>
      {message ? (
        <p role="status" className="notice">
          {message}
        </p>
      ) : null}
      {editing ? (
        <section className="panel work-editor" aria-labelledby="editor-title">
          <h3 id="editor-title">
            {editing === 'new' ? 'Cadastrar obra' : canWrite ? 'Editar obra' : 'Dados da obra'}
          </h3>
          <form
            key={current ? `${current.id}-${current.version}` : 'new'}
            onSubmit={save}
            aria-busy={saving}
          >
            <fieldset disabled={saving || !canWrite}>
              <label htmlFor="work-name">Nome da obra</label>
              <input
                id="work-name"
                name="name"
                required
                maxLength={200}
                defaultValue={current?.name ?? ''}
              />
              {editing === 'new' ? (
                <fieldset className="spt-advance">
                  <legend>Furos iniciais</legend>
                  <label htmlFor="work-hole-count">Quantidade de furos</label>
                  <input
                    id="work-hole-count"
                    name="initialBoreholeCount"
                    type="number"
                    min="0"
                    max="200"
                    step="1"
                    defaultValue="0"
                    required
                  />
                  <label htmlFor="work-initial-folder">Pasta dos furos (opcional)</label>
                  <input id="work-initial-folder" name="initialFolderName" maxLength={120} />
                  <p className="help">
                    Numeração automática: SP-01, SP-02 e assim por diante. Sem uma pasta, os furos
                    ficam diretamente na obra. Para criar a obra sem furos, informe zero.
                  </p>
                </fieldset>
              ) : null}
              <label htmlFor="work-client">
                Contratante <span className="optional">(opcional)</span>
              </label>
              <input
                id="work-client"
                name="clientName"
                maxLength={200}
                defaultValue={current?.clientName ?? ''}
              />
              <div className="field-pair">
                <div>
                  <label htmlFor="work-city">
                    Município <span className="optional">(opcional)</span>
                  </label>
                  <input
                    id="work-city"
                    name="city"
                    maxLength={120}
                    defaultValue={current?.city ?? ''}
                  />
                </div>
                <div>
                  <label htmlFor="work-state">
                    UF <span className="optional">(opcional)</span>
                  </label>
                  <select id="work-state" name="state" defaultValue={current?.state ?? ''}>
                    <option value="">Selecione</option>
                    {states.map((state) => (
                      <option key={state}>{state}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label htmlFor="work-address">
                Endereço <span className="optional">(opcional)</span>
              </label>
              <input
                id="work-address"
                name="address"
                maxLength={500}
                defaultValue={current?.address ?? ''}
              />
              {canWrite ? (
                <Button icon={Save} loading={saving} type="submit">
                  {saving ? 'Salvando…' : 'Salvar obra'}
                </Button>
              ) : null}
            </fieldset>
          </form>
          {saveError ? (
            <div role="alert" className="error">
              <p>{saveError}</p>
              {current ? (
                <Button
                  icon={RefreshCw}
                  type="button"
                  className="secondary"
                  disabled={saving}
                  onClick={reloadWork}
                >
                  Recarregar dados da obra
                </Button>
              ) : null}
            </div>
          ) : null}
          <Button
            icon={X}
            className="secondary"
            disabled={saving}
            onClick={() => {
              setEditing(null);
              setSaveError('');
            }}
          >
            Fechar formulário
          </Button>
        </section>
      ) : null}
      {summary ? (
        <dl className="work-summary" aria-label="Andamento das obras">
          <div>
            <dt>Obras</dt>
            <dd>{summary.total}</dd>
          </div>
          {Object.entries(workStates).map(([key, label]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{summary.counts[key] ?? 0}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <form
        className="work-search"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(String(new FormData(event.currentTarget).get('q')).trim());
          setPage(1);
        }}
      >
        <label htmlFor="work-status">Situação da obra</label>
        <select
          id="work-status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todas</option>
          {Object.entries(workStates).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <label htmlFor="work-query">Buscar por obra ou contratante</label>
        <div className="search-controls">
          <input id="work-query" name="q" maxLength={100} type="search" />
          <Button icon={Search} className="secondary" type="submit">
            Buscar
          </Button>
        </div>
      </form>
      {loading ? (
        <LoadingState>Carregando obras…</LoadingState>
      ) : error ? (
        <div role="alert" className="error">
          <p>{error}</p>
          <Button
            icon={RefreshCw}
            className="secondary"
            onClick={() => setRevision((value) => value + 1)}
          >
            Tentar novamente
          </Button>
        </div>
      ) : data?.items.length ? (
        <>
          <p className="help">
            {data.total} {data.total === 1 ? 'obra encontrada' : 'obras encontradas'}
          </p>
          <ul className="work-list">
            {data.items.map((work) => (
              <li key={work.id}>
                <div>
                  <h3>
                    <Button className="work-link" onClick={() => setOpened(work)}>
                      {work.name}
                    </Button>
                  </h3>
                  <p>
                    {workStates[work.status ?? 'NOT_STARTED']} · {work.holeCount ?? 0} furo(s) ·{' '}
                    {work.approvedHoleCount ?? 0} aprovado(s)
                  </p>
                  <p>
                    {[work.clientName, [work.city, work.state].filter(Boolean).join(' / ')]
                      .filter(Boolean)
                      .join(' · ') || 'Sem informações complementares'}
                  </p>
                </div>
                <div className="row-actions">
                  <Button icon={Pencil} className="secondary" onClick={() => choose(work)}>
                    {canWrite ? 'Editar' : 'Ver dados'}
                    <span className="sr-only"> {work.name}</span>
                  </Button>
                  {hasRole(profile, 'ADMIN') ? (
                    <TrashAction
                      path={`/obras/${work.id}`}
                      version={work.version}
                      label={work.name}
                      onError={onError}
                      onDone={() => {
                        setEditing(null);
                        setPage(1);
                        setRevision((value) => value + 1);
                        setMessage('Obra enviada para a lixeira.');
                      }}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <nav className="pagination" aria-label="Páginas de obras">
            <Button
              icon={ArrowLeft}
              className="secondary"
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Anterior
            </Button>
            <span>Página {page}</span>
            <Button
              icon={ArrowRight}
              className="secondary"
              disabled={page * 20 >= data.total}
              onClick={() => setPage((value) => value + 1)}
            >
              Próxima
            </Button>
          </nav>
        </>
      ) : (
        <div className="empty">
          <h3>{query || status ? 'Nenhuma obra encontrada' : 'Sua primeira obra começa aqui'}</h3>
          <p>
            {query || status
              ? 'Ajuste a situação selecionada ou tente outro nome de obra ou contratante.'
              : canWrite
                ? 'Cadastre uma obra para começar a organizar os trabalhos da sua empresa.'
                : 'As obras cadastradas pela sua empresa aparecerão aqui.'}
          </p>
        </div>
      )}
    </section>
  );
}
