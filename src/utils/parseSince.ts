/**
 * Converts a human-friendly duration string (e.g., "3d", "12h", "45m", "30s")
 * into a timestamp in milliseconds relative to `now`.
 *
 * @param sinceStr A string like "3d", "12h", "30m", or "1 day"
 * @param now Optional base time (default: Date.now())
 * @returns number | null — the calculated timestamp or null if invalid
 */
export function parseSince(sinceStr: string, now = Date.now()): number | null {
  const match = sinceStr.trim().match(/^(\d+)\s*(d|day|days|h|hour|hours|m|min|minute|minutes|s|sec|second|seconds)$/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  let offset = 0;
  if (["d", "day", "days"].includes(unit)) offset = value * 24 * 60 * 60 * 1000;
  else if (["h", "hour", "hours"].includes(unit)) offset = value * 60 * 60 * 1000;
  else if (["m", "min", "minute", "minutes"].includes(unit)) offset = value * 60 * 1000;
  else if (["s", "sec", "second", "seconds"].includes(unit)) offset = value * 1000;

  return now - offset;
}
