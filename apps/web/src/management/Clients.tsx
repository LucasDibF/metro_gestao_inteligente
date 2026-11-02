import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Save, X, Pencil, ArrowLeft, ArrowRight } from 'lucide-react';
import { auth, type Profile } from '../auth/client';
import { hasRole } from '../auth/permissions';
import { Button } from '../ui/Button';
import { LoadingState } from '../ui/LoadingState';
interface Client {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  version: number;
}
export function Clients({ profile, onError }: { profile: Profile; onError: (e: unknown) => void }) {
  const [data, setData] = useState<{ items: Client[]; total: number } | null>(null),
    [editing, setEditing] = useState<Client | 'new' | null>(null),
    [q, setQ] = useState(''),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const canWrite = hasRole(profile, 'COMMERCIAL', 'ENGINEER');
  useEffect(() => {
    let active = true;
    auth
      .request<{ items: Client[]; total: number }>(
        `/clientes?page=${page}&q=${encodeURIComponent(q)}`,
      )
      .then((value) => {
        if (active) setData(value);
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
  }, [page, q, revision]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget),
      current = editing === 'new' ? null : editing;
    setBusy(true);
    setError('');
    try {
      await auth.request('/clientes' + (current ? '/' + current.id : ''), {
        method: current ? 'PUT' : 'POST',
        body: JSON.stringify({
          ...Object.fromEntries(['name','document','email','phone','address'].map(key=>[key,String(form.get(key)??'')])),
          ...(current ? { version: current.version } : {}),
        }),
      });
      setEditing(null);
      setRevision((v) => v + 1);
      setMessage('Cliente salvo.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  const current = editing && editing !== 'new' ? editing : null;
  return (
    <section aria-labelledby="clients-title">
      <div className="section-heading">
        <div>
          <h2 id="clients-title">Clientes</h2>
          <p>Organize os contatos e dados comerciais dos seus clientes.</p>
        </div>
        {canWrite && !editing ? (
          <Button
            icon={Plus}
            onClick={() => {
              setEditing('new');
              setMessage('');
              setError('');
            }}
          >
            Cadastrar cliente
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
        <form className="panel management-form" key={current?.id ?? 'new'} onSubmit={save}>
          <h3>{current ? 'Editar informações do cliente' : 'Novo cliente'}</h3>
          <fieldset disabled={busy}>
            {(
              [
                ['name', 'Nome ou razão social', 200],
                ['document', 'CPF / CNPJ (opcional)', 40],
                ['email', 'Email (opcional)', 254],
                ['phone', 'Telefone (opcional)', 40],
                ['address', 'Endereço (opcional)', 500],
              ] as const
            ).map(([key, label, max]) => (
              <div key={key}>
                <label htmlFor={'client-' + key}>{label}</label>
                <input
                  id={'client-' + key}
                  name={key}
                  type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
                  required={key === 'name'}
                  maxLength={max}
                  defaultValue={current?.[key] ?? ''}
                />
              </div>
            ))}
            <div className="form-actions">
              <Button icon={Save}>{busy ? 'Salvando…' : 'Salvar cliente'}</Button>
              <Button type="button" icon={X} className="secondary" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
            </div>
          </fieldset>
        </form>
      ) : null}
      <label htmlFor="client-query">Buscar cliente</label>
      <input
        id="client-query"
        type="search"
        maxLength={100}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
      />
      {!data ? (
        <LoadingState>Carregando clientes…</LoadingState>
      ) : (
        <>
          <p className="help">{data.total} cliente(s) encontrado(s)</p>
          {!data.items.length ? (
            <p>Nenhum cliente encontrado.</p>
          ) : (
            <ul className="work-list">
              {data.items.map((client) => (
                <li key={client.id}>
                  <div>
                    <h3>{client.name}</h3>
                    <p>
                      {[client.document, client.email, client.phone].filter(Boolean).join(' · ') ||
                        'Sem contato adicional'}
                    </p>
                    {client.address ? <p>{client.address}</p> : null}
                  </div>
                  {canWrite ? (
                    <Button
                      icon={Pencil}
                      className="secondary"
                      disabled={busy || Boolean(editing)}
                      onClick={() => setEditing(client)}
                    >
                      Editar informações<span className="sr-only"> de {client.name}</span>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <div className="pagination">
            <Button
              icon={ArrowLeft}
              className="secondary"
              disabled={page === 1 || busy}
              onClick={() => setPage((v) => v - 1)}
            >
              Anterior
            </Button>
            <span>Página {page}</span>
            <Button
              icon={ArrowRight}
              className="secondary"
              disabled={page * 20 >= data.total || busy}
              onClick={() => setPage((v) => v + 1)}
            >
              Próxima
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
