import { BoreholeIdentification, type Identification } from './BoreholeIdentification';
import type { ReactNode } from 'react';
import { canRecordField } from '../auth/permissions';
import { hasRole } from '../auth/permissions';
import { FieldChecklist } from './FieldChecklist';
import { InteractiveSheet } from './sheet/InteractiveSheet';
import { LoadingState } from '../ui/LoadingState';
import { Button } from '../ui/Button';
import { ArrowLeft, RefreshCw, Pencil } from 'lucide-react';
import { FilesPanel } from '../files/FilesPanel';
import { useEffect, useRef, useState } from 'react';
import type { Profile } from '../auth/client';
import { FieldDataSection } from './FieldDataSection';
import { ReviewSection } from './ReviewSection';
import { SoilLayersSection } from './SoilLayersSection';
import { useTechnicalData } from './use-technical-data';
export function TechnicalDetails({
  workId,
  workName,
  hole,
  profile,
  onBack,
  onError,
  onEditMetre,
  focusSheet = false,
  mode = 'overview',
  navigation,
  onEditingChange,
  onEditIdentification,
  onIdentificationSaved,
  onOpenProfessionalProfile,
}: {
  workId: string;
  workName: string;
  hole: { id: string; code: string };
  profile: Profile;
  onBack: () => void;
  onError: (error: unknown) => void;
  onEditMetre?: (depth: string) => void;
  focusSheet?: boolean;
  mode?: 'overview' | 'analysis' | 'review' | 'photos' | 'identification';
  navigation?: ReactNode;
  onEditingChange?: (editing: boolean) => void;
  onEditIdentification?: () => void;
  onIdentificationSaved?: (hole: Identification) => void;
  onOpenProfessionalProfile?: () => void;
}) {
  const [filesEditing, setFilesEditing] = useState(false);
  const technical = useTechnicalData({ workId, holeId: hole.id, onError }),
    { data, revision, busy, error, message, fieldEditor, layerEditor, reviewAction } = technical;
  const editing = filesEditing || fieldEditor || Boolean(layerEditor) || Boolean(reviewAction);
  useEffect(() => {
    onEditingChange?.(editing);
    return () => onEditingChange?.(false);
  }, [filesEditing, fieldEditor, layerEditor, reviewAction, onEditingChange]);
  const alert = useRef<HTMLDivElement>(null);
  const canWrite = canRecordField(profile, data?.hole.reviewState);
  useEffect(() => {
    if (error) {
      alert.current?.focus({ preventScroll: true });
      alert.current?.scrollIntoView({ block: 'center' });
    }
  }, [error]);
  const focusedSheet = useRef(false);
  useEffect(() => {
    if (focusSheet && data && !focusedSheet.current) {
      focusedSheet.current = true;
      requestAnimationFrame(() =>
        document.getElementById('interactive-sheet-title')?.scrollIntoView({ block: 'start' }),
      );
    }
  }, [focusSheet, Boolean(data)]);
  return (
    <section className="technical-screen" aria-labelledby="technical-title">
      <Button icon={ArrowLeft} className="secondary" disabled={busy || editing} onClick={onBack}>
        Voltar aos furos
      </Button>
      <h2 id="technical-title">Furo · {hole.code}</h2>
      <p className="spt-work-context">{workName}</p>
      <fieldset className="furo-navigation-lock" disabled={busy || editing}>
        {navigation}
      </fieldset>
      {error ? (
        <div className="error" role="alert" tabIndex={-1} ref={alert}>
          <p>{error}</p>
          <Button icon={RefreshCw} className="secondary" disabled={busy} onClick={technical.reload}>
            Recarregar dados técnicos
          </Button>
        </div>
      ) : null}
      {message ? (
        <p className="notice" role="status">
          {message}
        </p>
      ) : null}
      {!data ? (
        error ? null : (
          <LoadingState>Carregando dados técnicos…</LoadingState>
        )
      ) : (
        <>
          {mode === 'identification' && hasRole(profile, 'ENGINEER') ? (
            <BoreholeIdentification
              workId={workId}
              hole={data.hole}
              onError={onError}
              onEditingChange={setFilesEditing}
              onSaved={(saved) => {
                onIdentificationSaved?.(saved);
                technical.refresh();
                technical.setMessage('Identificação salva.');
              }}
            />
          ) : null}
          {mode === 'review' ? <FieldChecklist items={data.checklist} /> : null}
          {mode === 'analysis' ? (
            <InteractiveSheet
              workId={workId}
              boreholeId={hole.id}
              technicalVersion={data.hole.technicalVersion}
              refreshKey={revision}
              onError={onError}
              onReload={technical.refresh}
              onEditMetre={canWrite ? onEditMetre : undefined}
              onEditLayer={canWrite ? technical.editSheetLayer : undefined}
              editDisabled={busy || editing}
            />
          ) : null}
          {mode === 'overview' && onEditIdentification && hasRole(profile, 'ENGINEER') ? (
            <Button
              icon={Pencil}
              className="secondary"
              disabled={busy || fieldEditor || Boolean(layerEditor)}
              onClick={onEditIdentification}
            >
              Editar identificação
            </Button>
          ) : null}
          <FieldDataSection
            hole={data.hole}
            hidden={mode !== 'overview'}
            canWrite={canWrite}
            busy={busy}
            editing={fieldEditor}
            formKey={'fields-' + revision}
            onEdit={() => technical.setFieldEditor(true)}
            onCancel={() => technical.setFieldEditor(false)}
            onSubmit={(e) => technical.save(e, 'fields')}
          />
          <SoilLayersSection
            layers={data.layers}
            layerEditor={layerEditor}
            hidden={(mode !== 'overview' && !layerEditor) || !hasRole(profile, 'ENGINEER')}
            canWrite={canWrite}
            busy={busy}
            onEdit={technical.setLayerEditor}
            onCancel={() => technical.setLayerEditor(null)}
            onSubmit={(e) => technical.save(e, 'layer')}
          />
          <div hidden={mode !== 'overview' && mode !== 'photos'}>
            <FilesPanel
              mode={mode === 'photos' ? 'photos' : 'coordinates'}
              onEditingChange={setFilesEditing}
              reviewState={data.hole.reviewState}
              workId={workId}
              boreholeId={hole.id}
              profile={profile}
              onError={onError}
              refreshKey={revision}
              onTechnicalChange={technical.refresh}
            />
          </div>
          {hasRole(profile, 'ENGINEER') ? (
            <ReviewSection
              data={data}
              hidden={mode !== 'review'}
              canWrite={canWrite}
              canReview={hasRole(profile, 'ENGINEER')}
              busy={busy}
              reviewAction={reviewAction}
              history={technical.history}
              onAction={technical.setReviewAction}
              onToggleHistory={technical.toggleHistory}
              onSubmit={(e) => technical.save(e, 'review')}
              profileRejected={technical.errorCode === 'PROFESSIONAL_PROFILE_INCOMPLETE'}
              onOpenProfile={onOpenProfessionalProfile}
              onError={onError}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
