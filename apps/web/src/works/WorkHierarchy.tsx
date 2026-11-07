import { FieldAssignment } from './FieldAssignment';
import { hasRole } from '../auth/permissions';
import { FolderPane } from './FolderPane';
import { Breadcrumb } from '../ui/Breadcrumb';
import { LoadingState } from '../ui/LoadingState';
import { Button } from '../ui/Button';
import { ArrowLeft, FileText, RefreshCw, Plus } from 'lucide-react';
import { Reports } from '../reports/Reports';
import { SptTests } from '../spt/SptTests';
import { useEffect, useState } from 'react';
import type { Profile } from '../auth/client';
import type { ProfileReturnTarget } from '../workspace/WorkDestination';
import { BoreholeForm } from './HierarchyForms';
import { HoleList } from './HoleList';
import type { Borehole } from './hierarchy-types';
import { useWorkHierarchy } from './use-work-hierarchy';
export function WorkHierarchy({
  work,
  profile,
  onBack,
  onError,
  onEditingChange,
  onOpenProfessionalProfile,
}: {
  work: { id: string; name: string };
  profile: Profile;
  onBack: () => void;
  onError: (error: unknown) => void;
  onEditingChange?: (editing: boolean) => void;
  onOpenProfessionalProfile?: (back: ProfileReturnTarget) => void;
}) {
  const [editingSpt, setEditingSpt] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [sptHole, setSptHole] = useState<Borehole | null>(null);
  const hierarchy = useWorkHierarchy(work.id, onError);
  const {
    base,
    selectedFolder,
    setSelectedFolder,
    folders,
    folderTotal,
    holes,
    page,
    setPage,
    loading,
    busy,
    error,
    setError,
    message,
    setMessage,
    folderEdit,
    setFolderEdit,
    holeEdit,
    setHoleEdit,
  } = hierarchy;
  const canWrite = hasRole(profile, 'ENGINEER');
  useEffect(() => {
    onEditingChange?.(editingSpt || Boolean(folderEdit) || Boolean(holeEdit));
    return () => onEditingChange?.(false);
  }, [editingSpt, folderEdit, holeEdit, onEditingChange]);
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
            hierarchy.refresh();
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
            hierarchy.refresh();
          }}
          workId={work.id}
          workName={work.name}
          hole={sptHole}
          profile={profile}
          onError={onError}
          onOpenProfessionalProfile={onOpenProfessionalProfile}
          onBack={() => {
            setSptHole(null);
            hierarchy.refresh();
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
              hierarchy.refresh();
            }}
          >
            Recarregar dados
          </Button>
        </div>
      ) : null}
      <div className="hierarchy-browser">
        <FolderPane
          hierarchy={hierarchy}
          workId={work.id}
          workName={work.name}
          canWrite={canWrite}
          canDelete={hasRole(profile, 'ADMIN')}
          onOpenHole={setSptHole}
          onError={onError}
        />
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
            <BoreholeForm
              key={hole ? `${hole.id}-${hole.version}` : 'new-hole'}
              hole={hole}
              selectedFolder={selectedFolder}
              folders={folders}
              folderTotal={folderTotal}
              busy={busy}
              onLoadMoreFolders={hierarchy.moreFolders}
              onSave={(input) => void hierarchy.saveHole(input)}
              onCancel={() => setHoleEdit(null)}
            />
          ) : null}
          {loading ? (
            <LoadingState>Carregando furos…</LoadingState>
          ) : !holes ? (
            <p>Os dados ainda não foram carregados.</p>
          ) : holes.items.length ? (
            <HoleList
              holes={holes}
              folders={folders}
              base={base}
              page={page}
              busy={busy}
              locked={busy || Boolean(holeEdit) || Boolean(folderEdit)}
              canWrite={canWrite}
              canDelete={hasRole(profile, 'ADMIN')}
              onOpen={setSptHole}
              onRemoved={() => {
                setFolderEdit(null);
                setHoleEdit(null);
                setPage(1);
                hierarchy.refresh();
                setMessage('Furo enviado para a lixeira.');
              }}
              onPageChange={(step) => setPage((value) => value + step)}
              onError={onError}
            />
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
