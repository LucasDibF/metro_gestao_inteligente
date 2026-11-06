import { Button } from './Button';

const brandName = 'Metro — Gestão Inteligente';

/** Inside the app the logo returns home without a reload, which would end the in-memory session. */
export function Brand({
  compact = false,
  onHome,
  disabled = false,
  describedBy,
}: {
  compact?: boolean;
  onHome?: () => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  const mark = compact ? (
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
  );
  return onHome ? (
    <Button
      type="button"
      className="brand-link"
      aria-label={`${brandName}, início`}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={onHome}
    >
      {mark}
    </Button>
  ) : (
    <span className="brand-link" role="img" aria-label={brandName}>
      {mark}
    </span>
  );
}
