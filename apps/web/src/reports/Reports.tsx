import { hasRole } from '../auth/permissions';
import { LoadingState } from '../ui/LoadingState';
import { Button } from '../ui/Button';
import { ArrowLeft, RefreshCw, Plus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Profile } from '../auth/client';
import { ReportEditor } from './ReportEditor';
import { ReportIssues } from './ReportIssues';
import { ReportList } from './ReportList';
import { useReports } from './use-reports';
export function Reports({
  work,
  profile,
  onBack,
  onError,
  onEditingChange,
}: {
  work: { id: string; name: string };
  profile: Profile;
  onBack: () => void;
  onError: (e: unknown) => void;
  onEditingChange?: (editing: boolean) => void;
}) {
  const workspace = useReports(work.id, onError),
    { reports, editor, history, busy, error, message } = workspace;
  const alert = useRef<HTMLDivElement>(null),
    canWrite = hasRole(profile, 'ENGINEER'),
    canDownload = profile.canDownloadReports !== false;
  useEffect(() => {
    onEditingChange?.(Boolean(editor));
    return () => onEditingChange?.(false);
  }, [editor, onEditingChange]);
  useEffect(() => {
    if (error) {
      alert.current?.focus({ preventScroll: true });
      alert.current?.scrollIntoView({ block: 'center' });
    }
  }, [error]);
  const current = editor && editor !== 'new' ? editor : null;
  return (
    <section className="reports-screen" aria-labelledby="reports-title">
      <Button icon={ArrowLeft} className="secondary" disabled={busy} onClick={onBack}>
        Voltar à organização da obra
      </Button>
      <h2 id="reports-title">Relatórios · {work.name}</h2>
      <p>Selecione os furos, organize as fotografias e gere uma versão do relatório.</p>
      <p className="help">
        O modelo inicial de PDF está disponível para homologação. A emissão exige aprovação técnica
        atual e coordenada oficial de cada furo.
      </p>
      {hasRole(profile, 'ADMIN') && !hasRole(profile, 'ENGINEER') ? (
        <div className="notice">
          <p>
            A geração de PDFs é feita pelo perfil Engenheiro. O administrador gerencia os acessos; a
            composição técnica e a emissão pertencem ao engenheiro.
          </p>
          {profile.localTesting ? (
            <p>
              Para testar a geração, escolha <strong>Engenheiro</strong> no campo{' '}
              <strong>Perfil de teste</strong>, na barra superior.
            </p>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <div className="error" role="alert" ref={alert} tabIndex={-1}>
          <p>{error}</p>
          <Button icon={RefreshCw} className="secondary" disabled={busy} onClick={workspace.reload}>
            Recarregar relatórios
          </Button>
        </div>
      ) : null}
      {message ? (
        <p className="notice" role="status">
          {message}
        </p>
      ) : null}
      {canWrite && !editor ? (
        <Button icon={Plus} disabled={busy} onClick={workspace.startNew}>
          Criar relatório
        </Button>
      ) : null}
      {editor ? (
        <ReportEditor
          key={current?.id ?? 'new'}
          current={current}
          options={workspace.options}
          total={workspace.total}
          busy={busy}
          onLoadMore={() => void workspace.loadMoreOptions()}
          onSave={(input) => void workspace.save(input)}
          onCancel={workspace.cancelEdit}
        />
      ) : null}
      {!reports ? (
        error ? null : (
          <LoadingState>Carregando relatórios…</LoadingState>
        )
      ) : reports.length ? (
        <ReportList
          reports={reports}
          locked={busy || !!editor}
          canWrite={canWrite}
          canDownload={canDownload}
          onDownloadCurrent={(report) => void workspace.downloadCurrent(report)}
          onOpen={(report) => void workspace.open(report)}
          onEdit={(report) => void workspace.open(report, true)}
        />
      ) : (
        <p>Nenhum relatório criado nesta obra.</p>
      )}
      {history && !editor ? (
        <ReportIssues
          history={history}
          base={workspace.base}
          busy={busy}
          canWrite={canWrite}
          canIssue={hasRole(profile, 'ENGINEER')}
          canDownload={canDownload}
          onRefresh={() => void workspace.open(history.report)}
          onIssue={() => void workspace.issue(history.report)}
          onDownload={(issue) => void workspace.download(issue)}
          onError={onError}
        />
      ) : null}
    </section>
  );
}
