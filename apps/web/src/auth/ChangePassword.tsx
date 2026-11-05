import { KeyRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '../ui/Button';
import { auth } from './client';

export function ChangePassword({ onError }: { onError: (error: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const newPassword = String(values.get('newPassword'));
    setError('');
    setMessage('');
    if (newPassword !== String(values.get('confirmPassword'))) {
      setError('A confirmação não corresponde à nova senha.');
      return;
    }
    setBusy(true);
    try {
      await auth.request('/auth/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: String(values.get('currentPassword')),
          newPassword,
        }),
      });
      form.reset();
      setMessage('Senha alterada. As outras sessões foram encerradas; esta continua ativa.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível alterar a senha.');
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel account-password" aria-labelledby="password-title">
      <h2 id="password-title">Trocar senha</h2>
      <p>As outras sessões da sua conta serão encerradas. Esta sessão continua ativa.</p>
      <form onSubmit={submit} aria-busy={busy}>
        <fieldset disabled={busy}>
          <label htmlFor="current-password">Senha atual</label>
          <input
            id="current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            maxLength={1024}
          />
          <label htmlFor="new-password">Nova senha</label>
          <input
            id="new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            aria-describedby="new-password-help"
          />
          <p id="new-password-help" className="help">
            Use de 12 a 128 caracteres.
          </p>
          <label htmlFor="repeat-password">Confirme a nova senha</label>
          <input
            id="repeat-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            maxLength={128}
          />
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="notice" role="status">
              {message}
            </p>
          ) : null}
          <Button icon={KeyRound} type="submit" loading={busy}>
            {busy ? 'Aguarde…' : 'Alterar senha'}
          </Button>
        </fieldset>
      </form>
    </section>
  );
}
