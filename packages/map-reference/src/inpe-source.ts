import { BaseClient, BaseResponse } from 'geotiff';
export const INPE_COLLECTION = 'https://data.inpe.br/bdc/stac/v1/collections/CB4A-WPM-PCA-FUSED-1';
export const INPE_LICENSE = 'https://creativecommons.org/licenses/by/4.0/';
const MAX_DOWNLOAD = 32 * 1024 * 1024;
export class InpeHttp {
  private received = 0;
  readonly signal = AbortSignal.timeout(18000);
  constructor(private readonly transport: typeof fetch = fetch) {}
  async request(url: string, limit: number, range?: string) {
    const target = new URL(url);
    if (
      target.origin !== 'https://data.inpe.br' ||
      !target.pathname.startsWith('/bdc/') ||
      target.username ||
      target.password
    )
      throw Error('Unsupported imagery endpoint');
    const response = await this.transport(target, {
      redirect: 'error',
      signal: this.signal,
      headers: range ? { Range: range } : undefined,
    });
    if (!response.ok || (range && response.status !== 206)) {
      await response.body?.cancel();
      throw Error('Imagery request failed');
    }
    const declared = Number(response.headers.get('content-length'));
    if (declared > limit || this.received + declared > MAX_DOWNLOAD) {
      await response.body?.cancel();
      throw Error('Imagery download limit');
    }
    if (!response.body) throw Error('Missing imagery response');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        this.received += value.byteLength;
        if (size > limit || this.received > MAX_DOWNLOAD) {
          await reader.cancel();
          throw Error('Imagery download limit');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return { response, bytes: Buffer.concat(chunks, size) };
  }
  async json(url: string): Promise<unknown> {
    const { bytes } = await this.request(url, 256 * 1024);
    return JSON.parse(bytes.toString('utf8'));
  }
}
/** TIFF range requests are bounded, never redirected and never accept a full-scene response. */
export class InpeRangeClient extends BaseClient {
  constructor(
    url: string,
    private readonly http: InpeHttp,
  ) {
    super(url);
    const target = new URL(url);
    if (
      target.origin !== 'https://data.inpe.br' ||
      !/^\/bdc\/data\/CB4A-WPM-PCA-FUSED\/v001\/.+\.tif$/.test(target.pathname) ||
      target.search ||
      target.hash
    )
      throw Error('Unsupported INPE asset');
  }
  async request(options: RequestInit = {}): Promise<BaseResponse> {
    const range = new Headers(options.headers).get('range');
    const match = range?.match(/^bytes=(\d+)-(\d+)$/);
    if (!match) throw Error('Missing bounded range');
    const length = Number(match[2]) - Number(match[1]) + 1;
    if (!Number.isSafeInteger(length) || length <= 0 || length > 8 * 1024 * 1024)
      throw Error('Imagery range limit');
    const { response, bytes } = await this.http.request(this.url, length, range!);
    const contentRange = response.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
    if (
      !contentRange ||
      contentRange[1] !== match[1] ||
      Number(contentRange[2]) > Number(match[2]) ||
      bytes.length !== Number(contentRange[2]) - Number(contentRange[1]) + 1 ||
      (Number(contentRange[2]) !== Number(match[2]) &&
        Number(contentRange[2]) + 1 !== Number(contentRange[3]))
    )
      throw Error('Invalid imagery range');
    return new (class extends BaseResponse {
      get status() {
        return response.status;
      }
      getHeader(name: string) {
        return response.headers.get(name) ?? undefined;
      }
      async getData() {
        return bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer;
      }
    })();
  }
}
