import { ArrowLeft, RefreshCw, RotateCcw, Save } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, auth } from '../auth/client';
import { Button } from '../ui/Button';
import { LoadingState } from '../ui/LoadingState';
import { ProfileStateField, ProfileTextField, profileFieldId } from './ProfileField';
import {
  formValuesFrom,
  missingFieldsSentence,
  profileFieldMessages,
  profileFieldOrder,
  profileInput,
  sameValues,
  validateProfile,
  type ProfessionalProfile as Profile,
  type ProfileFieldErrors,
  type ProfileFieldName,
  type ProfileFormValues,
} from './professional-profile-form';
import { professionalProfilePath, useProfessionalProfile } from './use-professional-profile';

/** Where the engineer came from, so the page can lead back after completing the profile. */
export interface ProfileReturn {
  label: string;
  onReturn: () => void;
}
const lockReason = 'navigation-lock-reason';

/**
 * The engineer's own professional data. The approval of a borehole copies name, title and CREA
 * from here; phone and email stay on the profile. Each concern is its own section, so later
 * sections can join this page without changing the form.
 */
export function ProfessionalProfile({
  onError,
  onEditingChange,
  back,
}: {
  onError: (error: unknown) => void;
  onEditingChange: (editing: boolean) => void;
  back?: ProfileReturn;
}) {
  const state = useProfessionalProfile({ onError });
  const [message, setMessage] = useState('');
  if (state.loading && !state.profile)
    return <LoadingState>Carregando perfil profissional…</LoadingState>;
  if (!state.profile)
    return (
      <section className="panel" aria-labelledby="professional-profile-title">
        <h2 id="professional-profile-title">Perfil profissional</h2>
        <div className="error" role="alert">
          <p>{state.error}</p>
          <Button icon={RefreshCw} className="secondary" onClick={state.reload}>
            Tentar novamente
          </Button>
        </div>
      </section>
    );
  return (
    <ProfileForm
      key={state.profile.version}
      saved={state.profile}
      onSaved={(profile, text) => {
        state.replace(profile);
        setMessage(text);
      }}
      message={message}
      onMessageClear={() => setMessage('')}
      onReload={state.reload}
      reloading={state.loading}
      onError={onError}
      onEditingChange={onEditingChange}
      back={back}
    />
  );
}

function ProfileForm({
  saved,
  onSaved,
  message,
  onMessageClear,
  onReload,
  reloading,
  onError,
  onEditingChange,
  back,
}: {
  saved: Profile;
  /** The form remounts with the saved values, so the confirmation lives in the parent. */
  onSaved: (profile: Profile, message: string) => void;
  message: string;
  onMessageClear: () => void;
  onReload: () => void;
  reloading: boolean;
  onError: (error: unknown) => void;
  onEditingChange: (editing: boolean) => void;
  back?: ProfileReturn;
}) {
  const initial = formValuesFrom(saved);
  const [values, setValues] = useState<ProfileFormValues>(initial);
  const [errors, setErrors] = useState<ProfileFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<{ message: string; conflict: boolean } | null>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  const dirty = !sameValues(values, initial);
  useEffect(() => {
    onEditingChange(dirty);
  }, [dirty, onEditingChange]);
  useEffect(() => () => onEditingChange(false), [onEditingChange]);
  useEffect(() => {
    if (failure) failureRef.current?.focus();
  }, [failure]);
  function change(field: ProfileFieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    onMessageClear();
  }
  function showFieldErrors(found: ProfileFieldErrors) {
    setErrors(found);
    const first = profileFieldOrder.find((field) => found[field]);
    if (first) requestAnimationFrame(() => document.getElementById(profileFieldId(first))?.focus());
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);
    onMessageClear();
    const found = validateProfile(values);
    if (Object.keys(found).length) return showFieldErrors(found);
    setSaving(true);
    try {
      const result = await auth.request<Profile>(professionalProfilePath, {
        method: 'PUT',
        body: JSON.stringify(profileInput(values, saved.version)),
      });
      onSaved(
        result,
        result.complete
          ? 'Perfil salvo. Seus dados já valem nas próximas aprovações.'
          : `Perfil salvo. Para aprovar furos, ainda falta: ${missingFieldsSentence(result.missingFields)}.`,
      );
    } catch (e) {
      const field = e instanceof ApiError ? e.details.field : undefined;
      if (
        e instanceof ApiError &&
        e.code === 'PROFESSIONAL_PROFILE_INVALID' &&
        field &&
        isField(field)
      )
        showFieldErrors({ [field]: profileFieldMessages[field] });
      else
        setFailure({
          message: e instanceof Error ? e.message : 'Não foi possível salvar o perfil.',
          conflict: e instanceof ApiError && e.code === 'RECORD_VERSION_CONFLICT',
        });
      onError(e);
    } finally {
      setSaving(false);
    }
  }
  const missing = missingFieldsSentence(saved.missingFields);
  const fieldProps = { values, errors, onChange: change };
  return (
    <div className="professional-profile">
      {back ? (
        <Button
          icon={ArrowLeft}
          className="secondary"
          disabled={dirty || saving}
          aria-describedby={dirty ? lockReason : undefined}
          onClick={back.onReturn}
        >
          {back.label}
        </Button>
      ) : null}
      <section className="panel" aria-labelledby="professional-profile-title">
        <div className="section-heading">
          <h2 id="professional-profile-title">Perfil profissional</h2>
          <span className={saved.complete ? 'status' : 'status pending'}>
            {saved.complete ? 'Perfil completo' : 'Perfil incompleto'}
          </span>
        </div>
        <p>
          Seus dados como responsável técnico nesta empresa. Ao aprovar um furo, o nome, o título e
          o CREA são copiados para o furo e saem no relatório.
        </p>
        {!saved.complete ? (
          <p className="profile-missing">
            {saved.version === 0 ? 'Você ainda não cadastrou seu perfil profissional. ' : ''}
            Para aprovar furos, falta preencher: {missing}.
          </p>
        ) : null}
        <form onSubmit={(event) => void submit(event)} aria-busy={saving} noValidate>
          <fieldset disabled={saving || reloading}>
            <section className="profile-section" aria-labelledby="profile-report-title">
              <h3 id="profile-report-title">Responsável técnico</h3>
              <p className="help">Saem no relatório dos furos que você aprovar.</p>
              <ProfileTextField
                {...fieldProps}
                field="fullName"
                label="Nome completo"
                autoComplete="name"
              />
              <ProfileTextField
                {...fieldProps}
                field="professionalTitle"
                label="Título profissional"
                help="Como no registro, por exemplo: Engenheiro Civil."
                autoComplete="organization-title"
              />
              <div className="field-pair">
                <ProfileTextField
                  {...fieldProps}
                  field="creaNumber"
                  label="Número do CREA"
                  help={
                    <>
                      Só o número, com o sufixo se houver, como{' '}
                      <span className="profile-example">506123456-D</span>.
                    </>
                  }
                  autoComplete="off"
                />
                <ProfileStateField {...fieldProps} field="creaUf" label="UF do CREA" />
              </div>
            </section>
            <section className="profile-section" aria-labelledby="profile-contact-title">
              <h3 id="profile-contact-title">Contato</h3>
              <p className="help">Ficam guardados no seu perfil e não saem no PDF do relatório.</p>
              <ProfileTextField
                {...fieldProps}
                field="phone"
                label="Telefone"
                optional
                type="tel"
                help="Com DDD."
                autoComplete="tel"
              />
              <ProfileTextField
                {...fieldProps}
                field="professionalEmail"
                label="Email profissional"
                optional
                type="email"
                autoComplete="email"
              />
            </section>
            {message ? (
              <p className="notice profile-saved" role="status">
                {message}
              </p>
            ) : null}
            <div className="form-actions">
              <Button icon={Save} type="submit" loading={saving}>
                {saving ? 'Salvando…' : 'Salvar perfil'}
              </Button>
              {dirty ? (
                <Button
                  icon={RotateCcw}
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setValues(initial);
                    setErrors({});
                    setFailure(null);
                  }}
                >
                  Descartar alterações
                </Button>
              ) : null}
            </div>
          </fieldset>
        </form>
        {failure ? (
          <div className="error" role="alert" tabIndex={-1} ref={failureRef}>
            <p>{failure.message}</p>
            {failure.conflict ? (
              <Button
                icon={RefreshCw}
                className="secondary"
                disabled={saving || reloading}
                onClick={() => {
                  setFailure(null);
                  onReload();
                }}
              >
                Recarregar perfil e descartar alterações
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
function isField(field: string): field is ProfileFieldName {
  return (profileFieldOrder as readonly string[]).includes(field);
}
