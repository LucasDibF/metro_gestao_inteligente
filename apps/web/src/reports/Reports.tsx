import { hasRole } from '../auth/permissions';
import { LoadingState } from '../ui/LoadingState';
import { Button } from '../ui/Button';
import {
  ArrowLeft,
  RefreshCw,
  Plus,
  ArrowUp,
  ArrowDown,
  X,
  Save,
  Download,
  Pencil,
  FileText,
} from 'lucide-react';
import { MapPreview } from './MapPreview';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { auth, type Profile } from '../auth/client';
import { downloadIssuePdf } from './pdf-download';
interface Hole {
  id: string;
  code: string;
  photos: Array<{ id: string; caption: string }>;
}
interface Report {
  id: string;
  title: string;
  notes: string;
  version: number;
  currentIssueId: string | null;
  composition: { holeIds: string[]; photoIds: string[]; showOtherBoreholes: boolean };
}
interface Issue {
  id: string;
  state: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  issueNumber: number;
  compositionVersion: number;
  pdfSha256: string | null;
  errorCode: string | null;
}
interface History {
  report: Report;
  issues: Issue[];
  selection: Hole[];
}
const states = {
  PENDING: 'Na fila',
  PROCESSING: 'Gerando PDF',
  READY: 'PDF disponível',
  FAILED: 'Geração não concluída',
};
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
  const [reports, setReports] = useState<Report[] | null>(null),
    [options, setOptions] = useState<Hole[]>([]),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [editor, setEditor] = useState<Report | 'new' | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [photos, setPhotos] = useState<string[]>([]),
    [history, setHistory] = useState<History | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [revision, setRevision] = useState(0);
  const alert = useRef<HTMLDivElement>(null),
    issueKey = useRef<{ reportId: string; version: number; key: string } | null>(null),
    base = `/obras/${work.id}/relatorios`,
    canWrite = hasRole(profile, 'ENGINEER');
  useEffect(() => {
    onEditingChange?.(Boolean(editor));
    return () => onEditingChange?.(false);
  }, [editor, onEditingChange]);
  useEffect(() => {
    let active = true;
    Promise.all([
      auth.request<Report[]>(base),
      auth.request<{ items: Hole[]; total: number }>(base + '/opcoes'),
    ])
      .then(([list, choices]) => {
        if (active) {
          setReports(list);
          setOptions(choices.items);
          setTotal(choices.total);
          setPage(1);
        }
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
  }, [base, revision, onError]);
  useEffect(() => {
    if (error) {
      alert.current?.focus({ preventScroll: true });
      alert.current?.scrollIntoView({ block: 'center' });
    }
  }, [error]);
  const activeReportId = history?.report.id;
  const hasPending =
    history?.issues.some((issue) => issue.state === 'PENDING' || issue.state === 'PROCESSING') ??
    false;
  useEffect(() => {
    if (!activeReportId || !hasPending || editor) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const value = await auth.request<History>(base + '/' + activeReportId + '/emissoes');
        if (active) {
          applyHistory(value);
          if (
            value.issues.some((issue) => issue.state === 'PENDING' || issue.state === 'PROCESSING')
          )
            timer = setTimeout(poll, 2000);
        }
      } catch (e) {
        if (active) failed(e);
      }
    }
    timer = setTimeout(poll, 1500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [base, activeReportId, hasPending, Boolean(editor), onError]);
  function applyHistory(value: History) {
    setHistory(value);
    setReports(
      (current) =>
        current?.map((report) => (report.id === value.report.id ? value.report : report)) ?? null,
    );
  }
  function failed(e: unknown) {
    setError(e instanceof Error ? e.message : 'Não foi possível concluir.');
    onError(e);
  }
  function merge(items: Hole[]) {
    setOptions((current) => [
      ...current,
      ...items.filter((v) => !current.some((c) => c.id === v.id)),
    ]);
  }
  async function more() {
    setBusy(true);
    try {
      const next = await auth.request<{ items: Hole[]; page: number; total: number }>(
        base + '/opcoes?page=' + (page + 1),
      );
      merge(next.items);
      setPage(next.page);
      setTotal(next.total);
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  }
  async function open(report: Report, editing = false) {
    setBusy(true);
    setError('');
    try {
      const value = await auth.request<History>(base + '/' + report.id + '/emissoes');
      applyHistory(value);
      merge(value.selection);
      if (editing) {
        setEditor(value.report);
        setSelected(value.report.composition.holeIds);
        setPhotos(value.report.composition.photoIds);
      }
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const saved = await auth.request<Report>(base + (editor === 'new' ? '' : '/' + editor.id), {
        method: editor === 'new' ? 'POST' : 'PUT',
        body: JSON.stringify({
          title: String(values.get('title')),
          notes: String(values.get('notes')),
          holeIds: selected,
          photoIds: photos,
          showOtherBoreholes: values.get('others') === 'on',
          ...(editor === 'new' ? {} : { version: editor.version }),
        }),
      });
      setEditor(null);
      setRevision((v) => v + 1);
      await open(saved);
      setMessage('Composição salva. Confira o croqui e as opções de PDF abaixo.');
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  }
  async function issue(report: Report) {
    setBusy(true);
    setError('');
    if (
      !issueKey.current ||
      issueKey.current.reportId !== report.id ||
      issueKey.current.version !== report.version
    )
      issueKey.current = { reportId: report.id, version: report.version, key: crypto.randomUUID() };
    try {
      await auth.request(base + '/' + report.id + '/emissoes', {
        method: 'POST',
        body: JSON.stringify({ version: report.version, idempotencyKey: issueKey.current.key }),
      });
      issueKey.current = null;
      await open(report);
      setMessage('Geração solicitada. O PDF aparecerá abaixo assim que estiver pronto.');
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  }
  async function download(issue: Issue, reportId = history?.report.id) {
    if (!reportId) return;
    setBusy(true);
    setError('');
    try {
      await downloadIssuePdf({
        workId: work.id,
        reportId,
        issueId: issue.id,
        issueNumber: issue.issueNumber,
      });
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  }
  async function downloadCurrent(report: Report) {
    setBusy(true);
    setError('');
    try {
      const value = await auth.request<History>(base + '/' + report.id + '/emissoes');
      applyHistory(value);
      const latest = value.issues.find(
        (issue) => issue.id === value.report.currentIssueId && issue.state === 'READY',
      );
      if (!latest) throw new Error('Não há PDF vigente disponível. Confira as emissões abaixo.');
      await download(latest, report.id);
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  }
  function removeHole(id: string) {
    const photoIds = new Set(options.find((h) => h.id === id)?.photos.map((p) => p.id) ?? []);
    setSelected((current) => current.filter((value) => value !== id));
    setPhotos((current) => current.filter((value) => !photoIds.has(value)));
  }
  function move(ids: string[], set: (value: string[]) => void, index: number, direction: number) {
    const next = [...ids];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    set(next);
  }
  const current = editor && editor !== 'new' ? editor : null,
    availablePhotos = options
      .filter((h) => selected.includes(h.id))
      .flatMap((h) => h.photos.map((p) => ({ ...p, code: h.code })));
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
          <Button
            icon={RefreshCw}
            className="secondary"
            disabled={busy}
            onClick={() => {
              setError('');
              setEditor(null);
              setHistory(null);
              setRevision((v) => v + 1);
            }}
          >
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
        <Button
          icon={Plus}
          disabled={busy}
          onClick={() => {
            setEditor('new');
            setSelected([]);
            setPhotos([]);
            setError('');
            setMessage('');
          }}
        >
          Criar relatório
        </Button>
      ) : null}
      {editor ? (
        <form className="panel" onSubmit={save} key={current?.id ?? 'new'}>
          <fieldset disabled={busy}>
            <legend>{current ? 'Editar composição' : 'Novo relatório'}</legend>
            <label htmlFor="report-title">Título do relatório</label>
            <input
              id="report-title"
              name="title"
              required
              maxLength={200}
              defaultValue={current?.title ?? 'Relatório de sondagem SPT'}
            />
            <label htmlFor="report-notes">Observações do relatório (opcional)</label>
            <textarea
              id="report-notes"
              name="notes"
              rows={3}
              maxLength={4000}
              defaultValue={current?.notes ?? ''}
            />
            <h3>Furos da obra</h3>
            <p className="help">
              Selecione até 20 furos. A ordem selecionada será usada no relatório.
            </p>
            {options.map((h) => (
              <label className="checkbox-label" key={h.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(h.id)}
                  onChange={(e) => {
                    if (e.target.checked) setSelected((v) => [...v, h.id]);
                    else removeHole(h.id);
                  }}
                />
                {h.code}
              </label>
            ))}
            {options.length < total ? (
              <Button type="button" className="secondary" onClick={() => void more()}>
                Carregar mais furos para seleção
              </Button>
            ) : null}
            {selected.length ? (
              <ol className="selection-order">
                {selected.map((id, i) => (
                  <li key={id}>
                    <span>{options.find((h) => h.id === id)?.code ?? 'Furo indisponível'}</span>
                    <div className="row-actions">
                      <Button
                        icon={ArrowUp}
                        type="button"
                        className="secondary"
                        disabled={i === 0}
                        onClick={() => move(selected, setSelected, i, -1)}
                      >
                        Subir
                        <span className="sr-only">
                          {' '}
                          furo {options.find((h) => h.id === id)?.code}
                        </span>
                      </Button>
                      <Button
                        icon={ArrowDown}
                        type="button"
                        className="secondary"
                        disabled={i === selected.length - 1}
                        onClick={() => move(selected, setSelected, i, 1)}
                      >
                        Descer
                        <span className="sr-only">
                          {' '}
                          furo {options.find((h) => h.id === id)?.code}
                        </span>
                      </Button>
                      <Button
                        icon={X}
                        type="button"
                        className="secondary"
                        onClick={() => removeHole(id)}
                      >
                        Retirar
                        <span className="sr-only">
                          {' '}
                          furo {options.find((h) => h.id === id)?.code}
                        </span>
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}
            <h3>Fotografias</h3>
            <p className="help">Selecione até 40 fotografias dos furos incluídos.</p>
            {availablePhotos.length ? (
              availablePhotos.map((p) => (
                <label key={p.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={photos.includes(p.id)}
                    onChange={(e) =>
                      setPhotos((v) =>
                        e.target.checked ? [...v, p.id] : v.filter((id) => id !== p.id),
                      )
                    }
                  />
                  {p.code} · {p.caption}
                </label>
              ))
            ) : (
              <p>Nenhuma fotografia disponível nos furos selecionados.</p>
            )}
            {photos.length ? (
              <ol className="selection-order">
                {photos.map((id, i) => (
                  <li key={id}>
                    <span>
                      {availablePhotos.find((p) => p.id === id)?.caption ??
                        'Fotografia indisponível'}
                    </span>
                    <div className="row-actions">
                      <Button
                        icon={ArrowUp}
                        type="button"
                        className="secondary"
                        disabled={i === 0}
                        onClick={() => move(photos, setPhotos, i, -1)}
                      >
                        Subir<span className="sr-only"> fotografia {i + 1}</span>
                      </Button>
                      <Button
                        icon={ArrowDown}
                        type="button"
                        className="secondary"
                        disabled={i === photos.length - 1}
                        onClick={() => move(photos, setPhotos, i, 1)}
                      >
                        Descer<span className="sr-only"> fotografia {i + 1}</span>
                      </Button>
                      <Button
                        icon={X}
                        type="button"
                        className="secondary"
                        onClick={() => setPhotos((v) => v.filter((x) => x !== id))}
                      >
                        Retirar<span className="sr-only"> fotografia {i + 1}</span>
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}
            <label className="checkbox-label">
              <input
                name="others"
                type="checkbox"
                defaultChecked={current?.composition.showOtherBoreholes ?? false}
              />
              Mostrar outros furos da obra em cinza no croqui
            </label>
            <p className="help">
              Croqui técnico em fundo claro, calculado a partir das coordenadas oficiais. Sem
              mapa-base de terceiros.
            </p>
            <div className="form-actions">
              <Button
                icon={Save}
                disabled={!selected.length || selected.length > 20 || photos.length > 40}
              >
                Salvar composição
              </Button>
              <Button icon={X} className="secondary" type="button" onClick={() => setEditor(null)}>
                Cancelar
              </Button>
            </div>
          </fieldset>
        </form>
      ) : null}
      {!reports ? (
        error ? null : (
          <LoadingState>Carregando relatórios…</LoadingState>
        )
      ) : reports.length ? (
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
                    disabled={busy || !!editor || profile.canDownloadReports === false}
                    onClick={() => void downloadCurrent(r)}
                  >
                    Baixar PDF<span className="sr-only"> {r.title}</span>
                  </Button>
                ) : null}
                <Button
                  className="secondary"
                  disabled={busy || !!editor}
                  onClick={() => void open(r)}
                >
                  Ver emissões<span className="sr-only"> {r.title}</span>
                </Button>
                {canWrite ? (
                  <Button
                    icon={Pencil}
                    className="secondary"
                    disabled={busy || !!editor}
                    onClick={() => void open(r, true)}
                  >
                    Editar composição<span className="sr-only"> {r.title}</span>
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>Nenhum relatório criado nesta obra.</p>
      )}
      {history && !editor ? (
        <section className="panel" aria-labelledby="issues-title">
          <div className="section-heading">
            <h3 id="issues-title">Emissões · {history.report.title}</h3>
            <Button
              icon={RefreshCw}
              className="secondary"
              disabled={busy}
              onClick={() => void open(history.report)}
            >
              Atualizar emissões
            </Button>
          </div>
          <MapPreview
            key={history.report.id + '-' + history.report.version}
            base={base + '/' + history.report.id}
            canWrite={canWrite}
            reportVersion={history.report.version}
            onError={onError}
            onSaved={() => void open(history.report)}
          />
          {hasRole(profile, 'ENGINEER') ? (
            <Button
              icon={FileText}
              className="generate-report"
              loading={busy}
              onClick={() => void issue(history.report)}
            >
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
                      Emissão {i.issueNumber} · {states[i.state]}
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
                      disabled={busy || profile.canDownloadReports === false}
                      onClick={() => void download(i)}
                    >
                      Baixar PDF<span className="sr-only"> emissão {i.issueNumber}</span>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </section>
  );
}
