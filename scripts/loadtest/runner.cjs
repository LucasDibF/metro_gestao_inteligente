const { fs, path, repo, run, load, sleep, save } = require('./common.cjs');
const { createHash, randomUUID, randomBytes } = require('node:crypto');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execAsync = promisify(execFile);
const { Client } = require('pg');
const sharp = require('sharp');
const { config, env } = load();
const privateFile = path.join(config.dir, 'actors-private.json');
const manifest = JSON.parse(fs.readFileSync(privateFile, 'utf8'));
const previous = fs.existsSync(path.join(config.dir, 'progress.json'))
  ? JSON.parse(fs.readFileSync(path.join(config.dir, 'progress.json'), 'utf8'))
  : {};
const records = fs.existsSync(path.join(config.dir, 'requests.ndjson'))
    ? fs
        .readFileSync(path.join(config.dir, 'requests.ndjson'), 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [],
  stages = previous.stages || [],
  resources = [],
  artifacts = previous.artifacts || [],
  assertions = previous.assertions || [];
let phase = 'setup',
  measuring = false,
  stopped = false,
  resourceBusy = false,
  resourceTimer;
const eventLoop = monitorEventLoopDelay({ resolution: 20 });
eventLoop.enable();
const startedAt = Date.now();
const cpuStart = process.cpuUsage();
const rawFile = path.join(config.dir, 'requests.ndjson');
const db = new Client({
  connectionString: env.MIGRATION_DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
function normalRoute(url) {
  return url.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, ':id').replace(/\?.*$/, '');
}
const { summary } = require('./metrics.cjs');
function checkpoint() {
  fs.writeFileSync(privateFile, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  save(path.join(config.dir, 'progress.json'), {
    phase,
    stopped,
    elapsedSeconds: (Date.now() - startedAt) / 1000,
    stages,
    artifacts,
    assertions,
    resourceSamples: resources.length,
    requests: records.length,
  });
}
async function request(actor, route, body, method = body ? 'POST' : 'GET', options = {}) {
  const requestPhase = phase,
    requestMeasured = measuring,
    requestStartedAt = Date.now();
  const start = performance.now();
  let status = 0,
    data = null,
    bytes = 0,
    errorCode = null,
    retryAfter = null,
    valid = true;
  try {
    const response = await fetch(config.base + route, {
      method,
      headers: {
        ...(actor?.accessToken ? { Authorization: 'Bearer ' + actor.accessToken } : {}),
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(options.timeout || 15000),
    });
    status = response.status;
    retryAfter = response.headers.get('retry-after');
    if (options.binary) {
      data = Buffer.from(await response.arrayBuffer());
      bytes = data.length;
      if (
        response.ok &&
        options.hash &&
        createHash('sha256').update(data).digest('hex') !== response.headers.get('x-content-sha256')
      )
        valid = false;
    } else {
      const text = await response.text();
      bytes = Buffer.byteLength(text);
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    if (status >= 200 && status < 300 && options.validate) valid = Boolean(options.validate(data));
    if (status >= 400) errorCode = data?.code || data?.error || 'HTTP_' + status;
  } catch (error) {
    errorCode = error.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK';
  }
  const row = {
    at: requestStartedAt,
    phase: requestPhase,
    measured: requestMeasured,
    ...(actor ? { actorIndex: actor.index, role: actor.role } : {}),
    method,
    route: normalRoute(route),
    ms: performance.now() - start,
    status,
    valid,
    bytes,
    ...(errorCode ? { errorCode } : {}),
    expected: Boolean(options.expectedStatus && status === options.expectedStatus),
  };
  records.push(row);
  fs.appendFileSync(rawFile, JSON.stringify(row) + '\n');
  return { status, data, valid, retryAfter, ms: row.ms };
}
async function required(actor, route, body, method, options = {}) {
  const r = await request(actor, route, body, method, options);
  if (r.status === 429 && options.safeRetry) {
    if ((options.retryAttempt || 0) >= 3)
      throw Error('Preparation retry budget exhausted on ' + normalRoute(route));
    const delay = Math.min(60000, Math.max(1000, Number(r.retryAfter || 60) * 1000));
    console.log('Rate limit during preparation: waiting ' + delay + ' ms');
    await sleep(delay);
    return required(actor, route, body, method, {
      ...options,
      retryAttempt: (options.retryAttempt || 0) + 1,
    });
  }
  if (r.status < 200 || r.status >= 300 || !r.valid)
    throw Error(
      `Unexpected ${r.status} on ${method || (body ? 'POST' : 'GET')} ${normalRoute(route)}`,
    );
  return r.data;
}
async function login(actor) {
  if (actor.accessToken) return;
  const tokens = await required(
    null,
    '/auth/login',
    { email: actor.email, password: manifest.password, tenantId: actor.tenantId },
    'POST',
    { safeRetry: true },
  );
  actor.accessToken = tokens.accessToken;
  actor.refreshToken = tokens.refreshToken;
  actor.authAt = Date.now();
  checkpoint();
}
async function resourceSample() {
  if (resourceBusy) return;
  resourceBusy = true;
  try {
    const result = await execAsync(
      'docker',
      [
        'stats',
        '--no-stream',
        '--format',
        '{{json .}}',
        'metro-loadtest-api',
        'metro-loadtest-worker',
        'metro-loadtest-db',
        'metro-loadtest-storage',
      ],
      { timeout: 10000, maxBuffer: 1024 * 1024 },
    );
    const containers = result.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const state = await db.query(
      "SELECT count(*)::int AS connections,count(*) FILTER (WHERE state='active')::int AS active,count(*) FILTER (WHERE wait_event_type='Lock')::int AS waiting_locks FROM pg_stat_activity WHERE datname='spt_loadtest'",
    );
    const cpu = process.cpuUsage(cpuStart),
      elapsed = (Date.now() - startedAt) / 1000;
    resources.push({
      at: Date.now(),
      phase,
      containers,
      database: state.rows[0],
      generator: {
        rssMiB: process.memoryUsage().rss / 2 ** 20,
        cpuPercentAverageOneCore: ((cpu.user + cpu.system) / (elapsed * 1e6)) * 100,
        eventLoopP99Ms: eventLoop.percentile(99) / 1e6,
      },
    });
    save(path.join(config.dir, 'resources.json'), resources);
  } catch (error) {
    resources.push({ at: Date.now(), phase, monitorError: error.code || error.name });
  } finally {
    resourceBusy = false;
  }
}
async function editSpt(actor) {
  const base = `/obras/${actor.workId}/furos/${actor.holeId}`;
  const state = await request(actor, base + '/tecnico');
  if (state.status !== 200) return;
  const record = state.data.tests.find((t) => Number(t.depthM) === 2);
  if (!record) throw Error('Seeded record disappeared');
  const r = await request(
    actor,
    base + '/ensaios/' + record.id,
    {
      depthM: '2',
      version: record.version,
      technicalVersion: state.data.hole.technicalVersion,
      advances: [4, 6, 8].map((blows) => ({ blows, penetrationMm: 150 })),
      soil: {
        soilType: 'Areia fina',
        description: 'CARGA edição sintética ' + (actor.successfulSptEdits + 1),
        soilColor: 'marrom',
        soilMoisture: 'Úmida',
      },
      fieldDetails: { executionMethod: 'TH', sampleRecovery: 'INTEGRA' },
    },
    'PUT',
    { validate: (v) => v?.id === record.id && v?.version === record.version + 1 },
  );
  if (r.status === 200 && r.valid) actor.successfulSptEdits++;
}
async function editFields(actor) {
  const base = `/obras/${actor.workId}/furos/${actor.holeId}/tecnico`;
  const state = await request(actor, base);
  if (state.status !== 200) return;
  const r = await request(
    actor,
    base,
    {
      technicalVersion: state.data.hole.technicalVersion,
      executedDepthM: '4',
      waterLevelM: '1.5',
      fieldDate: '2026-11-02',
    },
    'PUT',
    { validate: (v) => v?.id === actor.holeId },
  );
  if (r.status === 200 && r.valid) actor.successfulFieldEdits++;
}
async function journey(actor, step) {
  if (Date.now() - actor.authAt > 600000) {
    const result = await request(
      null,
      '/auth/refresh',
      { refreshToken: actor.refreshToken },
      'POST',
    );
    if (result.status !== 200) {
      stopped = true;
      throw Error('Session refresh blocked; stop instead of hiding authentication failure');
    }
    actor.accessToken = result.data.accessToken;
    actor.refreshToken = result.data.refreshToken;
    actor.authAt = Date.now();
  }
  const hole = `/obras/${actor.workId}/furos/${actor.holeId}`;
  if (actor.role === 'COMMERCIAL') {
    if (step % 10 === 6) {
      const r = await request(actor, '/obras', {
        name: `CARGA ${config.runId} comercial ${actor.index}-${actor.successfulWorkCreates + 1}`,
        clientName: 'Cliente sintético',
        city: 'Natal',
        state: 'RN',
      });
      if (r.status === 201 && r.valid) actor.successfulWorkCreates++;
    } else if (step % 3 === 0)
      await request(actor, '/workspace/resumo', undefined, 'GET', {
        validate: (v) => v && typeof v === 'object',
      });
    else if (step % 3 === 1)
      await request(actor, '/obras?page=1', undefined, 'GET', {
        validate: (v) =>
          Array.isArray(v?.items) && v.items.every((w) => w.tenantId === actor.tenantId),
      });
    else
      await request(actor, `/obras/${actor.workId}/furos?page=1`, undefined, 'GET', {
        validate: (v) => Array.isArray(v?.items) && v.items.some((h) => h.id === actor.holeId),
      });
    return;
  }
  switch (step % 10) {
    case 0:
      await request(actor, '/obras?page=1', undefined, 'GET', {
        validate: (v) => Array.isArray(v?.items),
      });
      break;
    case 1:
      await request(actor, '/workspace/resumo', undefined, 'GET', {
        validate: (v) => v && typeof v === 'object',
      });
      break;
    case 2:
      await request(actor, `/obras/${actor.workId}/furos?page=1`, undefined, 'GET', {
        validate: (v) => v?.items?.some((h) => h.id === actor.holeId),
      });
      break;
    case 3:
      await request(actor, hole + '/ensaios', undefined, 'GET', {
        validate: (v) => v?.items?.length === 4,
      });
      break;
    case 4:
      await request(actor, hole + '/tecnico', undefined, 'GET', {
        validate: (v) => v?.hole?.id === actor.holeId && v?.tests?.length === 4,
      });
      break;
    case 5:
      await request(actor, hole + '/arquivos', undefined, 'GET', {
        validate: (v) => Array.isArray(v?.photos),
      });
      break;
    case 6:
      await editSpt(actor);
      break;
    case 7:
      await editFields(actor);
      break;
    case 8:
      await request(actor, hole + (actor.role === 'ENGINEER' ? '/tecnico/analise' : '/ensaios'));
      break;
    case 9:
      await request(actor, '/workspace/atividades');
      break;
  }
}
async function isolationCheck() {
  const a = manifest.actors[0],
    other = manifest.actors[3];
  await login(a);
  await login(other);
  const result = await request(a, '/obras/' + other.workId, undefined, 'GET', {
    expectedStatus: 404,
  });
  assertions.push({
    check: 'cross-tenant work denied',
    status: result.status,
    pass: result.status === 404,
  });
  if (result.status !== 404) throw Error('Tenant isolation assertion failed');
}
async function integrity() {
  let count = 0;
  const failures = [];
  for (const actor of manifest.actors) {
    const r = await db.query('SELECT version FROM spt_tests WHERE id=$1 AND tenant_id=$2', [
      actor.recordIds[1],
      actor.tenantId,
    ]);
    const expected = 1 + actor.successfulSptEdits;
    if (r.rows.length !== 1 || r.rows[0].version !== expected)
      failures.push({ actor: actor.index, expected, actual: r.rows[0]?.version });
    const hole = (
      await db.query('SELECT version FROM boreholes WHERE id=$1 AND tenant_id=$2', [
        actor.holeId,
        actor.tenantId,
      ])
    ).rows[0];
    if (!hole || hole.version !== 1 + actor.successfulSptEdits + actor.successfulFieldEdits)
      failures.push({
        actor: actor.index,
        kind: 'borehole version',
        expected: 1 + actor.successfulSptEdits + actor.successfulFieldEdits,
        actual: hole?.version,
      });
    count += actor.successfulSptEdits;
  }
  const total = await db.query('SELECT count(*)::int AS total FROM spt_tests');
  const actualWorks = (await db.query('SELECT count(*)::int AS total FROM works')).rows[0].total;
  const expectedWorks = 51 + manifest.actors.reduce((n, a) => n + a.successfulWorkCreates, 0);
  if (actualWorks !== expectedWorks)
    failures.push({ kind: 'work count', expected: expectedWorks, actual: actualWorks });
  const result = {
    at: new Date().toISOString(),
    actualWorks,
    expectedWorks,
    checkedBoreholes: 50,
    successfulFieldEdits: manifest.actors.reduce((n, a) => n + a.successfulFieldEdits, 0),
    checkedRecords: 50,
    successfulSptEdits: count,
    expectedMetreRecords: 275,
    actualMetreRecords: total.rows[0].total,
    failures,
    pass: failures.length === 0 && total.rows[0].total === 275,
  };
  assertions.push({ check: 'SPT versions/counts after load', ...result });
  save(path.join(config.dir, 'integrity.json'), result);
  if (!result.pass) throw Error('Persisted write count/version mismatch');
}
async function stage(vus, seconds, warmup = 30, label = `${vus}-VU`) {
  phase = label;
  stopped = false;
  for (const actor of manifest.actors.slice(0, vus)) await login(actor);
  const started = Date.now(),
    until = started + (seconds + warmup) * 1000,
    measuredStart = started + warmup * 1000;
  let failWindows = 0,
    nextWindow = measuredStart + 30000,
    reason = null,
    journeys = 0;
  const windows = [];
  const checkWindow = () => {
    if (Date.now() < nextWindow) return;
    const from = nextWindow - 30000,
      items = records.filter(
        (r) => r.phase === label && r.at >= from && r.at < nextWindow && r.measured,
      );
    const result = summary(items),
      enough = result.requests >= 20;
    const policy = enough && result.status429 / result.requests > 0.05;
    const technical =
      enough &&
      ((result.serverErrors + result.timeouts + result.invalidResponses) / result.requests > 0.01 ||
        result.p95Ms > 2000);
    windows.push({ from, to: nextWindow, ...result, enoughSamples: enough, policy, technical });
    failWindows = policy || technical ? failWindows + 1 : 0;
    if (failWindows >= 2) {
      reason = policy ? 'RATE_LIMIT_POLICY' : 'ERROR_OR_LATENCY';
      stopped = true;
    }
    nextWindow += 30000;
  };
  const lanes = manifest.actors.slice(0, vus).map(async (actor, index) => {
    let step = index;
    while (!stopped && Date.now() < until) {
      measuring = Date.now() >= measuredStart;
      await journey(actor, step++);
      journeys++;
      checkWindow();
      await sleep(1800 + ((index * 137 + step * 53) % 500));
    }
  });
  await Promise.all(lanes);
  measuring = false;
  const ended = Date.now(),
    items = records.filter((r) => r.phase === label && r.measured),
    stats = summary(items),
    duration = Math.max(1, (Math.min(ended, until) - measuredStart) / 1000);
  const routes = {};
  for (const key of new Set(items.map((r) => r.method + ' ' + r.route)))
    routes[key] = summary(items.filter((r) => r.method + ' ' + r.route === key));
  const readStats = summary(items.filter((r) => r.method === 'GET')),
    writeStats = summary(items.filter((r) => r.method !== 'GET'));
  const passed =
    !reason &&
    (readStats.p95Ms === null || readStats.p95Ms < 500) &&
    (writeStats.p95Ms === null || writeStats.p95Ms < 1000) &&
    stats.status429 / Math.max(stats.requests, 1) <= 0.05 &&
    (stats.serverErrors + stats.timeouts + stats.clientErrors + stats.invalidResponses) /
      Math.max(stats.requests, 1) <
      0.01 &&
    stats.p95Ms < 1000;
  const result = {
    label,
    vus,
    warmupSeconds: warmup,
    requestedMeasuredSeconds: seconds,
    measuredSeconds: duration,
    journeysIncludingWarmup: journeys,
    ...stats,
    reads: readStats,
    writes: writeStats,
    successfulRps: stats.successful / duration,
    offeredRps: stats.requests / duration,
    passed,
    stopReason: reason,
    windows,
    routes,
  };
  stages.push(result);
  await integrity();
  checkpoint();
  console.log(
    `Stage ${label}: ${stats.successful}/${stats.requests} success, 429=${stats.status429}, p95=${stats.p95Ms?.toFixed(1)}ms, stop=${reason || 'none'}`,
  );
  return result;
}
async function mediaAndPdf() {
  phase = 'bounded-files-and-pdf';
  measuring = false;
  const actor = manifest.actors[0];
  await login(actor);
  const root = '/obras/' + manifest.reportWork,
    photoIds = [];
  const currentFiles = await required(
    actor,
    root + '/furos/' + manifest.reportHoles[0] + '/arquivos',
    undefined,
    'GET',
    { safeRetry: true },
  );
  photoIds.push(
    ...currentFiles.photos.filter((p) => p.processingState === 'READY').map((p) => p.id),
  );
  for (let index = 0; index < manifest.reportHoles.length; index++) {
    const p = root + '/furos/' + manifest.reportHoles[index];
    const files = await required(actor, p + '/arquivos', undefined, 'GET', { safeRetry: true });
    let technical = await required(actor, p + '/tecnico', undefined, 'GET', { safeRetry: true });
    if (technical.hole.reviewState === 'APPROVED' && files.officialCoordinateId) continue;
    const coordinate =
      files.coordinates.find((c) => c.kind === 'EXECUTED') ||
      (await required(
        actor,
        p + '/arquivos/coordenadas/executada',
        {
          eastingM: String(250000 + (index % 5) * 50),
          northingM: String(9350000 + Math.floor(index / 5) * 60),
          zone: 25,
          hemisphere: 'S',
          datum: 'SIRGAS2000',
          reference: 'Coordenada sintética de carga',
        },
        'PUT',
        { safeRetry: true },
      ));
    if (!files.officialCoordinateId) {
      technical = await required(actor, p + '/tecnico', undefined, 'GET', { safeRetry: true });
      await required(
        actor,
        p + '/arquivos/coordenadas/oficial',
        { coordinateId: coordinate.id, technicalVersion: technical.hole.technicalVersion },
        'PUT',
        { safeRetry: true },
      );
    }
    technical = await required(actor, p + '/tecnico', undefined, 'GET', { safeRetry: true });
    if (technical.hole.reviewState === 'DRAFT')
      await required(
        actor,
        p + '/tecnico/enviar-revisao',
        { technicalVersion: technical.hole.technicalVersion, note: 'Teste sintético' },
        'POST',
        { safeRetry: true },
      );
    await required(
      actor,
      p + '/tecnico/aprovar',
      {
        technicalVersion: technical.hole.technicalVersion,
        reviewerName: 'Responsável fictício',
        reviewerRegistration: 'SEM VALIDADE',
        note: 'Aprovação somente de teste',
      },
      'POST',
      { safeRetry: true },
    );
  }
  for (const [imageIndex, size] of [420, 830, 1440, 1580].entries()) {
    if (imageIndex < currentFiles.photos.filter((p) => p.processingState === 'READY').length)
      continue;
    const image = await sharp(randomBytes(size * size * 3), {
      raw: { width: size, height: size, channels: 3 },
    })
      .png({ compressionLevel: 1 })
      .toBuffer();
    const form = new FormData();
    form.append(
      'file',
      new Blob([image], { type: 'image/png' }),
      'synthetic-noise-' + size + '.png',
    );
    form.append('caption', 'Imagem sintética de teste de carga - sem validade');
    const begin = Date.now(),
      photo = await required(
        actor,
        root + '/furos/' + manifest.reportHoles[0] + '/arquivos/fotografias',
        form,
        'POST',
        { timeout: 30000, safeRetry: true },
      );
    photoIds.push(photo.id);
    for (let attempt = 0; attempt < 60; attempt++) {
      const files = await required(
        actor,
        root + '/furos/' + manifest.reportHoles[0] + '/arquivos',
        undefined,
        'GET',
        { safeRetry: true },
      );
      const found = files.photos.find((p) => p.id === photo.id);
      if (found?.processingState === 'READY') {
        artifacts.push({
          type: 'photo',
          inputBytes: image.length,
          processingToReadyMs: Date.now() - begin,
          state: 'READY',
        });
        break;
      }
      if (found?.processingState === 'FAILED' || attempt === 59)
        throw Error('Photo job failed/timed out');
      await sleep(1000);
    }
  }
  // Three configurations, then two simultaneous distinct emissions; no retrying writes after timeouts.
  for (const count of [1, 5, 15]) {
    const report = await required(actor, root + '/relatorios', {
      title: `CARGA ${count} furos`,
      notes: 'Documento exclusivamente sintético para teste de desempenho',
      holeIds: manifest.reportHoles.slice(0, count),
      photoIds: count === 1 ? photoIds : [],
      showOtherBoreholes: false,
    });
    const reportPath = root + '/relatorios/' + report.id;
    const emission = async () => {
      const begin = Date.now(),
        issue = await required(actor, reportPath + '/emissoes', {
          version: report.version,
          idempotencyKey: randomUUID(),
        });
      let record,
        firstProcessingObservedMs = null;
      for (let attempt = 0; attempt < 90; attempt++) {
        const history = await required(actor, reportPath + '/emissoes', undefined, 'GET', {
          safeRetry: true,
        });
        record = history.issues.find((v) => v.id === issue.id);
        if (record?.state === 'PROCESSING' && firstProcessingObservedMs === null)
          firstProcessingObservedMs = Date.now() - begin;
        if (record?.state === 'READY') break;
        if (record?.state === 'FAILED' || attempt === 89) throw Error('PDF job failed/timed out');
        await sleep(1000);
      }
      const readyMs = Date.now() - begin,
        pdf = await required(
          actor,
          reportPath + '/emissoes/' + issue.id + '/pdf',
          undefined,
          'GET',
          { binary: true, hash: true, timeout: 30000 },
        );
      if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw Error('Invalid PDF signature');
      artifacts.push({
        type: 'pdf',
        holes: count,
        concurrentRequested: count === 15 ? 2 : 1,
        readyMs,
        firstProcessingObservedMs,
        issueId: issue.id,
        bytes: pdf.length,
        state: 'READY',
        hashVerified: true,
      });
    };
    if (count === 15) await Promise.all([emission(), emission()]);
    else await emission();
    checkpoint();
  }
}
async function openArrival() {
  phase = 'controlled-arrival-2-RPS';
  measuring = true;
  const actor = manifest.actors[0],
    start = Date.now(),
    jobs = [],
    durationMs = 30000,
    interval = 500;
  let offered = 0,
    missed = 0,
    inFlight = 0,
    maxInFlight = 0,
    maxStartLagMs = 0;
  while (Date.now() - start < durationMs) {
    const due = start + offered * interval,
      lag = Date.now() - due;
    maxStartLagMs = Math.max(maxStartLagMs, lag);
    if (lag > 1000 || inFlight >= 10) {
      missed++;
      offered++;
      await sleep(Math.max(0, start + offered * interval - Date.now()));
      continue;
    }
    offered++;
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    jobs.push(
      request(actor, '/obras?page=1', undefined, 'GET', {
        validate: (v) => Array.isArray(v?.items),
      }).finally(() => inFlight--),
    );
    await sleep(Math.max(0, start + offered * interval - Date.now()));
  }
  await Promise.all(jobs);
  measuring = false;
  const rows = records.filter((r) => r.phase === phase);
  const result = {
    label: phase,
    targetRps: 2,
    seconds: 30,
    offered,
    missed,
    maxStartLagMs,
    maxInFlight,
    ...summary(rows),
  };
  save(path.join(config.dir, 'arrival.json'), result);
  console.log('Controlled arrival:', JSON.stringify(result));
}
async function finish() {
  await integrity();
  await isolationCheck();
  measuring = false;
  phase = 'final';
  const envUnchanged =
    createHash('sha256')
      .update(fs.readFileSync(path.join(repo, '.env')))
      .digest('hex') === config.source.mainEnvSha256Before;
  assertions.push({ check: 'principal .env unchanged', pass: envUnchanged });
  if (!envUnchanged) throw Error('Principal environment changed');
  await resourceSample();
  if (fs.existsSync(path.join(config.dir, 'failure.json')))
    fs.renameSync(
      path.join(config.dir, 'failure.json'),
      path.join(config.dir, 'preparation-boundary-rejection.json'),
    );
  save(path.join(config.dir, 'results.json'), {
    runId: config.runId,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    config,
    stages,
    assertions,
    artifacts,
    overall: summary(records.filter((r) => r.measured)),
    generator: {
      tool: 'custom Node fetch harness, not k6',
      eventLoopP99Ms: eventLoop.percentile(99) / 1e6,
      rssMiB: process.memoryUsage().rss / 2 ** 20,
    },
    limitations: [
      'One client IP shares the per-handler rate limiter across tenants/VUs',
      'Local Docker ARM64; no AWS or cloud benchmark',
      'Main application services remained running on shared host',
      'No MFA load campaign or 15–30 min soak executed',
      'Only tiny initial data stock; not a large database benchmark',
      'Media/PDF campaign bounded; no target-throughput SLO established',
      'No production capacity inferred',
    ],
  });
  checkpoint();
}
async function main() {
  await db.connect();
  resourceTimer = setInterval(resourceSample, 5000);
  await resourceSample();
  if (process.argv.includes('--media-only')) {
    await mediaAndPdf();
    await finish();
    return;
  }
  if (!process.argv.includes('--load-only')) {
    const smokeStart = records.length;
    phase = 'smoke';
    for (const actor of manifest.actors.slice(0, 9)) {
      await login(actor);
      await required(actor, '/obras/' + actor.workId, undefined, 'GET', {
        validate: (v) => v?.id === actor.workId,
      });
      await journey(actor, actor.role === 'COMMERCIAL' ? 1 : 6);
    }
    if (records.slice(smokeStart).some((r) => r.status >= 400 && !r.expected))
      throw Error('Smoke business operation failed; do not escalate');
    await isolationCheck();
    await integrity();
    checkpoint();
    console.log('Smoke passed: 3 tenants / 3 roles; real writes and isolation verified');
  }
  if (!process.argv.includes('--load-only')) await mediaAndPdf();
  // Reset only the in-memory limiter in the dedicated instance after preparation, not security policy.
  run('docker', ['restart', 'metro-loadtest-api']);
  await sleep(2500);
  const baseline =
    stages.find((s) => s.label === 'baseline-1-VU') || (await stage(1, 60, 30, 'baseline-1-VU'));
  if (!baseline.passed) {
    await finish();
    return;
  }
  for (const vus of [1, 5, 10, 25, 50]) {
    if (stages.some((s) => s.label === `${vus}-VU`)) continue;
    const result = await stage(vus, 120, 30);
    if (!result.passed) break;
  }
  // Wait for existing per-IP policy to expire; never evade it with IP rotation.
  await sleep(60000);
  await openArrival();
  await finish();
}
main()
  .catch(async (error) => {
    console.error(error.message);
    save(path.join(config.dir, 'failure.json'), {
      phase,
      message: error.message,
      at: new Date().toISOString(),
    });
    checkpoint();
    process.exitCode = 1;
  })
  .finally(async () => {
    clearInterval(resourceTimer);
    eventLoop.disable();
    await db.end();
  });
