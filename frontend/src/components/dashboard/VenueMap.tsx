import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, ExternalLink, ArrowRight } from 'lucide-react';

export interface VenueMapPoint {
    id: string;
    name: string;
    code: string;
    location: string;
    latitude: number | null;
    longitude: number | null;
    totalCarts: number;
    fleetBreakdown: Record<string, number>;
}

const QATAR_CENTER: [number, number] = [25.35, 51.3];

// Marker size communicates fleet size at a glance — bigger bubble, more carts on site.
function bubbleSize(totalCarts: number): number {
    return Math.round(Math.max(34, Math.min(30 + totalCarts * 2.2, 72)));
}

function bubbleIcon(venue: VenueMapPoint): L.DivIcon {
    const size = bubbleSize(venue.totalCarts);
    const fontSize = size < 42 ? 13 : size < 56 ? 15 : 18;
    const background = venue.totalCarts > 0
        ? 'linear-gradient(135deg, #2f6fd6, #14a3ac)'
        : 'linear-gradient(135deg, #9aa2b5, #67728a)';
    return L.divIcon({
        className: '',
        html: `
            <div style="position:relative;width:${size}px;height:${size}px;">
                <div class="venue-bubble-ring"></div>
                <div class="venue-bubble" style="width:${size}px;height:${size}px;font-size:${fontSize}px;background:${background}">
                    <span style="position:relative;z-index:1">${venue.totalCarts}</span>
                </div>
            </div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2],
    });
}

function FitToVenues({ points }: { points: [number, number][] }) {
    const map = useMap();
    useEffect(() => {
        if (points.length === 0) return;
        if (points.length === 1) {
            map.setView(points[0], 12);
        } else {
            map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 13 });
        }
    }, [map, points]);
    return null;
}

const TYPE_COLORS: Record<string, string> = {
    '4-Seater': 'bg-blue-50 text-blue-700',
    '6-Seater': 'bg-emerald-50 text-emerald-700',
    'Cargo': 'bg-amber-50 text-amber-700',
    'Accessibility': 'bg-purple-50 text-purple-700',
};

interface Props {
    venues: VenueMapPoint[];
    onViewFleet: (venueId: string) => void;
}

export function VenueMap({ venues, onViewFleet }: Props) {
    const placed = useMemo(
        () => venues.filter((v): v is VenueMapPoint & { latitude: number; longitude: number } =>
            v.latitude != null && v.longitude != null),
        [venues]
    );
    const unplaced = venues.filter(v => v.latitude == null || v.longitude == null);
    const points: [number, number][] = placed.map(v => [v.latitude, v.longitude]);

    return (
        <div className="venue-map space-y-2">
            <div className="rounded-xl overflow-hidden border h-[420px]">
                {placed.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-2 text-center bg-muted/30 text-muted-foreground px-6">
                        <MapPin className="w-6 h-6 opacity-40" />
                        <p className="text-sm">No venue has a mapped location yet.</p>
                        <p className="text-xs">Paste a Google Maps link into a venue's location on the Stadiums page to place it here.</p>
                    </div>
                ) : (
                    <MapContainer
                        center={QATAR_CENTER}
                        zoom={8}
                        scrollWheelZoom={false}
                        style={{ height: '100%', width: '100%' }}
                        attributionControl={true}
                    >
                        <TileLayer
                            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            maxZoom={19}
                        />
                        <FitToVenues points={points} />
                        {placed.map(venue => (
                            <Marker key={venue.id} position={[venue.latitude, venue.longitude]} icon={bubbleIcon(venue)}>
                                <Popup>
                                    <div>
                                        <div className="bg-gradient-to-br from-[#5b2a9e] to-[#2f6fd6] px-4 py-3 text-white">
                                            <p className="text-[11px] font-bold tracking-wide opacity-85">{venue.code}</p>
                                            <p className="text-sm font-extrabold leading-tight">{venue.name}</p>
                                        </div>
                                        <div className="px-4 py-3 space-y-3">
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-2xl font-black text-slate-800">{venue.totalCarts}</span>
                                                <span className="text-xs text-slate-500">cart{venue.totalCarts === 1 ? '' : 's'} on site</span>
                                            </div>
                                            {Object.keys(venue.fleetBreakdown).length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    {Object.entries(venue.fleetBreakdown).map(([type, count]) => (
                                                        <span key={type} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TYPE_COLORS[type] ?? 'bg-slate-100 text-slate-600'}`}>
                                                            {count} {type}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="flex flex-col gap-1.5 pt-1 border-t">
                                                <a
                                                    href={venue.location}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-xs font-semibold text-[#3874ff] hover:underline flex items-center gap-1"
                                                >
                                                    View on Google Maps <ExternalLink className="w-3 h-3" />
                                                </a>
                                                <button
                                                    onClick={() => onViewFleet(venue.id)}
                                                    className="text-xs font-semibold text-[#14a3ac] hover:underline flex items-center gap-1"
                                                >
                                                    View fleet <ArrowRight className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        ))}
                    </MapContainer>
                )}
            </div>
            {unplaced.length > 0 && (
                <p className="text-[11px] text-muted-foreground px-1">
                    Not shown on the map — no location link saved: {unplaced.map(v => v.name).join(', ')}.
                </p>
            )}
        </div>
    );
}
