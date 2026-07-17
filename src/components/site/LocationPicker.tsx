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
}: {
  onChange: (lat: number, lng: number) => void;
  // Pre-selects a pin (admin store-location picker).
  initial?: { lat: number; lng: number } | null;
  // Centers the map here without committing a pin (e.g. the store location, so
  // diners near the store don't start on a far-away default view).
  defaultCenter?: { lat: number; lng: number } | null;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LType.Map | null>(null);
  const markerRef = useRef<LType.Marker | null>(null);
  const LRef = useRef<typeof LType | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(initial ?? null);

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
      <div ref={mapEl} className="h-44 w-full overflow-hidden rounded-lg border border-plum-ink/10" />
      <p className="mt-1 text-xs text-plum-ink/50">
        {coords ? `Pinned: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : "Tap the map or drag the 📍 to your exact location."}
      </p>
    </div>
  );
}
