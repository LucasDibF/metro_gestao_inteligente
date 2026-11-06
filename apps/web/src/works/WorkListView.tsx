import { ArrowLeft, ArrowRight, Pencil } from 'lucide-react';
import { Button } from '../ui/Button';
import { TrashAction } from './TrashAction';
import { workLocationLine, workStates, type Work, type WorkList } from './work-types';
import type { WorksState } from './use-works';

/** Page of works with progress, open, edit and trash actions. */
export function WorkListView({
  data,
  works,
  canWrite,
  canDelete,
  onOpen,
  onError,
}: {
  data: WorkList;
  works: WorksState;
  canWrite: boolean;
  canDelete: boolean;
  onOpen: (work: Work) => void;
  onError: (error: unknown) => void;
}) {
  const { page } = works;
  return (
    <>
      <p className="help">
        {data.total} {data.total === 1 ? 'obra encontrada' : 'obras encontradas'}
      </p>
      <ul className="work-list">
        {data.items.map((work) => (
          <li key={work.id}>
            <div>
              <h3>
                <Button className="work-link" onClick={() => onOpen(work)}>
                  {work.name}
                </Button>
              </h3>
              <p>
                {workStates[work.status ?? 'NOT_STARTED']} · {work.holeCount ?? 0} furo(s) ·{' '}
                {work.approvedHoleCount ?? 0} aprovado(s)
              </p>
              <p>{workLocationLine(work)}</p>
            </div>
            <div className="row-actions">
              <Button icon={Pencil} className="secondary" onClick={() => works.choose(work)}>
                {canWrite ? 'Editar' : 'Ver dados'}
                <span className="sr-only"> {work.name}</span>
              </Button>
              {canDelete ? (
                <TrashAction
                  path={`/obras/${work.id}`}
                  version={work.version}
                  label={work.name}
                  onError={onError}
                  onDone={() => {
                    works.setEditing(null);
                    works.setPage(1);
                    works.refresh();
                    works.setMessage('Obra enviada para a lixeira.');
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
          onClick={() => works.setPage((value) => value - 1)}
        >
          Anterior
        </Button>
        <span>Página {page}</span>
        <Button
          icon={ArrowRight}
          className="secondary"
          disabled={page * 20 >= data.total}
          onClick={() => works.setPage((value) => value + 1)}
        >
          Próxima
        </Button>
      </nav>
    </>
  );
}
