export const formatUnix = (seconds?: number) => {
  if (!seconds) return "—";
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? "—" : date.toISOString();
};

export const formatMs = (ms?: number) => {
  if (!ms) return "—";
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? "—" : date.toISOString();
};

export const formatMaybeEpoch = (value?: string) => {
  if (!value) return "—";
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return value;
  return formatUnix(parsed);
};

export const shortenHash = (hash?: string) => {
  if (!hash) return "—";
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
};
