import { writeArrayBuffer } from 'geotiff';
export function inpeFixture(
  options: {
    missing?: boolean;
    partialNoData?: boolean;
    unlicensed?: boolean;
    unsafe?: boolean;
    fullFile?: boolean;
    zone?: number;
  } = {},
) {
  const data = new Uint8Array(400 * 400 * 3);
  for (let y = 0; y < 400; y++)
    for (let x = 0; x < 400; x++) {
      const i = (y * 400 + x) * 3;
      data[i] = options.partialNoData ? 0 : 70;
      data[i + 1] = 130;
      data[i + 2] = 90;
    }
  const tags = {
    width: 400,
    height: 400,
    SamplesPerPixel: 3,
    BitsPerSample: [8, 8, 8],
    PhotometricInterpretation: 2,
    ModelPixelScale: [2, 2, 0],
    ModelTiepoint: [0, 0, 0, 499600, 9400400, 0],
    ProjectedCSTypeGeoKey: 32700 + (options.zone ?? 23),
    GTModelTypeGeoKey: 1,
  };
  const files = [
    Buffer.from(writeArrayBuffer(new Uint8Array(data.length), structuredClone(tags))),
    Buffer.from(writeArrayBuffer(data, structuredClone(tags))),
  ];
  const calls: { url: string; range: string | null }[] = [];
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const range = new Headers(init?.headers).get('range');
    calls.push({ url: url.toString(), range });
    if (url.origin !== 'https://data.inpe.br') throw Error('Unexpected external host');
    if (url.pathname.endsWith('/collections/CB4A-WPM-PCA-FUSED-1'))
      return Response.json({
        license: options.unlicensed
          ? 'proprietary'
          : 'Creative-Commons-Attribution-4.0-International',
      });
    if (url.pathname.endsWith('/search'))
      return Response.json({
        features: [0, 1].map((i) => ({
          id: `CBERS4A_WPM_PCA_RGB321_202609${24 - i}_206_133`,
          properties: { datetime: `2026-09-${24 - i}T00:00:00Z` },
          assets: {
            tci: {
              href: options.unsafe
                ? 'https://untrusted.invalid/asset.tif'
                : `https://data.inpe.br/bdc/data/CB4A-WPM-PCA-FUSED/v001/206/133/2026/9/${i}.tif`,
            },
          },
        })),
      });
    const file = files[options.missing || url.pathname.endsWith('/0.tif') ? 0 : 1];
    if (options.fullFile) return new Response(file, { status: 200 });
    const match = range?.match(/^bytes=(\d+)-(\d+)$/);
    if (!match) throw Error('Missing Range');
    const start = Number(match[1]),
      end = Math.min(Number(match[2]), file.length - 1);
    if (start >= file.length) return new Response(null, { status: 416 });
    return new Response(file.subarray(start, end + 1), {
      status: 206,
      headers: {
        'content-range': `bytes ${start}-${end}/${file.length}`,
        'content-length': String(end - start + 1),
      },
    });
  };
  return { transport, calls };
}
