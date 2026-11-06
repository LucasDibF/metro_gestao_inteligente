import { canRecordField } from '../auth/permissions';
import { LoadingState } from '../ui/LoadingState';
import { Button } from '../ui/Button';
import { RefreshCw, Plus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Profile } from '../auth/client';
import { CoordinatesSection } from './CoordinatesSection';
import { PhotoEditorForm, PhotoUploadForm } from './PhotoForms';
import { PhotoList } from './PhotoList';
import { photoPurposes } from './file-types';
import { useBoreholeFiles } from './use-borehole-files';
export function FilesPanel({
  workId,
  boreholeId,
  profile,
  onError,
  reviewState,
  onTechnicalChange,
  refreshKey,
  mode = 'all',
  onEditingChange,
}: {
  mode?: 'all' | 'coordinates' | 'photos';
  onEditingChange?: (editing: boolean) => void;
  workId: string;
  boreholeId: string;
  profile: Profile;
  reviewState?: string;
  onError: (e: unknown) => void;
  onTechnicalChange: () => void;
  refreshKey?: number;
}) {
  const files = useBoreholeFiles({ workId, boreholeId, refreshKey, onError, onTechnicalChange }),
    { data, error, message, busy, upload, photoEditor, editing } = files;
  useEffect(() => {
    onEditingChange?.(editing);
    return () => onEditingChange?.(false);
  }, [editing, onEditingChange]);
  const errorRef = useRef<HTMLDivElement>(null),
    canWrite = canRecordField(profile, reviewState);
  useEffect(() => {
    if (error) {
      errorRef.current?.focus({ preventScroll: true });
      errorRef.current?.scrollIntoView({ block: 'center' });
    }
  }, [error]);
  return (
    <section className="files-panel" aria-labelledby="files-title">
      <h3 id="files-title">
        {mode === 'photos'
          ? 'Fotografias do furo'
          : mode === 'coordinates'
            ? 'Localização do furo'
            : 'Localização e fotografias'}
      </h3>
      {error ? (
        <div className="error" role="alert" tabIndex={-1} ref={errorRef}>
          <p>{error}</p>
          <Button icon={RefreshCw} className="secondary" disabled={busy} onClick={files.reload}>
            Recarregar localização e fotografias
          </Button>
        </div>
      ) : null}
      {message ? (
        <p role="status" className="notice">
          {message}
        </p>
      ) : null}
      {!data ? (
        error ? null : (
          <LoadingState>Carregando localização e fotografias…</LoadingState>
        )
      ) : (
        <>
          <CoordinatesSection
            data={data}
            files={files}
            profile={profile}
            canWrite={canWrite}
            hidden={mode === 'photos'}
          />
          <div hidden={mode === 'coordinates'}>
            <div className="section-heading">
              <h4>Fotografias</h4>
              {canWrite && !upload ? (
                <Button
                  icon={Plus}
                  className="secondary"
                  disabled={busy}
                  onClick={() => files.setUpload(true)}
                >
                  Adicionar fotografia
                </Button>
              ) : null}
            </div>
            {upload ? (
              <PhotoUploadForm
                busy={busy}
                onUpload={files.uploadPhoto}
                onCancel={() => files.setUpload(false)}
              />
            ) : null}
            <Button
              icon={RefreshCw}
              className="secondary"
              disabled={busy}
              onClick={files.refreshPhotos}
            >
              Atualizar fotografias
            </Button>
            <ul className="photo-purpose-summary" aria-label="Fotografias por finalidade">
              {Object.entries(photoPurposes).map(([key, label]) => (
                <li key={key}>
                  <strong>{label}</strong>
                  <span>
                    {data.photos.filter((photo) => (photo.purpose ?? 'OTHER') === key).length}{' '}
                    fotografia(s)
                  </span>
                </li>
              ))}
            </ul>
            {!data.photos.length ? (
              <p>Nenhuma fotografia cadastrada.</p>
            ) : (
              <PhotoList photos={data.photos} files={files} canWrite={canWrite} />
            )}
            {photoEditor ? (
              <PhotoEditorForm
                key={photoEditor.id}
                photo={photoEditor}
                busy={busy}
                onSave={files.savePhoto}
                onCancel={() => files.setPhotoEditor(null)}
              />
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
