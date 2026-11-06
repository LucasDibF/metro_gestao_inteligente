import { Download, Pencil } from 'lucide-react';
import { Button } from '../ui/Button';
import type { Report } from './report-types';

/** The work's report compositions with their download, history and edit actions. */
export function ReportList({
  reports,
  locked,
  canWrite,
  canDownload,
  onDownloadCurrent,
  onOpen,
  onEdit,
}: {
  reports: Report[];
  locked: boolean;
  canWrite: boolean;
  canDownload: boolean;
  onDownloadCurrent: (report: Report) => void;
  onOpen: (report: Report) => void;
  onEdit: (report: Report) => void;
}) {
  return (
    <ul className="work-list">
      {reports.map((r) => (
        <li key={r.id}>
          <div>
            <h3>{r.title}</h3>
            <p>
              Composição {r.version} · {r.composition.holeIds.length}{' '}
              {r.composition.holeIds.length === 1 ? 'furo' : 'furos'}
            </p>
          </div>
          <div className="row-actions">
            {r.currentIssueId ? (
              <Button
                icon={Download}
                className="secondary"
                disabled={locked || !canDownload}
                onClick={() => onDownloadCurrent(r)}
              >
                Baixar PDF<span className="sr-only"> {r.title}</span>
              </Button>
            ) : null}
            <Button className="secondary" disabled={locked} onClick={() => onOpen(r)}>
              Ver emissões<span className="sr-only"> {r.title}</span>
            </Button>
            {canWrite ? (
              <Button
                icon={Pencil}
                className="secondary"
                disabled={locked}
                onClick={() => onEdit(r)}
              >
                Editar composição<span className="sr-only"> {r.title}</span>
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
