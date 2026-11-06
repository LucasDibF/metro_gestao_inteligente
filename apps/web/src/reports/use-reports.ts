import { useEffect, useRef, useState } from 'react';
import { auth } from '../auth/client';
import { downloadIssuePdf } from './pdf-download';
import {
  hasPendingIssue,
  type CompositionInput,
  type History,
  type Hole,
  type Issue,
  type Report,
} from './report-types';

export type ReportEditorTarget = Report | 'new' | null;

export interface ReportsWorkspace {
  base: string;
  reports: Report[] | null;
  options: Hole[];
  total: number;
  editor: ReportEditorTarget;
  history: History | null;
  busy: boolean;
  error: string;
  message: string;
  startNew: () => void;
  cancelEdit: () => void;
  reload: () => void;
  loadMoreOptions: () => Promise<void>;
  open: (report: Report, editing?: boolean) => Promise<void>;
  save: (input: CompositionInput) => Promise<void>;
  issue: (report: Report) => Promise<void>;
  download: (issue: Issue, reportId?: string) => Promise<void>;
  downloadCurrent: (report: Report) => Promise<void>;
}

/** Loads the work's reports, follows pending issues and runs every report action. */
export function useReports(workId: string, onError: (e: unknown) => void): ReportsWorkspace {
  const [reports, setReports] = useState<Report[] | null>(null),
    [options, setOptions] = useState<Hole[]>([]),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [editor, setEditor] = useState<ReportEditorTarget>(null),
    [history, setHistory] = useState<History | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [revision, setRevision] = useState(0);
  const issueKey = useRef<{ reportId: string; version: number; key: string } | null>(null),
    base = `/obras/${workId}/relatorios`;
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
  const activeReportId = history?.report.id;
  const hasPending = history ? hasPendingIssue(history.issues) : false;
  useEffect(() => {
    if (!activeReportId || !hasPending || editor) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const value = await auth.request<History>(base + '/' + activeReportId + '/emissoes');
        if (active) {
          applyHistory(value);
          if (hasPendingIssue(value.issues)) timer = setTimeout(poll, 2000);
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
  async function loadMoreOptions() {
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
      if (editing) setEditor(value.report);
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  }
  async function save(input: CompositionInput) {
    if (!editor) return;
    setBusy(true);
    setError('');
    try {
      const saved = await auth.request<Report>(base + (editor === 'new' ? '' : '/' + editor.id), {
        method: editor === 'new' ? 'POST' : 'PUT',
        body: JSON.stringify({
          ...input,
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
        workId,
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
  function startNew() {
    setEditor('new');
    setError('');
    setMessage('');
  }
  function cancelEdit() {
    setEditor(null);
  }
  function reload() {
    setError('');
    setEditor(null);
    setHistory(null);
    setRevision((v) => v + 1);
  }
  return {
    base,
    reports,
    options,
    total,
    editor,
    history,
    busy,
    error,
    message,
    startNew,
    cancelEdit,
    reload,
    loadMoreOptions,
    open,
    save,
    issue,
    download,
    downloadCurrent,
  };
}
