import type { Profile } from '../auth/client';

/** Local test access only: switches the dedicated account between the five roles. */
export function DevelopmentToolbar({
  role,
  disabled,
  message,
  onSwitch,
}: {
  role: Profile['role'];
  disabled: boolean;
  message: string;
  onSwitch: (role: Profile['role']) => void;
}) {
  return (
    <section className="development-toolbar" aria-label="Teste local">
      <p>Acesso de teste local</p>
      <label htmlFor="test-role">Perfil de teste</label>
      <select
        id="test-role"
        value={role}
        disabled={disabled}
        onChange={(e) => onSwitch(e.target.value as Profile['role'])}
      >
        <option value="ADMIN">Administrador</option>
        <option value="ENGINEER">Engenheiro</option>
        <option value="OPERATOR">Sondador</option>
        <option value="COMMERCIAL">Comercial</option>
        <option value="VIEWER">Consulta</option>
      </select>
      {message ? <p role="alert">{message}</p> : null}
    </section>
  );
}
