"use client";

import { useEffect, useRef, useState } from "react";
import type * as LType from "leaflet";

/**
 * Lets a delivery customer pin their exact location. Uses Leaflet +
 * OpenStreetMap tiles (no API key) and the browser Geolocation API. Leaflet is
 * dynamically imported so it never runs during SSR (it touches `window`).
 */
export function LocationPicker({
  onChange,
  initial,
  defaultCenter,
  enableSearch = false,
}: {
  onChange: (lat: number, lng: number) => void;
  // Pre-selects a pin (admin store-location picker).
  initial?: { lat: number; lng: number } | null;
  // Centers the map here without committing a pin (e.g. the store location, so
  // diners near the store don't start on a far-away default view).
  defaultCenter?: { lat: number; lng: number } | null;
  // Shows an address search box that recenters the map (admin store picker).
  enableSearch?: boolean;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LType.Map | null>(null);
  const markerRef = useRef<LType.Marker | null>(null);
  const LRef = useRef<typeof LType | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(initial ?? null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Geocode the typed address (free OpenStreetMap Nominatim, no API key) and
  // recenter the map + marker on the first match, committing it as the pin.
  async function runSearch() {
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
        { headers: { "Accept-Language": "en" } },
      );
      const data = (await res.json()) as { lat: string; lon: string }[];
      if (!Array.isArray(data) || data.length === 0) {
        setSearchError("No match found. Try a more specific address.");
        return;
      }
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        setSearchError("No match found. Try a more specific address.");
        return;
      }
      mapRef.current?.setView([lat, lng], 16);
      markerRef.current?.setLatLng([lat, lng]);
      setCoords({ lat, lng });
      onChange(lat, lng);
    } catch {
      setSearchError("Couldn't search right now. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")) as typeof LType;
      LRef.current = L;
      // Inject Leaflet CSS (CDN) once.
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }
      if (cancelled || !mapEl.current || mapRef.current) return;

      // Center priority: a pre-set pin → the store location → Davao fallback.
      const start = initial ?? defaultCenter ?? { lat: 7.0731, lng: 125.6128 };
      const zoom = initial ? 16 : defaultCenter ? 15 : 12;
      const map = L.map(mapEl.current).setView([start.lat, start.lng], zoom);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);

      const icon = L.divIcon({ html: '<div style="font-size:30px;line-height:1">📍</div>', className: "", iconSize: [30, 30], iconAnchor: [15, 30] });
      const marker = L.marker([start.lat, start.lng], { draggable: true, icon }).addTo(map);
      function set(lat: number, lng: number) {
        setCoords({ lat, lng });
        onChange(lat, lng);
      }
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        set(p.lat, p.lng);
      });
      map.on("click", (e: LType.LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        set(e.latlng.lat, e.latlng.lng);
      });
      mapRef.current = map;
      markerRef.current = marker;
      // Fix sizing inside flex/sheet layouts.
      setTimeout(() => map.invalidateSize(), 200);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      {enableSearch && (
        <div className="mb-2">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Enter searches without submitting the surrounding form.
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch();
                }
              }}
              placeholder="Search an address or place…"
              className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={runSearch}
              disabled={searching || !query.trim()}
              className="shrink-0 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {searching ? "…" : "Search"}
            </button>
          </div>
          {searchError && <p className="mt-1 text-xs text-guava">{searchError}</p>}
        </div>
      )}
      <div ref={mapEl} className="h-44 w-full overflow-hidden rounded-lg border border-plum-ink/10" />
      <p className="mt-1 text-xs text-plum-ink/50">
        {coords ? `Pinned: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : "Tap the map or drag the 📍 to your exact location."}
      </p>
    </div>
  );
}
