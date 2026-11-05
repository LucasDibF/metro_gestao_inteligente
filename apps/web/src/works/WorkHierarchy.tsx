import { FieldAssignment } from './FieldAssignment';
import { hasRole } from '../auth/permissions';
import { FolderTree } from './FolderTree';
import { Breadcrumb } from '../ui/Breadcrumb';
import { LoadingState } from '../ui/LoadingState';
import { Button } from '../ui/Button';
import {
  ArrowLeft,
  FileText,
  RefreshCw,
  Plus,
  Save,
  X,
  Pencil,
  ClipboardList,
  ArrowRight,
} from 'lucide-react';
import { Reports } from '../reports/Reports';
import { SptTests } from '../spt/SptTests';
import { TrashAction } from './TrashAction';
import { useEffect, useState, type FormEvent } from 'react';
import { auth, type Profile } from '../auth/client';
interface Folder {
  id: string;
  name: string;
  version: number;
}
interface Borehole {
  id: string;
  code: string;
  folderId: string | null;
  plannedDepthM: string | null;
  version: number;
}
interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export function WorkHierarchy({
  work,
  profile,
  onBack,
  onError,
  onEditingChange,
}: {
  work: { id: string; name: string };
  profile: Profile;
  onBack: () => void;
  onError: (error: unknown) => void;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [editingSpt, setEditingSpt] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [sptHole, setSptHole] = useState<Borehole | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderPage, setFolderPage] = useState(1);
  const [folderTotal, setFolderTotal] = useState(0);
  const [folderLoading, setFolderLoading] = useState(true);
  const [holes, setHoles] = useState<Page<Borehole> | null>(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [folderEdit, setFolderEdit] = useState<Folder | 'new' | null>(null);
  const [holeEdit, setHoleEdit] = useState<Borehole | 'new' | null>(null);
  const canWrite = hasRole(profile, 'ENGINEER');
  useEffect(() => {
    onEditingChange?.(editingSpt || Boolean(folderEdit) || Boolean(holeEdit));
    return () => onEditingChange?.(false);
  }, [editingSpt, folderEdit, holeEdit, onEditingChange]);
  const base = `/obras/${work.id}`;
  function failed(error: unknown) {
    setError(error instanceof Error ? error.message : 'Não foi possível concluir.');
    onError(error);
  }
  useEffect(() => {
    let active = true;
    setFolderLoading(true);
    Promise.all(
      Array.from({ length: folderPage }, (_, index) =>
        auth.request<Page<Folder>>(`${base}/pastas?page=${index + 1}`),
      ),
    )
      .then((pages) => {
        if (active) {
          setFolders(pages.flatMap((result) => result.items));
          setFolderTotal(pages[0].total);
        }
      })
      .catch((error) => {
        if (active) failed(error);
      })
      .finally(() => {
        if (active) setFolderLoading(false);
      });
    return () => {
      active = false;
    };
  }, [base, revision]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    auth
      .request<Page<Borehole>>(
        `${base}/furos?page=${page}&folderId=${selectedFolder?.id ?? 'root'}`,
      )
      .then((result) => {
        if (active) setHoles(result);
      })
      .catch((error) => {
        if (active) failed(error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [base, page, revision, selectedFolder?.id]);
  async function moreFolders() {
    setBusy(true);
    setError('');
    try {
      const result = await auth.request<Page<Folder>>(`${base}/pastas?page=${folderPage + 1}`);
      setFolders((current) => [
        ...current,
        ...result.items.filter((item) => !current.some((existing) => existing.id === item.id)),
      ]);
      setFolderPage(result.page);
      setFolderTotal(result.total);
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  async function saveFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const current = folderEdit;
    if (!current) return;
    const name = String(new FormData(event.currentTarget).get('name')).trim();
    setBusy(true);
    setError('');
    try {
      const saved = await auth.request<Folder>(
        `${base}/pastas${current === 'new' ? '' : `/${current.id}`}`,
        {
          method: current === 'new' ? 'POST' : 'PUT',
          body: JSON.stringify({
            name,
            ...(current === 'new' ? {} : { version: current.version }),
          }),
        },
      );
      setFolderEdit(null);
      if (selectedFolder?.id === saved.id) setSelectedFolder(saved);
      setMessage('Pasta salva.');
      setRevision((value) => value + 1);
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  async function saveHole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const current = holeEdit;
    if (!current) return;
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await auth.request(`${base}/furos${current === 'new' ? '' : `/${current.id}`}`, {
        method: current === 'new' ? 'POST' : 'PUT',
        body: JSON.stringify({
          code: String(values.get('code')).trim(),
          folderId: String(values.get('folderId')) || null,
          plannedDepthM: String(values.get('depth')) || null,
          ...(current === 'new' ? {} : { version: current.version }),
        }),
      });
      setHoleEdit(null);
      setMessage('Furo salvo.');
      setRevision((value) => value + 1);
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  const folder = folderEdit && folderEdit !== 'new' ? folderEdit : null;
  const hole = holeEdit && holeEdit !== 'new' ? holeEdit : null;
  if (reportsOpen)
    return (
      <>
        <Breadcrumb
          items={[
            { label: 'Obras', onClick: onBack },
            { label: work.name, onClick: () => setReportsOpen(false) },
            { label: 'Relatórios' },
          ]}
        />
        <Reports
          work={work}
          profile={profile}
          onError={onError}
          onEditingChange={setEditingSpt}
          onBack={() => {
            setReportsOpen(false);
            setRevision((v) => v + 1);
          }}
        />
      </>
    );
  if (sptHole)
    return (
      <>
        <Breadcrumb
          items={[
            { label: 'Obras', onClick: editingSpt ? undefined : onBack },
            {
              label: work.name,
              onClick: editingSpt
                ? undefined
                : () => {
                    setSptHole(null);
                    setSelectedFolder(null);
                  },
            },
            ...(selectedFolder
              ? [
                  {
                    label: selectedFolder.name,
                    onClick: editingSpt ? undefined : () => setSptHole(null),
                  },
                ]
              : []),
            { label: sptHole.code },
          ]}
        />
        <SptTests
          onEditingChange={setEditingSpt}
          onIdentificationChanged={(saved) => {
            setSptHole(saved);
            setSelectedFolder(folders.find((folder) => folder.id === saved.folderId) ?? null);
            setRevision((value) => value + 1);
          }}
          workId={work.id}
          workName={work.name}
          hole={sptHole}
          profile={profile}
          onError={onError}
          onBack={() => {
            setSptHole(null);
            setRevision((value) => value + 1);
          }}
        />
      </>
    );
  return (
    <section className="hierarchy" aria-labelledby="hierarchy-title">
      <Breadcrumb
        items={[
          { label: 'Obras', onClick: onBack },
          { label: work.name, onClick: selectedFolder ? () => setSelectedFolder(null) : undefined },
          ...(selectedFolder ? [{ label: selectedFolder.name }] : []),
        ]}
      />
      {hasRole(profile, 'ENGINEER', 'COMMERCIAL', 'ADMIN', 'VIEWER') ? (
        <Button icon={ArrowLeft} className="secondary" disabled={busy} onClick={onBack}>
          Voltar às obras
        </Button>
      ) : null}
      <h2 id="hierarchy-title">{work.name}</h2>
      {hasRole(profile, 'ADMIN', 'COMMERCIAL') ? (
        <FieldAssignment workId={work.id} onError={onError} />
      ) : null}
      {hasRole(profile, 'ENGINEER', 'COMMERCIAL', 'ADMIN', 'VIEWER') ? (
        <Button
          icon={FileText}
          className="secondary"
          disabled={busy || Boolean(holeEdit) || Boolean(folderEdit)}
          onClick={() => setReportsOpen(true)}
        >
          Relatórios da obra
        </Button>
      ) : null}
      <p>
        {selectedFolder
          ? `Pasta: ${selectedFolder.name}`
          : 'Abra uma pasta para consultar e cadastrar os furos vinculados a ela.'}
      </p>
      {selectedFolder ? (
        <Button
          icon={ArrowLeft}
          className="secondary"
          disabled={busy}
          onClick={() => {
            setSelectedFolder(null);
            setPage(1);
            setHoleEdit(null);
            setFolderEdit(null);
            setMessage('');
          }}
        >
          Voltar às pastas
        </Button>
      ) : null}
      {message ? (
        <p className="notice" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="error">
          <p>{error}</p>
          <Button
            icon={RefreshCw}
            className="secondary"
            disabled={busy}
            onClick={() => {
              setFolderEdit(null);
              setHoleEdit(null);
              setRevision((value) => value + 1);
            }}
          >
            Recarregar dados
          </Button>
        </div>
      ) : null}
      <div className="hierarchy-browser">
        <section className="folder-pane" aria-labelledby="folders-title">
          <div className="section-heading">
            <h3 id="folders-title">Pastas</h3>
            {canWrite ? (
              <Button
                icon={Plus}
                disabled={busy}
                onClick={() => {
                  setFolderEdit('new');
                  setHoleEdit(null);
                  setError('');
                }}
              >
                Criar pasta
              </Button>
            ) : null}
          </div>
          {folderEdit ? (
            <form className="panel" key={folder?.id ?? 'new-folder'} onSubmit={saveFolder}>
              <fieldset disabled={busy}>
                <label htmlFor="folder-name">Nome da pasta</label>
                <input
                  id="folder-name"
                  name="name"
                  required
                  maxLength={120}
                  defaultValue={folder?.name ?? ''}
                />
                <Button icon={Save}>Salvar pasta</Button>
                <Button
                  icon={X}
                  type="button"
                  className="secondary"
                  onClick={() => setFolderEdit(null)}
                >
                  Cancelar
                </Button>
              </fieldset>
            </form>
          ) : null}
          {folderLoading && !folders.length ? (
            <LoadingState>Carregando pastas…</LoadingState>
          ) : (
            <>
              <FolderTree
                workId={work.id}
                workName={work.name}
                folders={folders}
                selectedId={selectedFolder?.id ?? null}
                revision={revision}
                busy={busy || Boolean(folderEdit) || Boolean(holeEdit)}
                canWrite={canWrite}
                canDelete={hasRole(profile, 'ADMIN')}
                onSelect={(next) => {
                  setSelectedFolder(next);
                  setPage(1);
                  setHoleEdit(null);
                  setFolderEdit(null);
                  setMessage('');
                }}
                onOpenHole={(next) => {
                  setSelectedFolder(folders.find((folder) => folder.id === next.folderId) ?? null);
                  setPage(1);
                  setSptHole(next);
                }}
                onRename={(next) => {
                  setFolderEdit(next);
                  setHoleEdit(null);
                  setError('');
                }}
                onError={onError}
                onRemoved={(removed) => {
                  if (selectedFolder?.id === removed.id) setSelectedFolder(null);
                  setFolderEdit(null);
                  setHoleEdit(null);
                  setPage(1);
                  setRevision((value) => value + 1);
                  setMessage('Pasta enviada para a lixeira.');
                }}
              />
              <p className="help">
                {folders.length} de {folderTotal} pastas carregadas.
              </p>
              {folders.length < folderTotal ? (
                <Button className="secondary" disabled={busy} onClick={moreFolders}>
                  Carregar mais pastas
                </Button>
              ) : null}
            </>
          )}
        </section>
        <section className="hole-pane" aria-labelledby="holes-title">
          <div className="section-heading">
            <h3 id="holes-title">
              {selectedFolder ? `Furos em ${selectedFolder.name}` : 'Furos sem pasta'}
            </h3>
            {canWrite ? (
              <Button
                icon={Plus}
                disabled={busy}
                onClick={() => {
                  setHoleEdit('new');
                  setFolderEdit(null);
                  setError('');
                }}
              >
                Cadastrar furo
              </Button>
            ) : null}
          </div>
          {holeEdit ? (
            <form
              className="panel"
              key={hole ? `${hole.id}-${hole.version}` : 'new-hole'}
              onSubmit={saveHole}
            >
              <fieldset disabled={busy}>
                <label htmlFor="hole-code">Identificação do furo</label>
                <input
                  id="hole-code"
                  name="code"
                  required
                  maxLength={60}
                  defaultValue={hole?.code ?? ''}
                  placeholder="SP-01"
                />
                <label htmlFor="hole-folder">Pasta</label>
                <select
                  id="hole-folder"
                  name="folderId"
                  defaultValue={hole?.folderId ?? selectedFolder?.id ?? ''}
                >
                  <option value="">Sem pasta</option>
                  {selectedFolder && !folders.some((folder) => folder.id === selectedFolder.id) ? (
                    <option value={selectedFolder.id}>{selectedFolder.name}</option>
                  ) : null}
                  {hole?.folderId &&
                  hole.folderId !== selectedFolder?.id &&
                  !folders.some((folder) => folder.id === hole.folderId) ? (
                    <option value={hole.folderId}>Pasta atual</option>
                  ) : null}
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
                {folders.length < folderTotal ? (
                  <Button type="button" className="secondary" disabled={busy} onClick={moreFolders}>
                    Carregar mais opções de pasta
                  </Button>
                ) : null}
                <label htmlFor="hole-depth">Profundidade planejada em metros (opcional)</label>
                <input
                  id="hole-depth"
                  name="depth"
                  type="number"
                  min="0.01"
                  max="999999.99"
                  step="0.01"
                  defaultValue={hole?.plannedDepthM ?? ''}
                />
                <p className="help">
                  A profundidade executada será registrada no lançamento do ensaio.
                </p>
                <Button icon={Save}>Salvar furo</Button>
                <Button
                  icon={X}
                  type="button"
                  className="secondary"
                  onClick={() => setHoleEdit(null)}
                >
                  Cancelar
                </Button>
              </fieldset>
            </form>
          ) : null}
          {loading ? (
            <LoadingState>Carregando furos…</LoadingState>
          ) : !holes ? (
            <p>Os dados ainda não foram carregados.</p>
          ) : holes.items.length ? (
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
                        onClick={() => setSptHole(hole)}
                      >
                        Abrir furo<span className="sr-only"> {hole.code}</span>
                      </Button>
                      {hasRole(profile, 'ADMIN') ? (
                        <TrashAction
                          actionLabel="Apagar furo"
                          path={`${base}/furos/${hole.id}`}
                          version={hole.version}
                          label={hole.code}
                          onError={onError}
                          onDone={() => {
                            setFolderEdit(null);
                            setHoleEdit(null);
                            setPage(1);
                            setRevision((value) => value + 1);
                            setMessage('Furo enviado para a lixeira.');
                          }}
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
                  disabled={busy || Boolean(holeEdit) || Boolean(folderEdit) || page === 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Anterior
                </Button>
                <span>Página {page}</span>
                <Button
                  icon={ArrowRight}
                  className="secondary"
                  disabled={
                    busy || Boolean(holeEdit) || Boolean(folderEdit) || page * 20 >= holes.total
                  }
                  onClick={() => setPage((value) => value + 1)}
                >
                  Próxima
                </Button>
              </nav>
            </>
          ) : (
            <p>
              {selectedFolder
                ? 'Nenhum furo cadastrado nesta pasta.'
                : 'Nenhum furo sem pasta. Abra uma das pastas acima para consultar os furos organizados.'}
            </p>
          )}
        </section>
      </div>
    </section>
  );
}
