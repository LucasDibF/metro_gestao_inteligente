import { hasRole } from '../auth/permissions';
import { LoadingState } from '../ui/LoadingState';
import { Button } from '../ui/Button';
import { Plus, RefreshCw, Search } from 'lucide-react';
import { WorkHierarchy } from './WorkHierarchy';
import { useEffect, useState } from 'react';
import type { Profile } from '../auth/client';
import type { ProfileReturnTarget } from '../workspace/WorkDestination';
import { WorkEditor } from './WorkEditor';
import { WorkListView } from './WorkListView';
import { useWorks } from './use-works';
import { workStates, type Work } from './work-types';

export function Works({
  profile,
  onError,
  onEditingChange,
  onOpenProfessionalProfile,
}: {
  profile: Profile;
  onError: (error: unknown) => void;
  onEditingChange?: (editing: boolean) => void;
  onOpenProfessionalProfile?: (back: ProfileReturnTarget) => void;
}) {
  const [opened, setOpened] = useState<Work | null>(null);
  const works = useWorks(onError),
    { data, loading, error, message, query, status, summary, page, editing } = works;
  const canWrite = hasRole(profile, 'ENGINEER', 'COMMERCIAL');
  useEffect(() => {
    if (opened) return; // WorkHierarchy reports its own editing state while it is open.
    onEditingChange?.(canWrite && Boolean(editing));
    return () => onEditingChange?.(false);
  }, [opened, canWrite, editing, onEditingChange]);
  if (opened)
    return (
      <WorkHierarchy
        work={opened}
        profile={profile}
        onBack={() => {
          setOpened(null);
          works.refresh();
        }}
        onError={onError}
        onEditingChange={onEditingChange}
        onOpenProfessionalProfile={onOpenProfessionalProfile}
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
          <Button icon={Plus} onClick={() => works.choose('new')}>
            Cadastrar obra
          </Button>
        ) : null}
      </div>
      {message ? (
        <p role="status" className="notice">
          {message}
        </p>
      ) : null}
      {editing ? <WorkEditor works={works} editing={editing} canWrite={canWrite} /> : null}
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
          works.setQuery(String(new FormData(event.currentTarget).get('q')).trim());
          works.setPage(1);
        }}
      >
        <label htmlFor="work-status">Situação da obra</label>
        <select
          id="work-status"
          value={status}
          onChange={(e) => {
            works.setStatus(e.target.value);
            works.setPage(1);
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
          <Button icon={RefreshCw} className="secondary" onClick={works.refresh}>
            Tentar novamente
          </Button>
        </div>
      ) : data?.items.length ? (
        <WorkListView
          data={data}
          works={works}
          canWrite={canWrite}
          canDelete={hasRole(profile, 'ADMIN')}
          onOpen={setOpened}
          onError={onError}
        />
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
