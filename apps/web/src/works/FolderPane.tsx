import { Plus } from 'lucide-react';
import { Button } from '../ui/Button';
import { LoadingState } from '../ui/LoadingState';
import { FolderTree, type TreeHole } from './FolderTree';
import { FolderForm } from './HierarchyForms';
import type { WorkHierarchyState } from './use-work-hierarchy';

/** Folder column of a work: create, rename, browse and trash folders. */
export function FolderPane({
  hierarchy,
  workId,
  workName,
  canWrite,
  canDelete,
  onOpenHole,
  onError,
}: {
  hierarchy: WorkHierarchyState;
  workId: string;
  workName: string;
  canWrite: boolean;
  canDelete: boolean;
  onOpenHole: (hole: TreeHole) => void;
  onError: (error: unknown) => void;
}) {
  const {
    selectedFolder,
    setSelectedFolder,
    folders,
    folderTotal,
    folderLoading,
    setPage,
    revision,
    busy,
    setError,
    setMessage,
    folderEdit,
    setFolderEdit,
    holeEdit,
    setHoleEdit,
  } = hierarchy;
  const folder = folderEdit && folderEdit !== 'new' ? folderEdit : null;
  return (
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
        <FolderForm
          key={folder?.id ?? 'new-folder'}
          folder={folder}
          busy={busy}
          onSave={(name) => void hierarchy.saveFolder(name)}
          onCancel={() => setFolderEdit(null)}
        />
      ) : null}
      {folderLoading && !folders.length ? (
        <LoadingState>Carregando pastas…</LoadingState>
      ) : (
        <>
          <FolderTree
            workId={workId}
            workName={workName}
            folders={folders}
            selectedId={selectedFolder?.id ?? null}
            revision={revision}
            busy={busy || Boolean(folderEdit) || Boolean(holeEdit)}
            canWrite={canWrite}
            canDelete={canDelete}
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
              onOpenHole(next);
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
              hierarchy.refresh();
              setMessage('Pasta enviada para a lixeira.');
            }}
          />
          <p className="help">
            {folders.length} de {folderTotal} pastas carregadas.
          </p>
          {folders.length < folderTotal ? (
            <Button className="secondary" disabled={busy} onClick={hierarchy.moreFolders}>
              Carregar mais pastas
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}
