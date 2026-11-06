import { ArrowLeft, ArrowRight, ClipboardList } from 'lucide-react';
import { Button } from '../ui/Button';
import { TrashAction } from './TrashAction';
import type { Borehole, Folder, Page } from './hierarchy-types';

/** Boreholes of the open folder (or without folder), paginated, with open and trash actions. */
export function HoleList({
  holes,
  folders,
  base,
  page,
  busy,
  locked,
  canWrite,
  canDelete,
  onOpen,
  onRemoved,
  onPageChange,
  onError,
}: {
  holes: Page<Borehole>;
  folders: Folder[];
  base: string;
  page: number;
  busy: boolean;
  locked: boolean;
  canWrite: boolean;
  canDelete: boolean;
  onOpen: (hole: Borehole) => void;
  onRemoved: () => void;
  onPageChange: (step: number) => void;
  onError: (error: unknown) => void;
}) {
  return (
    <>
      <ul className="work-list">
        {holes.items.map((hole) => (
          <li key={hole.id}>
            <div>
              <h4>{hole.code}</h4>
              <p>
                {hole.folderId
                  ? (folders.find((folder) => folder.id === hole.folderId)?.name ??
                    'Pasta vinculada')
                  : 'Sem pasta'}{' '}
                ·{' '}
                {hole.plannedDepthM
                  ? `${Number(hole.plannedDepthM).toLocaleString('pt-BR')} m planejados`
                  : 'Profundidade não informada'}
              </p>
            </div>
            <div className="row-actions">
              <Button
                icon={ClipboardList}
                className="secondary"
                disabled={busy}
                onClick={() => onOpen(hole)}
              >
                Abrir furo<span className="sr-only"> {hole.code}</span>
              </Button>
              {canDelete ? (
                <TrashAction
                  actionLabel="Apagar furo"
                  path={`${base}/furos/${hole.id}`}
                  version={hole.version}
                  label={hole.code}
                  onError={onError}
                  onDone={onRemoved}
                />
              ) : canWrite ? (
                <div>
                  <Button
                    className="secondary"
                    disabled
                    aria-describedby={`delete-help-${hole.id}`}
                  >
                    Apagar furo
                  </Button>
                  <p className="help" id={`delete-help-${hole.id}`}>
                    Disponível no perfil Administrador.
                  </p>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <nav className="pagination" aria-label="Páginas de furos">
        <Button
          icon={ArrowLeft}
          className="secondary"
          disabled={locked || page === 1}
          onClick={() => onPageChange(-1)}
        >
          Anterior
        </Button>
        <span>Página {page}</span>
        <Button
          icon={ArrowRight}
          className="secondary"
          disabled={locked || page * 20 >= holes.total}
          onClick={() => onPageChange(1)}
        >
          Próxima
        </Button>
      </nav>
    </>
  );
}
