import { Brand } from '../ui/Brand';
import { Button } from '../ui/Button';
import { LogIn } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { auth } from './client';

export function Login({
  onLogin,
  onTestLogin,
}: {
  onLogin: () => Promise<void>;
  onTestLogin?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    setError('');
    try {
      await auth.login({
        email: String(values.get('email')),
        password: String(values.get('password')),
        tenantId: String(values.get('tenantId')).trim(),
        mfaCode: String(values.get('mfaCode')).trim() || undefined,
      });
      await onLogin();
      form.reset();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="access-layout">
      <section className="access-form" aria-labelledby="login-title">
        <div className="login-brand">
          <Brand />
        </div>
        <h1 id="login-title">Entre na sua conta</h1>
        <p>Informe seus dados para continuar.</p>
        <form onSubmit={submit} aria-busy={busy}>
          <fieldset disabled={busy}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
              placeholder="voce@empresa.com.br"
            />
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={1024}
            />
            <label htmlFor="tenantId">ID da empresa</label>
            <input
              id="tenantId"
              name="tenantId"
              required
              pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
              aria-describedby="tenant-help"
            />
            <p id="tenant-help" className="help">
              Use o identificador fornecido pelo administrador.
            </p>
            <details>
              <summary>Uso autenticação em duas etapas</summary>
              <label htmlFor="mfaCode">Código do autenticador ou de recuperação</label>
              <input
                id="mfaCode"
                name="mfaCode"
                autoComplete="one-time-code"
                maxLength={32}
                spellCheck={false}
              />
              <p className="help">
                Informe o código atual ou um código de recuperação ainda não utilizado.
              </p>
            </details>
            {error ? (
              <p className="error" role="alert">
                {error}
              </p>
            ) : null}
            <Button icon={LogIn} loading={busy} className="primary" type="submit">
              {busy ? 'Entrando…' : 'Entrar'}
            </Button>
          </fieldset>
        </form>
        {onTestLogin ? (
          <Button
            type="button"
            className="secondary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await onTestLogin();
              } catch (error) {
                setError(
                  error instanceof Error
                    ? error.message
                    : 'Não foi possível iniciar o acesso de teste.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Entrar no ambiente de teste
          </Button>
        ) : null}
        <p className="access-note">Precisa de acesso? Procure o administrador da sua empresa.</p>
      </section>
    </main>
  );
}
