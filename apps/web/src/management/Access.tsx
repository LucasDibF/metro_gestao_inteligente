import { useEffect, useState, type FormEvent } from 'react';
import { UserPlus, Save, X, Pencil, RefreshCw } from 'lucide-react';
import { auth, type Profile } from '../auth/client';
import { roleNames, type Role } from '../auth/permissions';
import { Button } from '../ui/Button';
import { LoadingState } from '../ui/LoadingState';
interface Member {
  userId: string;
  email: string;
  role: Role;
  additionalRoles: Role[];
  active: boolean;
  canDownloadReports: boolean;
  version: number;
}
export function Access({
  profile,
  onError,
  onEditingChange,
  onProfileChanged,
}: {
  profile: Profile;
  onError: (e: unknown) => void;
  onEditingChange?: (editing: boolean) => void;
  onProfileChanged: () => void;
}) {
  const [items, setItems] = useState<Member[] | null>(null),
    [editing, setEditing] = useState<Member | 'new' | null>(null),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  useEffect(() => {
    onEditingChange?.(Boolean(editing));
    return () => onEditingChange?.(false);
  }, [editing, onEditingChange]);
  useEffect(() => {
    let active = true;
    auth
      .request<{ items: Member[] }>('/acessos')
      .then((value) => {
        if (active) setItems(value.items);
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
  }, [revision]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget),
      create = editing === 'new';
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await auth.request('/acessos' + (create ? '' : '/' + editing.userId), {
        method: create ? 'POST' : 'PUT',
        body: JSON.stringify({
          roles: form.getAll('roles'),
          canDownloadReports: form.has('download'),
          ...(create
            ? { email: form.get('email'), password: form.get('password') }
            : { version: editing.version, active: form.has('active') }),
        }),
      });
      setEditing(null);
      setRevision((value) => value + 1);
      setMessage(
        create
          ? 'Login criado. Informe as credenciais ao usuário pelo canal que você utiliza.'
          : 'Permissões atualizadas.',
      );
      onProfileChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o acesso.');
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  const current = editing && editing !== 'new' ? editing : null;
  return (
    <section aria-labelledby="access-title">
      <div className="section-heading">
        <div>
          <h2 id="access-title">Acessos da empresa</h2>
          <p>Defina quem pode entrar e quais responsabilidades cada pessoa assume.</p>
        </div>
        {!editing ? (
          <Button
            icon={UserPlus}
            onClick={() => {
              setEditing('new');
              setError('');
              setMessage('');
            }}
          >
            Criar login
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="notice">
          {message}
        </p>
      ) : null}
      {editing ? (
        <form className="panel management-form" key={current?.userId ?? 'new'} onSubmit={save}>
          <h3>{current ? 'Editar acesso · ' + current.email : 'Novo login'}</h3>
          <fieldset disabled={busy}>
            {!current ? (
              <>
                <label htmlFor="access-email">Email do usuário</label>
                <input
                  id="access-email"
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="off"
                />
                <label htmlFor="access-password">Senha inicial</label>
                <input
                  id="access-password"
                  name="password"
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                />
                <p className="help">
                  Use de 12 a 128 caracteres. A senha não será exibida na lista.
                </p>
              </>
            ) : null}
            <fieldset className="management-roles">
              <legend>Responsabilidades</legend>
              <p className="help">
                Selecione uma ou mais. Administrador não recebe atribuições técnicas
                automaticamente.
              </p>
              {Object.entries(roleNames).map(([role, label]) => (
                <label key={role}>
                  <input
                    type="checkbox"
                    name="roles"
                    value={role}
                    defaultChecked={
                      current
                        ? [current.role, ...current.additionalRoles].includes(role as Role)
                        : role === 'OPERATOR'
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            <label className="management-check">
              <input
                type="checkbox"
                name="download"
                defaultChecked={current?.canDownloadReports ?? true}
              />
              Permitir download quando o perfil tiver acesso aos relatórios
            </label>
            <p className="help">
              Essa opção não autoriza aprovar ou emitir. Para consulta de relatórios pelo sondador,
              atribua também o perfil Consulta.
            </p>
            {current ? (
              <label className="management-check">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={current.active}
                  disabled={current.userId === profile.userId}
                />
                Acesso ativo nesta empresa
                {current.userId === profile.userId ? (
                  <input type="hidden" name="active" value="on" />
                ) : null}
              </label>
            ) : null}
            <div className="form-actions">
              <Button icon={Save}>{busy ? 'Salvando…' : 'Salvar acesso'}</Button>
              <Button type="button" icon={X} className="secondary" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
            </div>
          </fieldset>
        </form>
      ) : null}
      {!items ? (
        <LoadingState>Carregando acessos…</LoadingState>
      ) : (
        <>
          <p className="help">{items.length} acesso(s) nesta empresa</p>
          <ul className="work-list">
            {items.map((member) => (
              <li key={member.userId}>
                <div>
                  <h3>{member.email}</h3>
                  <p>
                    {[member.role, ...member.additionalRoles]
                      .map((role) => roleNames[role])
                      .join(' · ')}{' '}
                    · {member.active ? 'Ativo' : 'Desativado'}
                  </p>
                  <p className="help">
                    Download de relatórios:{' '}
                    {member.canDownloadReports &&
                    [member.role, ...member.additionalRoles].some((role) => role !== 'OPERATOR')
                      ? 'permitido'
                      : 'bloqueado'}
                  </p>
                </div>
                <Button
                  icon={Pencil}
                  className="secondary"
                  disabled={busy || Boolean(editing)}
                  onClick={() => {
                    setEditing(member);
                    setError('');
                  }}
                >
                  Editar acesso<span className="sr-only"> {member.email}</span>
                </Button>
              </li>
            ))}
          </ul>
          <Button
            icon={RefreshCw}
            className="secondary"
            disabled={busy || Boolean(editing)}
            onClick={() => setRevision((value) => value + 1)}
          >
            Atualizar acessos
          </Button>
        </>
      )}
    </section>
  );
}
