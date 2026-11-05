import { BoreholeIdentification, type Identification } from './BoreholeIdentification';
import type { ReactNode } from 'react';
import { canRecordField } from '../auth/permissions';
import { hasRole } from '../auth/permissions';
import { FieldChecklist, type ChecklistItem } from './FieldChecklist';
import { InteractiveSheet } from './sheet/InteractiveSheet';
import type { SheetLayer } from './sheet/types';
import { LoadingState } from '../ui/LoadingState';
import { Button } from '../ui/Button';
import {
  ArrowLeft,
  RefreshCw,
  Pencil,
  Save,
  X,
  Plus,
  ClipboardCheck,
  CheckCheck,
  Undo2,
} from 'lucide-react';
import { FilesPanel } from '../files/FilesPanel';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { auth, type Profile } from '../auth/client';
interface Layer {
  id: string;
  fromM: string;
  toM: string;
  soilType: string;
  description: string;
  soilColor?: string | null;
  soilMoisture?: string | null;
  version: number;
}
interface TechnicalData {
  checklist: ChecklistItem[];
  tests: Array<{ id: string; depthM: string; result: { nSpt: number | null; status: string } }>;
  hole: {
    id: string;
    code: string;
    version: number;
    folderId: string | null;
    plannedDepthM: string | null;
    technicalVersion: number;
    reviewState: 'DRAFT' | 'IN_REVIEW' | 'APPROVED';
    executedDepthM: string | null;
    waterLevelM: string | null;
    fieldDate: string | null;
    reviewerName: string | null;
    reviewerRegistration: string | null;
    reviewNote: string | null;
  };
  layers: Layer[];
  events: Array<{ id: string; action: string; technicalVersion: number; createdAt: string }>;
}
const states = {
  DRAFT: 'Em preparação',
  IN_REVIEW: 'Aguardando revisão',
  APPROVED: 'Aprovado tecnicamente',
};
function requireNoteText(event: FormEvent<HTMLTextAreaElement>): void {
  const field = event.currentTarget;
  field.setCustomValidity(field.value.trim() ? '' : 'Escreva o parecer da revisão.');
}
const eventNames: Record<string, string> = {
  SPT_SOIL_SAVED: 'Ensaio e solo salvos juntos',
  FIELD_DATA_UPDATED: 'Dados de campo atualizados',
  spt_tests_INSERT: 'Ensaio registrado',
  spt_tests_UPDATE: 'Ensaio alterado',
  soil_layers_INSERT: 'Camada registrada',
  soil_layers_UPDATE: 'Camada alterada',
  REVIEW_SUBMIT: 'Enviado para revisão',
  REVIEW_APPROVE: 'Aprovado pelo engenheiro',
  REVIEW_REJECT: 'Devolvido para correção',
};
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
}) {
  const [filesEditing, setFilesEditing] = useState(false);
  const [data, setData] = useState<TechnicalData | null>(null),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [fieldEditor, setFieldEditor] = useState(false),
    [layerEditor, setLayerEditor] = useState<Layer | 'new' | null>(null),
    [history, setHistory] = useState(false),
    [reviewAction, setReviewAction] = useState<'enviar-revisao' | 'aprovar' | 'devolver' | null>(
      null,
    );
  useEffect(() => {
    onEditingChange?.(filesEditing || fieldEditor || Boolean(layerEditor) || Boolean(reviewAction));
    return () => onEditingChange?.(false);
  }, [filesEditing, fieldEditor, layerEditor, reviewAction, onEditingChange]);
  const alert = useRef<HTMLDivElement>(null);
  const base = `/obras/${workId}/furos/${hole.id}/tecnico`,
    canWrite = canRecordField(profile, data?.hole.reviewState);
  useEffect(() => {
    let active = true;
    auth
      .request<TechnicalData>(base)
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
  }, [base, revision, onError]);
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
  async function editSheetLayer(selected: SheetLayer) {
    setBusy(true);
    setError('');
    try {
      const fresh = await auth.request<TechnicalData>(base);
      setData(fresh);
      const found = fresh.layers.find((layer) => layer.id === selected.id);
      if (!found) throw Error('A camada mudou. Atualize a folha para selecionar novamente.');
      setLayerEditor(found);
      requestAnimationFrame(() =>
        document.getElementById('soil-from')?.scrollIntoView({ block: 'center' }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir a camada.');
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>, kind: 'fields' | 'layer' | 'review') {
    event.preventDefault();
    if (!data) return;
    const values = new FormData(event.currentTarget);
    setError('');
    setMessage('');
    if (kind === 'layer' && Number(values.get('from')) >= Number(values.get('to'))) {
      setError('A profundidade em “Até” precisa ser maior que em “De”.');
      return;
    }
    setBusy(true);
    let path = base,
      method = 'PUT',
      body: Record<string, unknown> = {};
    if (kind === 'fields')
      body = {
        technicalVersion: data.hole.technicalVersion,
        executedDepthM: String(values.get('executed')) || null,
        waterLevelM: String(values.get('water')) || null,
        fieldDate: String(values.get('date')) || null,
      };
    if (kind === 'layer') {
      const current = layerEditor && layerEditor !== 'new' ? layerEditor : null;
      path += `/camadas${current ? '/' + current.id : ''}`;
      method = current ? 'PUT' : 'POST';
      body = {
        fromM: String(values.get('from')),
        toM: String(values.get('to')),
        soilType: String(values.get('type')).trim(),
        description: String(values.get('description')),
        ...(current ? { version: current.version } : {}),
      };
    }
    if (kind === 'review') {
      path += '/' + reviewAction;
      method = 'POST';
      body = {
        technicalVersion: data.hole.technicalVersion,
        note: String(values.get('note')).trim(),
        ...(reviewAction === 'aprovar'
          ? {
              reviewerName: String(values.get('name')),
              reviewerRegistration: String(values.get('registration')),
            }
          : {}),
      };
    }
    try {
      await auth.request(path, { method, body: JSON.stringify(body) });
      setFieldEditor(false);
      setLayerEditor(null);
      setReviewAction(null);
      setRevision((v) => v + 1);
      setMessage('Dados salvos.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  const layer = layerEditor && layerEditor !== 'new' ? layerEditor : null;
  return (
    <section className="technical-screen" aria-labelledby="technical-title">
      <Button
        icon={ArrowLeft}
        className="secondary"
        disabled={
          busy || filesEditing || fieldEditor || Boolean(layerEditor) || Boolean(reviewAction)
        }
        onClick={onBack}
      >
        Voltar aos furos
      </Button>
      <h2 id="technical-title">Furo · {hole.code}</h2>
      <p className="spt-work-context">{workName}</p>
      <fieldset
        className="furo-navigation-lock"
        disabled={
          busy || filesEditing || fieldEditor || Boolean(layerEditor) || Boolean(reviewAction)
        }
      >
        {navigation}
      </fieldset>
      {error ? (
        <div className="error" role="alert" tabIndex={-1} ref={alert}>
          <p>{error}</p>
          <Button
            icon={RefreshCw}
            className="secondary"
            disabled={busy}
            onClick={() => {
              setError('');
              setFieldEditor(false);
              setLayerEditor(null);
              setReviewAction(null);
              setRevision((v) => v + 1);
            }}
          >
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
                setRevision((v) => v + 1);
                setMessage('Identificação salva.');
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
              onReload={() => setRevision((value) => value + 1)}
              onEditMetre={canWrite ? onEditMetre : undefined}
              onEditLayer={canWrite ? editSheetLayer : undefined}
              editDisabled={
                busy || filesEditing || fieldEditor || Boolean(layerEditor) || Boolean(reviewAction)
              }
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
          <section hidden={mode !== 'overview'} aria-labelledby="field-title">
            <div className="section-heading">
              <h3 id="field-title">Dados de campo</h3>
              {canWrite && !fieldEditor ? (
                <Button
                  icon={Pencil}
                  className="secondary"
                  disabled={busy}
                  onClick={() => setFieldEditor(true)}
                >
                  Editar dados de campo
                </Button>
              ) : null}
            </div>
            <p>
              Profundidade executada: {data.hole.executedDepthM ?? 'Não informada'} m · Nível
              d’água: {data.hole.waterLevelM ?? 'Não informado'}
              {data.hole.waterLevelM ? ' m' : ''}
            </p>
            <p>
              Data de campo:{' '}
              {data.hole.fieldDate
                ? new Date(data.hole.fieldDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
                : 'Não informada'}
            </p>
            {fieldEditor ? (
              <form
                className="panel"
                key={'fields-' + revision}
                onSubmit={(e) => save(e, 'fields')}
              >
                <fieldset disabled={busy}>
                  <label htmlFor="field-date">Data de campo</label>
                  <input
                    id="field-date"
                    name="date"
                    type="date"
                    defaultValue={data.hole.fieldDate?.slice(0, 10) ?? ''}
                  />
                  <label htmlFor="executed-depth">Profundidade executada em metros</label>
                  <input
                    id="executed-depth"
                    name="executed"
                    type="number"
                    min="0.01"
                    max="999999.99"
                    step="0.01"
                    defaultValue={data.hole.executedDepthM ?? ''}
                  />
                  <label htmlFor="water-level">Nível d’água em metros (opcional)</label>
                  <input
                    id="water-level"
                    name="water"
                    type="number"
                    min="0"
                    max="999999.99"
                    step="0.01"
                    defaultValue={data.hole.waterLevelM ?? ''}
                  />
                  <p className="help">
                    Deixar vazio indica ausência de informação. Zero indica água na superfície.
                  </p>
                  <div className="form-actions">
                    <Button icon={Save}>Salvar dados de campo</Button>
                    <Button
                      icon={X}
                      type="button"
                      className="secondary"
                      onClick={() => setFieldEditor(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </fieldset>
              </form>
            ) : null}
          </section>
          <details
            hidden={(mode !== 'overview' && !layerEditor) || !hasRole(profile, 'ENGINEER')}
            open={layerEditor ? true : undefined}
          >
            <summary>Ajustar camadas de solo</summary>
            <section aria-labelledby="soil-title">
              <div className="section-heading">
                <h3 id="soil-title">Camadas de solo</h3>
                {canWrite && !layerEditor ? (
                  <Button icon={Plus} disabled={busy} onClick={() => setLayerEditor('new')}>
                    Adicionar camada
                  </Button>
                ) : null}
              </div>
              <p className="help">
                O tipo e a descrição são informados pelo responsável. O sistema não deduz o solo a
                partir do N-SPT.
              </p>
              {layerEditor ? (
                <form className="panel" key={layer?.id ?? 'new'} onSubmit={(e) => save(e, 'layer')}>
                  <fieldset disabled={busy}>
                    <div className="field-pair">
                      <div>
                        <label htmlFor="soil-from">De (m)</label>
                        <input
                          id="soil-from"
                          name="from"
                          required
                          type="number"
                          min="0"
                          max="999999.99"
                          step="0.01"
                          defaultValue={layer?.fromM ?? ''}
                        />
                      </div>
                      <div>
                        <label htmlFor="soil-to">Até (m)</label>
                        <input
                          id="soil-to"
                          name="to"
                          required
                          type="number"
                          min="0.01"
                          max="999999.99"
                          step="0.01"
                          defaultValue={layer?.toM ?? ''}
                        />
                      </div>
                    </div>
                    <label htmlFor="soil-type">Tipo de solo</label>
                    <input
                      id="soil-type"
                      name="type"
                      required
                      pattern=".*\S.*"
                      title="Informe o tipo de solo."
                      maxLength={120}
                      defaultValue={layer?.soilType ?? ''}
                      placeholder="Ex.: areia siltosa"
                    />
                    <label htmlFor="soil-description">Descrição da camada (opcional)</label>
                    <textarea
                      id="soil-description"
                      name="description"
                      rows={4}
                      maxLength={2000}
                      defaultValue={layer?.description ?? ''}
                      placeholder="Cor, composição e observações de campo"
                    />
                    <div className="form-actions">
                      <Button icon={Save}>Salvar camada</Button>
                      <Button
                        icon={X}
                        type="button"
                        className="secondary"
                        onClick={() => setLayerEditor(null)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </fieldset>
                </form>
              ) : null}
              {data.layers.length ? (
                <ul className="work-list">
                  {data.layers.map((l) => (
                    <li key={l.id}>
                      <div>
                        <h3>
                          {l.fromM}–{l.toM} m · {l.soilType}
                        </h3>
                        <p className="soil-description">{l.description}</p>
                      </div>
                      {canWrite ? (
                        <Button
                          icon={Pencil}
                          className="secondary"
                          disabled={busy || !!layerEditor}
                          onClick={() => setLayerEditor(l)}
                        >
                          Editar camada
                          <span className="sr-only">
                            {' '}
                            de {l.fromM} a {l.toM} m
                          </span>
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Nenhuma camada registrada.</p>
              )}
            </section>
          </details>
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
              onTechnicalChange={() => setRevision((v) => v + 1)}
            />
          </div>
          {hasRole(profile, 'ENGINEER') ? (
            <section hidden={mode !== 'review'} aria-labelledby="review-title">
              <h3 id="review-title">Revisão técnica</h3>
              <p>
                <strong>{states[data.hole.reviewState]}</strong> · Versão técnica{' '}
                {data.hole.technicalVersion}
              </p>
              <p className="help">
                Alterar ensaios, solo ou dados de campo exige nova revisão. Para enviar, preencha a
                data, a profundidade executada, os ensaios e todas as camadas do perfil.
              </p>
              {data.hole.reviewerName ? (
                <p>
                  Responsável: {data.hole.reviewerName} · Registro: {data.hole.reviewerRegistration}
                </p>
              ) : null}
              {data.hole.reviewNote ? <p>{data.hole.reviewNote}</p> : null}
              {!reviewAction ? (
                <div className="form-actions">
                  {canWrite && data.hole.reviewState === 'DRAFT' ? (
                    <Button
                      icon={ClipboardCheck}
                      disabled={busy}
                      onClick={() => setReviewAction('enviar-revisao')}
                    >
                      Enviar para análise
                    </Button>
                  ) : null}
                  {hasRole(profile, 'ENGINEER') && data.hole.reviewState === 'IN_REVIEW' ? (
                    <>
                      <Button
                        icon={CheckCheck}
                        disabled={busy}
                        onClick={() => setReviewAction('aprovar')}
                      >
                        Aprovar tecnicamente
                      </Button>
                      <Button
                        icon={Undo2}
                        className="secondary"
                        disabled={busy}
                        onClick={() => setReviewAction('devolver')}
                      >
                        Devolver para correção
                      </Button>
                    </>
                  ) : null}
                </div>
              ) : (
                <form className="panel" onSubmit={(e) => save(e, 'review')}>
                  <fieldset disabled={busy}>
                    {reviewAction === 'aprovar' ? (
                      <>
                        <label htmlFor="reviewer-name">Nome do responsável técnico</label>
                        <input id="reviewer-name" name="name" maxLength={200} required />
                        <label htmlFor="reviewer-registration">Registro profissional</label>
                        <input
                          id="reviewer-registration"
                          name="registration"
                          maxLength={100}
                          required
                        />
                      </>
                    ) : null}
                    <label htmlFor="review-note">Parecer ou observações da revisão</label>
                    <textarea
                      id="review-note"
                      name="note"
                      maxLength={2000}
                      rows={3}
                      required
                      onInput={requireNoteText}
                    />
                    <div className="form-actions">
                      <Button
                        icon={
                          reviewAction === 'aprovar'
                            ? CheckCheck
                            : reviewAction === 'devolver'
                              ? Undo2
                              : ClipboardCheck
                        }
                      >
                        {reviewAction === 'aprovar'
                          ? 'Confirmar aprovação'
                          : reviewAction === 'devolver'
                            ? 'Confirmar devolução'
                            : 'Confirmar envio para análise'}
                      </Button>
                      <Button
                        icon={X}
                        type="button"
                        className="secondary"
                        onClick={() => setReviewAction(null)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </fieldset>
                </form>
              )}
              <Button
                className="secondary"
                onClick={() => setHistory((v) => !v)}
                aria-expanded={history}
              >
                {history ? 'Ocultar histórico' : 'Ver histórico técnico'}
              </Button>
              {history ? (
                <ul className="work-list">
                  {data.events.map((e) => (
                    <li key={e.id}>
                      <div>
                        <p>
                          {eventNames[e.action] ?? 'Alteração técnica'} · Versão{' '}
                          {e.technicalVersion}
                        </p>
                        <p>{new Date(e.createdAt).toLocaleString('pt-BR')}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}
