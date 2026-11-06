import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

/** Number of reverse proxies in front of the API. Anything but a plain integer means none. */
export function trustProxyHops(value: string | undefined = process.env.TRUST_PROXY_HOPS): number {
  return value && /^\d{1,2}$/.test(value) ? Number(value) : 0;
}
export function configureHttp(app: NestExpressApplication): void {
  app.disable('x-powered-by');
  // Never `true`: that would trust a client-supplied X-Forwarded-For in the rate limiter.
  app.set('trust proxy', trustProxyHops());
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'same-origin' },
      // TLS ends in front of this service, so HSTS belongs to that layer.
      strictTransportSecurity: false,
    }),
  );
}
