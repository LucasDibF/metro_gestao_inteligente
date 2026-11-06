import 'dotenv/config';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
async function main() {
  if (process.env.NODE_ENV !== 'development' || process.env.DEV_AUTH_BYPASS !== 'true')
    throw Error('Demo requires local development bypass');
  const base = 'http://127.0.0.1:3000/api/v1';
  const session = await fetch(base + '/auth/dev-session', { method: 'POST' });
  if (!session.ok) throw Error('Start the local API first');
  const { accessToken } = (await session.json()) as { accessToken: string };
  const headers = { Authorization: 'Bearer ' + accessToken };
  async function call<T>(path: string, body?: unknown, method = body ? 'POST' : 'GET'): Promise<T> {
    const r = await fetch(base + path, {
      method,
      headers: {
        ...headers,
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
    });
    if (!r.ok) throw Error(`Demo step failed (${r.status}): ${path}`);
    return r.status === 204 ? (undefined as T) : (r.json() as Promise<T>);
  }
  const original = await call<{ role: string }>('/auth/me');
  const workName = 'DEMO — fluxo completo (dados fictícios)';
  try {
    const existing = await call<{ items: Array<{ id: string }> }>(
      '/obras?q=' + encodeURIComponent(workName),
    );
    if (existing.items.length) {
      console.log('Demo work already exists; existing data preserved');
      return;
    }
    await call('/auth/dev-role', { role: 'ENGINEER' });
    const work = await call<{ id: string }>('/obras', {
      name: workName,
      clientName: 'Demonstração local — sem dados reais',
      city: 'Localização fictícia',
      state: 'RN',
    });
    const root = '/obras/' + work.id,
      holes: string[] = [];
    let photoId: string | undefined;
    for (let index = 0; index < 2; index++) {
      const folder = await call<{ id: string }>(root + '/pastas', {
          name: 'Área de demonstração ' + (index + 1),
        }),
        hole = await call<{ id: string }>(root + '/furos', {
          code: 'SP-DEMO-0' + (index + 1),
          folderId: folder.id,
          plannedDepthM: '5.00',
        });
      holes.push(hole.id);
      const path = root + '/furos/' + hole.id;
      await call(
        path + '/tecnico',
        {
          technicalVersion: 1,
          executedDepthM: '5.00',
          waterLevelM: '1.80',
          fieldDate: '2026-10-31',
        },
        'PUT',
      );
      await call(path + '/tecnico/camadas', {
        fromM: '0',
        toM: '2',
        soilType: 'Areia siltosa',
        description:
          'Camada fictícia, marrom-clara. Exemplo de descrição manual para testar a interface.',
      });
      await call(path + '/tecnico/camadas', {
        fromM: '2',
        toM: '5',
        soilType: 'Argila arenosa',
        description: 'Camada fictícia, avermelhada. Não representa um ensaio ou local real.',
      });
      for (let depth = 1; depth <= 5; depth++)
        await call(path + '/ensaios', {
          depthM: String(depth),
          advances: [
            { blows: 4 + depth, penetrationMm: 150 },
            { blows: 4 + depth * 2, penetrationMm: 150 },
            { blows: 6 + depth * 2, penetrationMm: 150 },
          ],
        });
      const coordinate = await call<{ id: string }>(
        path + '/arquivos/coordenadas/executada',
        {
          eastingM: String(250000 + index * 50),
          northingM: String(9350000 + index * 35),
          zone: 25,
          hemisphere: 'S',
          datum: 'SIRGAS2000',
          reference: 'Coordenada fictícia para demonstração da interface',
        },
        'PUT',
      );
      const technical = await call<{ hole: { technicalVersion: number } }>(path + '/tecnico');
      await call(
        path + '/arquivos/coordenadas/oficial',
        { coordinateId: coordinate.id, technicalVersion: technical.hole.technicalVersion },
        'PUT',
      );
      const version = (await call<{ hole: { technicalVersion: number } }>(path + '/tecnico')).hole
        .technicalVersion;
      await call(path + '/tecnico/enviar-revisao', {
        technicalVersion: version,
        note: 'Caso fictício preparado para exercitar a revisão.',
      });
      await call(path + '/tecnico/aprovar', {
        technicalVersion: version,
        note: 'Aprovação de demonstração, sem validade técnica para obra real.',
        reviewerName: 'Responsável fictício — demonstração',
        reviewerRegistration: 'DEMO — sem validade',
      });
      if (index === 0) {
        const image = await sharp(
          Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600"><rect width="1000" height="600" fill="#e2ece1"/><rect x="60" y="60" width="880" height="480" rx="10" fill="white" stroke="#245843"/><text x="500" y="240" text-anchor="middle" font-family="sans-serif" font-size="48" fill="#245843">DEMONSTRAÇÃO</text><text x="500" y="310" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#52655d">Imagem sintética para testar fotografias</text><text x="500" y="365" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#52655d">Não representa um registro de campo real</text></svg>',
          ),
        )
          .png()
          .toBuffer();
        const form = new FormData();
        form.append(
          'file',
          new Blob([new Uint8Array(image)], { type: 'image/png' }),
          'demonstracao.png',
        );
        form.append('caption', 'DEMO — imagem sintética, não é fotografia de campo');
        photoId = (await call<{ id: string }>(path + '/arquivos/fotografias', form)).id;
        for (let attempt = 0; attempt < 60; attempt++) {
          const files = await call<{ photos: Array<{ id: string; processingState: string }> }>(
            path + '/arquivos',
          );
          const state = files.photos.find((p) => p.id === photoId)?.processingState;
          if (state === 'READY') break;
          if (state === 'FAILED' || attempt === 59) throw Error('Demo image worker did not finish');
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }
    const report = await call<{ id: string; version: number }>(root + '/relatorios', {
      title: 'DEMO — relatório com dados fictícios',
      notes:
        'Documento de demonstração local. Não contém dados de obra real nem possui validade técnica.',
      holeIds: holes,
      photoIds: photoId ? [photoId] : [],
      showOtherBoreholes: false,
    });
    const issue = await call<{ id: string }>(root + '/relatorios/' + report.id + '/emissoes', {
      version: report.version,
      idempotencyKey: randomUUID(),
    });
    for (let attempt = 0; attempt < 90; attempt++) {
      const history = await call<{ issues: Array<{ id: string; state: string }> }>(
        root + '/relatorios/' + report.id + '/emissoes',
      );
      const state = history.issues.find((i) => i.id === issue.id)?.state;
      if (state === 'READY') {
        console.log(
          'Local demo ready: 2 folders, 2 boreholes, soil layers, 6 SPT records, synthetic photo, official coordinates and downloadable PDF',
        );
        return;
      }
      if (state === 'FAILED' || attempt === 89) throw Error('Demo PDF worker did not finish');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } finally {
    await call('/auth/dev-role', { role: original.role });
    await call('/auth/logout', {}, 'POST');
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Local demo failed');
  process.exitCode = 1;
});
