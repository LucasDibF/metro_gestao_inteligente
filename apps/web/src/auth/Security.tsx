import { Button } from '../ui/Button';
import { ArrowLeft, Check } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { auth, type Enrollment, type Profile } from './client';

export function Security({
  profile,
  onSignedOut,
  onError,
  onRecovery,
}: {
  profile: Profile;
  onSignedOut: (message: string) => void;
  onError: (error: unknown) => void;
  onRecovery: () => void;
}) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    setError('');
    try {
      const input = {
        password: String(values.get('password')),
        code: String(values.get('code')).trim(),
      };
      if (profile.mfaEnabled) {
        await auth.request('/auth/mfa/disable', { method: 'POST', body: JSON.stringify(input) });
        auth.clear();
        onSignedOut('Autenticação em duas etapas desativada. Entre novamente.');
      } else if (enrollment) {
        const result = await auth.request<{ recoveryCodes: string[] }>('/auth/mfa/enable', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        auth.clear();
        setEnrollment(null);
        setCodes(result.recoveryCodes);
        onRecovery();
      } else {
        setEnrollment(
          await auth.request<Enrollment>('/auth/mfa/setup', {
            method: 'POST',
            body: JSON.stringify(input),
          }),
        );
      }
      form.reset();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível concluir.');
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  if (codes.length)
    return (
      <section className="panel" aria-labelledby="recovery-title">
        <h2 id="recovery-title">Guarde seus códigos de recuperação</h2>
        <p>
          A autenticação em duas etapas foi ativada. Cada código pode ser usado uma vez. Eles não
          serão exibidos novamente.
        </p>
        <ul className="recovery-codes">
          {codes.map((code) => (
            <li key={code}>
              <code>{code}</code>
            </li>
          ))}
        </ul>
        <p>
          Guarde-os em um local privado, separado da sua senha. Não recarregue a página antes de
          salvá-los.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={saved}
            onChange={(event) => setSaved(event.target.checked)}
          />{' '}
          Guardei os códigos em um local seguro.
        </label>
        <Button
          icon={ArrowLeft}
          disabled={!saved}
          onClick={() => {
            setCodes([]);
            onSignedOut(
              'MFA ativado. Entre com o próximo código do autenticador ou um código de recuperação.',
            );
          }}
        >
          Voltar ao acesso
        </Button>
      </section>
    );
  return (
    <section className="panel" aria-labelledby="security-title">
      <div className="section-heading">
        <h2 id="security-title">Segurança da conta</h2>
        <span className="status">{profile.mfaEnabled ? 'MFA ativado' : 'MFA desativado'}</span>
      </div>
      <p>
        {profile.mfaEnabled
          ? 'Para desativar a autenticação em duas etapas, confirme sua senha e um código válido. Todas as suas sessões serão encerradas.'
          : 'Adicione uma confirmação pelo aplicativo autenticador para proteger sua conta.'}
      </p>
      {enrollment ? (
        <div className="setup">
          <h3>Adicione ao seu autenticador</h3>
          <p>
            No aplicativo, cadastre uma chave manualmente: TOTP, 6 dígitos, período de 30 segundos.
          </p>
          <label htmlFor="secret">Chave de configuração</label>
          <input
            id="secret"
            value={enrollment.secret}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
          <p className="help">
            Esta configuração expira em cinco minutos. Depois, informe o código gerado pelo
            aplicativo.
          </p>
          <Button
            type="button"
            className="secondary"
            onClick={() => {
              setEnrollment(null);
              setError('');
            }}
          >
            Reiniciar configuração
          </Button>
        </div>
      ) : null}
      <form onSubmit={submit} aria-busy={busy}>
        <fieldset disabled={busy}>
          <label htmlFor="confirm-password">Confirme sua senha</label>
          <input
            id="confirm-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          {enrollment || profile.mfaEnabled ? (
            <>
              <label htmlFor="confirm-code">
                {profile.mfaEnabled
                  ? 'Código do autenticador ou de recuperação'
                  : 'Código do autenticador'}
              </label>
              <input
                id="confirm-code"
                name="code"
                autoComplete="one-time-code"
                required
                maxLength={32}
              />
            </>
          ) : null}
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <Button icon={Check} type="submit" className={profile.mfaEnabled ? 'danger' : ''}>
            {busy
              ? 'Aguarde…'
              : profile.mfaEnabled
                ? 'Desativar MFA e sair'
                : enrollment
                  ? 'Confirmar e ativar MFA'
                  : 'Configurar autenticação em duas etapas'}
          </Button>
        </fieldset>
      </form>
    </section>
  );
}
