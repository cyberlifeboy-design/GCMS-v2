// Resolves the lat/lng a Stadium's `location` field points to, when that field holds a
// Google Maps share link (maps.app.goo.gl, google.com/maps/place/..., or maps.google.com?q=lat,lng).
// Venues are entered by pasting the map link Google's "Share" panel gives you — this recovers
// the coordinate Google itself resolved that link to, so the Dashboard map can place a marker
// there without maintaining a second, hand-typed lat/lng per venue.

const COORD_PATTERNS = [
    // Place pin, e.g. "...!3d25.2634!4d51.4433..." — most precise, present on /maps/place/ URLs.
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    // Viewport center, e.g. "...@25.2634,51.4433,15z..."
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    // Plain query param, e.g. "?q=25.2634,51.4433"
    /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,
];

function extractCoords(url: string): { latitude: number; longitude: number } | null {
    for (const pattern of COORD_PATTERNS) {
        const match = url.match(pattern);
        if (match) {
            const latitude = parseFloat(match[1]);
            const longitude = parseFloat(match[2]);
            if (Number.isFinite(latitude) && Number.isFinite(longitude)) return { latitude, longitude };
        }
    }
    return null;
}

// Matched against the parsed URL's hostname only (never the raw string) so a crafted host
// like "maps.app.goo.gl.attacker.com" or "google.attacker.com" can't slip past a naive
// prefix/substring check — that would let an admin-supplied venue link make the server
// fetch an attacker-controlled host (SSRF), e.g. pivoting to Azure's metadata endpoint.
const ALLOWED_HOSTNAME = /^(maps\.app\.goo\.gl|maps\.google\.[a-z]{2,3}(?:\.[a-z]{2})?|(?:www\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?)$/i;

export function looksLikeMapsLink(value: string): boolean {
    let url: URL;
    try {
        url = new URL(value.trim());
    } catch {
        return false;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    if (!ALLOWED_HOSTNAME.test(url.hostname)) return false;
    // google.com et al only host maps at /maps — maps.app.goo.gl and maps.google.* don't need this.
    if (/google\./i.test(url.hostname) && !/^maps\.google\./i.test(url.hostname) && !url.pathname.startsWith('/maps')) {
        return false;
    }
    return true;
}

// Follows redirects (maps.app.goo.gl short links resolve through one) and pulls the coordinate
// out of the final URL. Returns null — never throws — so a bad/unreachable link just leaves the
// venue without a map marker instead of blocking the save.
export async function resolveMapsLinkCoords(url: string): Promise<{ latitude: number; longitude: number } | null> {
    if (!looksLikeMapsLink(url)) return null;
    try {
        const direct = extractCoords(url);
        if (direct) return direct;

        const res = await fetch(url, {
            redirect: 'follow',
            signal: AbortSignal.timeout(6000),
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GCMS-venue-geocoder/1.0)' },
        });
        return extractCoords(res.url);
    } catch {
        return null;
    }
}
