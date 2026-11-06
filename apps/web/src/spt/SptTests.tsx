import { FuroNavigation, type FuroSection } from './FuroNavigation';
import { canRecordField } from '../auth/permissions';
import { hasRole } from '../auth/permissions';
import { Button } from '../ui/Button';
import { ArrowLeft, Plus, X } from 'lucide-react';
import type { Identification } from './BoreholeIdentification';
import { FieldSubmission } from './FieldSubmission';
import { TechnicalDetails } from './TechnicalDetails';
import { useEffect, useRef, useState } from 'react';
import type { Profile } from '../auth/client';
import { MetreEditor } from './MetreEditor';
import { MetreJump } from './MetreJump';
import { SptRecordList } from './SptRecordList';
import { SptResult } from './SptResult';
import { useSptRecords } from './use-spt-records';
export function SptTests({
  workId,
  workName,
  hole: initialHole,
  profile,
  onBack,
  onError,
  onEditingChange,
  onIdentificationChanged,
}: {
  workId: string;
  workName: string;
  hole: { id: string; code: string };
  profile: Profile;
  onBack: () => void;
  onError: (error: unknown) => void;
  onEditingChange?: (editing: boolean) => void;
  onIdentificationChanged?: (saved: Identification) => void;
}) {
  const [hole, setHole] = useState(initialHole);
  const [section, setSection] = useState<FuroSection>(
    hasRole(profile, 'OPERATOR') ? 'field' : 'overview',
  );
  const details = section !== 'field';
  const setDetails = (value: boolean) => setSection(value ? 'overview' : 'field');
  const errorRef = useRef<HTMLDivElement>(null);
  const [submissionEditing, setSubmissionEditing] = useState(false);
  const records = useSptRecords({ workId, holeId: hole.id, submissionEditing, onError });
  const { data, page, loading, busy, error, message, editing, result } = records;
  useEffect(() => {
    onEditingChange?.(Boolean(editing) || submissionEditing);
    return () => onEditingChange?.(false);
  }, [editing, submissionEditing, onEditingChange]);
  const canWrite = canRecordField(profile, data?.reviewState);
  useEffect(() => {
    if (error && !busy) {
      errorRef.current?.focus({ preventScroll: true });
      errorRef.current?.scrollIntoView({ block: 'center' });
    }
  }, [error, busy, records.errorAttempt]);
  const changeSection = (next: FuroSection) => {
    setSection(next);
    records.refresh();
  };
  const current = editing && editing !== 'new' ? editing : null;
  const locked = busy || Boolean(editing) || submissionEditing;
  if (details)
    return (
      <TechnicalDetails
        workId={workId}
        workName={workName}
        hole={hole}
        profile={profile}
        onError={onError}
        mode={section as Exclude<FuroSection, 'field'>}
        navigation={<FuroNavigation profile={profile} section={section} onChange={changeSection} />}
        onEditMetre={
          canWrite
            ? (depth) => {
                setDetails(false);
                void records.openMetre(depth);
              }
            : undefined
        }
        onBack={onBack}
        onEditingChange={onEditingChange}
        onEditIdentification={() => setSection('identification')}
        onIdentificationSaved={(saved) => {
          setHole(saved);
          onIdentificationChanged?.(saved);
          records.refresh();
        }}
      />
    );
  return (
    <section className="spt-screen" aria-labelledby="spt-title">
      <Button icon={ArrowLeft} className="secondary" disabled={locked} onClick={onBack}>
        Voltar aos furos
      </Button>
      <div className="section-heading">
        <div>
          <h2 id="spt-title">Registro de campo · {hole.code}</h2>
          <p className="spt-work-context">
            {workName} · Preencha golpes e solo juntos, metro a metro.
          </p>
        </div>
        {canWrite && !editing && !submissionEditing && data && !loading ? (
          <Button icon={Plus} onClick={() => records.startNewMetre(data.nextDepth)}>
            Registrar metro
          </Button>
        ) : null}
      </div>
      <FuroNavigation
        profile={profile}
        section={section}
        onChange={changeSection}
        disabled={locked}
      />
      {data?.reviewState === 'DRAFT' && data.reviewNote ? (
        <div className="notice review-return-note">
          <strong>Devolvido para correção</strong>
          <p>{data.reviewNote}</p>
        </div>
      ) : null}
      {data && !canWrite && hasRole(profile, 'OPERATOR') ? (
        <p className="notice">
          {data.reviewState === 'APPROVED'
            ? 'Furo aprovado tecnicamente. As alterações de campo ficam bloqueadas.'
            : 'Registro enviado para análise. As alterações ficam bloqueadas até o engenheiro devolver para correção.'}
        </p>
      ) : null}
      {message ? (
        <p className="notice" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <div className="error" role="alert" ref={errorRef} tabIndex={-1}>
          <p>{error}</p>
          <Button icon={X} className="secondary" disabled={busy} onClick={records.closeAndReload}>
            {editing ? 'Fechar edição e recarregar' : 'Recarregar ensaios'}
          </Button>
        </div>
      ) : null}
      {data && !editing && canWrite ? (
        <MetreJump
          data={data}
          disabled={busy || submissionEditing}
          onOpen={(depth) => void records.openMetre(depth)}
        />
      ) : null}
      {editing ? (
        <MetreEditor
          current={current}
          initialSoil={records.initialSoil}
          formSequence={records.formSequence}
          formRef={records.formRef}
          newMetreDepth={records.newMetreDepth}
          depthValue={records.depthValue}
          previousSoil={records.previousSoil}
          busy={busy}
          loading={loading}
          onDepthChange={records.setDepthValue}
          onSubmit={(event) => void records.save(event)}
          onCancel={records.cancelEdit}
        />
      ) : null}
      {result ? <SptResult result={result} /> : null}
      <SptRecordList
        data={data}
        loading={loading}
        failed={Boolean(error)}
        page={page}
        locked={locked}
        canWrite={canWrite}
        onCorrect={records.startCorrection}
        onPageChange={records.changePage}
      />
      {data && !editing ? (
        <Button
          className="secondary"
          disabled={busy || submissionEditing}
          onClick={() => changeSection('photos')}
        >
          Continuar para fotografias
        </Button>
      ) : null}
      {data && hasRole(profile, 'ENGINEER', 'OPERATOR') && !editing ? (
        <FieldSubmission
          key={records.revision}
          workId={workId}
          boreholeId={hole.id}
          onError={onError}
          onSubmitted={records.refresh}
          onEditingChange={setSubmissionEditing}
        />
      ) : null}
    </section>
  );
}
