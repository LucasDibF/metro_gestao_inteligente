const { load, fs, path, save } = require('./common.cjs');
const { Client } = require('pg');
async function main() {
  const { config, env } = load();
  const file = path.join(config.dir, 'actors-private.json');
  const manifest = JSON.parse(fs.readFileSync(file));
  const actor = manifest.actors[1];
  const db = new Client({ connectionString: env.MIGRATION_DATABASE_URL });
  await db.connect();
  let folderId;
  const call = async (route, body, method = body ? 'PUT' : 'GET') => {
    const r = await fetch(config.base + route, {
      method,
      headers: { Authorization: 'Bearer ' + actor.accessToken, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  try {
    const login = await fetch(config.base + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: actor.email,
        password: manifest.password,
        tenantId: actor.tenantId,
      }),
    });
    if (!login.ok) throw Error('Reproduction login failed');
    const tokens = await login.json();
    actor.accessToken = tokens.accessToken;
    actor.refreshToken = tokens.refreshToken;
    actor.authAt = Date.now();
    const base = `/obras/${actor.workId}/furos/${actor.holeId}/tecnico`;
    const value = await db.query('SELECT folder_id FROM boreholes WHERE id=$1 AND tenant_id=$2', [
      actor.holeId,
      actor.tenantId,
    ]);
    folderId = value.rows[0]?.folder_id;
    if (!folderId) throw Error('Expected own synthetic hole in folder');
    const edit = async () => {
      const state = await call(base);
      if (state.status !== 200) throw Error('Cannot read synthetic hole');
      return call(base, {
        technicalVersion: state.data.hole.technicalVersion,
        executedDepthM: '4',
        waterLevelM: '1.5',
        fieldDate: '2026-11-02',
      });
    };
    const inFolder = await edit();
    await db.query('UPDATE boreholes SET folder_id=NULL WHERE id=$1 AND tenant_id=$2', [
      actor.holeId,
      actor.tenantId,
    ]);
    const noFolder = await edit();
    if (noFolder.status === 200) actor.successfulFieldEdits++;
    save(path.join(config.dir, 'operator-reproduction.json'), {
      singleUser: true,
      role: 'OPERATOR',
      sameSyntheticBorehole: true,
      inFolderStatus: inFolder.status,
      noFolderStatus: noFolder.status,
      expected: { inFolder: 200, noFolder: 200 },
      conclusion:
        inFolder.status === 500 && noFolder.status === 200
          ? 'Functional folder lock/RLS failure reproduced without concurrent load'
          : 'Inspect reproduction',
      temporaryFolderDetachment: 'Only own synthetic borehole; restored in finally',
    });
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2), { mode: 0o600 });
    console.log(
      'Single OPERATOR: in folder=' + inFolder.status + ', without folder=' + noFolder.status,
    );
  } finally {
    if (folderId) {
      await db.query('UPDATE boreholes SET folder_id=$1 WHERE id=$2 AND tenant_id=$3', [
        folderId,
        actor.holeId,
        actor.tenantId,
      ]);
      const check = await db.query('SELECT folder_id FROM boreholes WHERE id=$1', [actor.holeId]);
      if (check.rows[0].folder_id !== folderId) throw Error('Synthetic folder restoration failed');
    }
    await db.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
