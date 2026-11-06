const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
/** Checks the socket too: `ip` follows X-Forwarded-For once trust proxy is on. */
export function loopbackRequest(request: {
  ip?: string;
  socket?: { remoteAddress?: string };
}): boolean {
  return (
    loopback.includes(request.ip ?? '') &&
    loopback.includes(request.socket?.remoteAddress ?? request.ip ?? '')
  );
}
export function developmentBypassEnabled(): boolean {
  const enabled = process.env.DEV_AUTH_BYPASS === 'true';
  if (enabled) {
    const database = process.env.DATABASE_URL;
    if (
      process.env.NODE_ENV !== 'development' ||
      !database ||
      !['localhost', '127.0.0.1'].includes(new URL(database).hostname)
    ) {
      throw new Error('DEV_AUTH_BYPASS requires development mode and a local database');
    }
  }
  return enabled;
}
