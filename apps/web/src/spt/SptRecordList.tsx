import { ArrowLeft, ArrowRight, Pencil } from 'lucide-react';
import { Button } from '../ui/Button';
import { LoadingState } from '../ui/LoadingState';
import { SptRecordSummary } from './SptRecordSummary';
import type { SptPage, SptRecord } from './record-types';

/** Saved metres of the borehole, paginated, with the correction action when writable. */
export function SptRecordList({
  data,
  loading,
  failed,
  page,
  locked,
  canWrite,
  onCorrect,
  onPageChange,
}: {
  data: SptPage | null;
  loading: boolean;
  failed: boolean;
  page: number;
  locked: boolean;
  canWrite: boolean;
  onCorrect: (record: SptRecord) => void;
  onPageChange: (step: number) => void;
}) {
  if (loading) return <LoadingState>Carregando ensaios…</LoadingState>;
  if (data?.items.length)
    return (
      <>
        <ul className="work-list">
          {data.items.map((record) => (
            <li key={record.id}>
              <SptRecordSummary record={record} />
              {canWrite ? (
                <Button
                  icon={Pencil}
                  className="secondary"
                  disabled={locked}
                  onClick={() => onCorrect(record)}
                >
                  Corrigir registro
                  <span className="sr-only">
                    {' '}
                    a {Number(record.depthM).toLocaleString('pt-BR')} m
                  </span>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        <nav className="pagination" aria-label="Páginas de ensaios">
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
            disabled={locked || page * 20 >= data.total}
            onClick={() => onPageChange(1)}
          >
            Próxima
          </Button>
        </nav>
      </>
    );
  return failed ? null : (
    <div className="empty">
      <h3>Nenhum ensaio registrado</h3>
      <p>Os ensaios deste furo aparecerão aqui.</p>
    </div>
  );
}
