import { prisma } from '../config/database';

export interface VenueVlm {
  name: string | null;
  phone: string | null;
  email: string | null;
}

const EMPTY_VLM: VenueVlm = { name: null, phone: null, email: null };

/** The venue admin (VLM) is the focal point of that venue's Logistics ("LOG") department,
 * falling back to the venue's Admin-role user when no focal point has been set on the department. */
export async function getVenueVlm(stadiumId: string | null | undefined): Promise<VenueVlm> {
  if (!stadiumId) return EMPTY_VLM;
  const dept = await prisma.department.findFirst({
    where: { stadiumId, code: 'LOG' },
    select: {
      focalPointName: true, focalPointEmail: true, focalPointPhone: true,
      focalPoint: { select: { name: true, email: true, phone: true } },
    },
  });
  if (dept?.focalPoint || dept?.focalPointName) {
    return {
      name: dept.focalPoint?.name ?? dept.focalPointName ?? null,
      phone: dept.focalPoint?.phone ?? dept.focalPointPhone ?? null,
      email: dept.focalPoint?.email ?? dept.focalPointEmail ?? null,
    };
  }
  const admin = await prisma.user.findFirst({
    where: { stadiumId, role: 'Admin' },
    select: { name: true, email: true, phone: true },
  });
  if (!admin) return EMPTY_VLM;
  return { name: admin.name, email: admin.email, phone: admin.phone ?? null };
}

/** Batched form of getVenueVlm for a list of stadiums (dashboard map, venue status cards) — one query instead of N. */
export async function getVenueVlmMap(stadiumIds: string[]): Promise<Record<string, VenueVlm>> {
  const unique = [...new Set(stadiumIds)];
  if (unique.length === 0) return {};
  const depts = await prisma.department.findMany({
    where: { stadiumId: { in: unique }, code: 'LOG' },
    select: {
      stadiumId: true,
      focalPointName: true, focalPointEmail: true, focalPointPhone: true,
      focalPoint: { select: { name: true, email: true, phone: true } },
    },
  });
  const map: Record<string, VenueVlm> = {};
  const missing: string[] = [];
  for (const stadiumId of unique) {
    const d = depts.find(x => x.stadiumId === stadiumId);
    if (d?.focalPoint || d?.focalPointName) {
      map[stadiumId] = {
        name: d.focalPoint?.name ?? d.focalPointName ?? null,
        phone: d.focalPoint?.phone ?? d.focalPointPhone ?? null,
        email: d.focalPoint?.email ?? d.focalPointEmail ?? null,
      };
    } else {
      missing.push(stadiumId);
    }
  }
  if (missing.length > 0) {
    const admins = await prisma.user.findMany({
      where: { stadiumId: { in: missing }, role: 'Admin' },
      select: { stadiumId: true, name: true, email: true, phone: true },
    });
    for (const a of admins) {
      if (a.stadiumId && !map[a.stadiumId]) {
        map[a.stadiumId] = { name: a.name, email: a.email, phone: a.phone ?? null };
      }
    }
  }
  return map;
}
