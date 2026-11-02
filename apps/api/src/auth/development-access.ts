export function developmentBypassEnabled() {
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
