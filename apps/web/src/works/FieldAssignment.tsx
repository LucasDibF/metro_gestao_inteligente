import { useState } from 'react';
import { auth } from '../auth/client';
import { Button } from '../ui/Button';
import { LoadingState } from '../ui/LoadingState';
interface Assignment {
  operatorId: string;
  active: boolean;
  version: number;
}
interface Team {
  assignment: Assignment | null;
  operators: Array<{ userId: string; email: string }>;
}
export function FieldAssignment({
  workId,
  onError,
}: {
  workId: string;
  onError: (error: unknown) => void;
}) {
  const [team, setTeam] = useState<Team | null>(null),
    [operator, setOperator] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const base = `/obras/${workId}/equipe-campo`;
  async function load() {
    setBusy(true);
    setError('');
    try {
      const data = await auth.request<Team>(base);
      setTeam(data);
      setOperator(data.assignment?.active ? data.assignment.operatorId : '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível consultar a equipe.');
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const assignment = await auth.request<Assignment | null>(base, {
        method: 'PUT',
        body: JSON.stringify({
          operatorId: operator || null,
          version: team?.assignment?.version ?? 0,
        }),
      });
      setTeam((current) => (current ? { ...current, assignment } : null));
      setMessage(operator ? 'Obra atribuída ao sondador.' : 'Atribuição removida.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível atribuir a obra.');
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="panel"
      onToggle={(e) => {
        if (e.currentTarget.open && !team && !busy) void load();
      }}
    >
      <summary>Equipe de campo</summary>
      <p>
        Escolha o sondador responsável. No aplicativo, ele verá somente as obras atribuídas a ele.
      </p>
      {busy && !team ? <LoadingState>Carregando sondadores…</LoadingState> : null}
      {team ? (
        <>
          <label htmlFor="work-operator">Sondador responsável</label>
          <select
            id="work-operator"
            value={operator}
            disabled={busy}
            onChange={(e) => setOperator(e.target.value)}
          >
            <option value="">Sem sondador atribuído</option>
            {team.operators.map((item) => (
              <option key={item.userId} value={item.userId}>
                {item.email}
              </option>
            ))}
          </select>
          <div className="form-actions">
            <Button onClick={() => void save()} loading={busy}>
              Salvar responsável
            </Button>
          </div>
        </>
      ) : null}
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <Button className="secondary" disabled={busy} onClick={() => void load()}>
            Recarregar equipe
          </Button>
        </div>
      ) : null}
      {message ? (
        <p role="status" className="notice">
          {message}
        </p>
      ) : null}
    </details>
  );
}
