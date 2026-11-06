import { RefreshCw, Download, FileText } from 'lucide-react';
import { Button } from '../ui/Button';
import { MapPreview } from './MapPreview';
import { issueStateLabels, type History, type Issue } from './report-types';

/** Issue history of one report, with the map preview and the generate action. */
export function ReportIssues({
  history,
  base,
  busy,
  canWrite,
  canIssue,
  canDownload,
  onRefresh,
  onIssue,
  onDownload,
  onError,
}: {
  history: History;
  base: string;
  busy: boolean;
  canWrite: boolean;
  canIssue: boolean;
  canDownload: boolean;
  onRefresh: () => void;
  onIssue: () => void;
  onDownload: (issue: Issue) => void;
  onError: (e: unknown) => void;
}) {
  return (
    <section className="panel" aria-labelledby="issues-title">
      <div className="section-heading">
        <h3 id="issues-title">Emissões · {history.report.title}</h3>
        <Button icon={RefreshCw} className="secondary" disabled={busy} onClick={onRefresh}>
          Atualizar emissões
        </Button>
      </div>
      <MapPreview
        key={history.report.id + '-' + history.report.version}
        base={base + '/' + history.report.id}
        canWrite={canWrite}
        reportVersion={history.report.version}
        onError={onError}
        onSaved={onRefresh}
      />
      {canIssue ? (
        <Button icon={FileText} className="generate-report" loading={busy} onClick={onIssue}>
          Gerar PDF de homologação
        </Button>
      ) : null}
      {!history.issues.length ? (
        <p>Nenhuma emissão solicitada.</p>
      ) : (
        <ul className="work-list">
          {history.issues.map((i) => (
            <li key={i.id}>
              <div>
                <h3>
                  Emissão {i.issueNumber} · {issueStateLabels[i.state]}
                </h3>
                <p>
                  Composição {i.compositionVersion}
                  {history.report.currentIssueId === i.id
                    ? ' · Vigente'
                    : i.state === 'READY'
                      ? ' · Histórica'
                      : ''}
                </p>
                {i.pdfSha256 ? (
                  <details>
                    <summary>Ver integridade do arquivo</summary>
                    <p className="hash-value">SHA-256: {i.pdfSha256}</p>
                  </details>
                ) : null}
                {i.state === 'FAILED' ? (
                  <p>
                    Confira os dados e o serviço de geração antes de solicitar uma nova emissão.
                  </p>
                ) : null}
              </div>
              {i.state === 'READY' ? (
                <Button
                  icon={Download}
                  className="secondary"
                  disabled={busy || !canDownload}
                  onClick={() => onDownload(i)}
                >
                  Baixar PDF<span className="sr-only"> emissão {i.issueNumber}</span>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
