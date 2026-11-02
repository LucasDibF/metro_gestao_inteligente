export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a className="brand-link" href="/" aria-label="Metro — Gestão Inteligente, início">
      {compact ? (
        <img className="metro-icon" src="/metro-icon.svg" width="36" height="36" alt="" />
      ) : (
        <>
          <img
            className="brand-light metro-wordmark"
            src="/metro-wordmark.svg"
            width="164"
            height="58"
            alt=""
          />
          <img
            className="brand-dark metro-wordmark"
            src="/metro-wordmark-dark.svg"
            width="164"
            height="58"
            alt=""
          />
        </>
      )}
    </a>
  );
}
