export interface PublicBookingRow {
  requesterEmail: string;
  requesterName: string;
  requesterPhone: string;
  faAccreditationNumber: string | null;
  createdAt: Date | string;
}

export interface PublicBookerRow {
  email: string;
  name: string;
  phone: string;
  faCode: string | null;
  bookingCount: number;
  lastBookingAt: string | null;
  source: 'public-booking';
}

/**
 * Collapse raw public pool-booking rows into one row per external requester
 * (those without a matching User account), keyed by lower-cased email. Name /
 * phone / FA code are taken from that requester's most recent booking.
 */
export function buildPublicBookerRows(
  bookings: PublicBookingRow[],
  knownEmails: Set<string>,
): PublicBookerRow[] {
  const known = new Set([...knownEmails].map(e => e.toLowerCase()));
  const acc = new Map<string, { latest: number; row: PublicBookingRow; count: number }>();

  for (const b of bookings) {
    const key = b.requesterEmail.toLowerCase();
    if (known.has(key)) continue;
    const ts = new Date(b.createdAt).getTime();
    const cur = acc.get(key);
    if (!cur) {
      acc.set(key, { latest: ts, row: b, count: 1 });
    } else {
      cur.count++;
      if (ts >= cur.latest) { cur.latest = ts; cur.row = b; }
    }
  }

  return [...acc.entries()]
    .map(([email, v]) => ({
      email,
      name: v.row.requesterName,
      phone: v.row.requesterPhone,
      faCode: v.row.faAccreditationNumber ?? null,
      bookingCount: v.count,
      lastBookingAt: Number.isFinite(v.latest) ? new Date(v.latest).toISOString() : null,
      source: 'public-booking' as const,
    }))
    .sort((a, b) => b.bookingCount - a.bookingCount || a.email.localeCompare(b.email));
}
