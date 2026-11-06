import { useEffect, useState } from 'react';
import { auth, longRequestSignal } from '../auth/client';
import {
  maxPhotoBytes,
  type BoreholeFiles,
  type Coordinate,
  type CoordinateInput,
  type CoordinateKind,
  type Photo,
  type PhotoChanges,
} from './file-types';

export interface BoreholeFilesState {
  data: BoreholeFiles | null;
  revision: number;
  error: string;
  message: string;
  busy: boolean;
  kind: CoordinateKind | null;
  current: Coordinate | undefined;
  upload: boolean;
  photoEditor: Photo | null;
  remove: string | null;
  preview: { id: string; url: string } | null;
  editing: boolean;
  setKind: (kind: CoordinateKind | null) => void;
  setUpload: (upload: boolean) => void;
  setPhotoEditor: (photo: Photo | null) => void;
  setRemove: (photoId: string | null) => void;
  reload: () => void;
  refreshPhotos: () => void;
  saveCoordinate: (input: CoordinateInput) => void;
  makeOfficial: (coordinate: Coordinate) => void;
  uploadPhoto: (values: FormData) => void;
  savePhoto: (changes: PhotoChanges) => void;
  removePhoto: (photo: Photo) => void;
  show: (photo: Photo) => Promise<void>;
}

/** Loads a borehole's coordinates and photos and runs every change to them. */
export function useBoreholeFiles({
  workId,
  boreholeId,
  refreshKey,
  onError,
  onTechnicalChange,
}: {
  workId: string;
  boreholeId: string;
  refreshKey?: number;
  onError: (e: unknown) => void;
  onTechnicalChange: () => void;
}): BoreholeFilesState {
  const [data, setData] = useState<BoreholeFiles | null>(null),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [kind, setKind] = useState<CoordinateKind | null>(null),
    [upload, setUpload] = useState(false),
    [photoEditor, setPhotoEditor] = useState<Photo | null>(null),
    [remove, setRemove] = useState<string | null>(null),
    [preview, setPreview] = useState<{ id: string; url: string } | null>(null);
  const base = `/obras/${workId}/furos/${boreholeId}/arquivos`;
  useEffect(() => {
    let active = true;
    auth
      .request<BoreholeFiles>(base)
      .then((v) => {
        if (active) setData(v);
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
  }, [base, revision, refreshKey, onError]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
  async function perform(action: () => Promise<unknown>, technical = false) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      setRevision((v) => v + 1);
      setKind(null);
      setUpload(false);
      setPhotoEditor(null);
      setRemove(null);
      setMessage('Dados de localização e fotografias atualizados.');
      if (technical) onTechnicalChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir.');
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  const current = data?.coordinates.find((c) => c.kind === kind);
  function saveCoordinate(input: CoordinateInput) {
    void perform(
      () =>
        auth.request(base + '/coordenadas/' + (kind === 'PLANNED' ? 'planejada' : 'executada'), {
          method: 'PUT',
          body: JSON.stringify({ ...input, ...(current ? { version: current.version } : {}) }),
        }),
      true,
    );
  }
  function makeOfficial(coordinate: Coordinate) {
    if (!data) return;
    void perform(
      () =>
        auth.request(base + '/coordenadas/oficial', {
          method: 'PUT',
          body: JSON.stringify({
            coordinateId: coordinate.id,
            technicalVersion: data.technicalVersion,
          }),
        }),
      true,
    );
  }
  function uploadPhoto(values: FormData) {
    const file = values.get('file');
    if (file instanceof File && file.size > maxPhotoBytes) {
      setMessage('');
      setError('A fotografia ultrapassa 8 MB. Escolha um arquivo menor.');
      return;
    }
    void perform(
      () =>
        auth.request(base + '/fotografias', {
          method: 'POST',
          body: values,
          signal: longRequestSignal(),
        }),
      true,
    );
  }
  function savePhoto(changes: PhotoChanges) {
    if (!photoEditor) return;
    void perform(() =>
      auth.request(base + '/fotografias/' + photoEditor.id, {
        method: 'PUT',
        body: JSON.stringify({ version: photoEditor.version, ...changes }),
      }),
    );
  }
  function removePhoto(photo: Photo) {
    void perform(() =>
      auth.request(base + '/fotografias/' + photo.id, {
        method: 'DELETE',
        body: JSON.stringify({ version: photo.version }),
      }),
    );
  }
  async function show(photo: Photo) {
    setBusy(true);
    setError('');
    try {
      const blob = await auth.request<Blob>(
        base + '/fotografias/' + photo.id + '/preview',
        {},
        (r) => r.blob(),
      );
      setPreview({ id: photo.id, url: URL.createObjectURL(blob) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir a fotografia.');
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  return {
    data,
    revision,
    error,
    message,
    busy,
    kind,
    current,
    upload,
    photoEditor,
    remove,
    preview,
    editing: Boolean(kind || upload || photoEditor || remove),
    setKind,
    setUpload,
    setPhotoEditor,
    setRemove,
    reload: () => {
      setError('');
      setRevision((v) => v + 1);
    },
    refreshPhotos: () => {
      setRevision((v) => v + 1);
      onTechnicalChange();
    },
    saveCoordinate,
    makeOfficial,
    uploadPhoto,
    savePhoto,
    removePhoto,
    show,
  };
}
