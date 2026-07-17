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
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  function locate(highAccuracy: boolean, isRetry: boolean) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setError(null);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCoords({ lat, lng });
        onChange(lat, lng);
        mapRef.current?.setView([lat, lng], 16);
        markerRef.current?.setLatLng([lat, lng]);
      },
      (err) => {
        // Permission denied is terminal — no retry will help.
        if (err.code === err.PERMISSION_DENIED) {
          setLocating(false);
          setError(
            "Location is blocked. Allow location for this site in your browser settings, or just drag the 📍 to your spot.",
          );
          return;
        }
        // First failure (timeout / position unavailable) on high accuracy:
        // retry once with low accuracy, which is faster and works indoors.
        if (!isRetry) {
          locate(false, true);
          return;
        }
        setLocating(false);
        setError("Couldn't get your location. Tap the map or drag the 📍 to your spot instead.");
      },
      {
        enableHighAccuracy: highAccuracy,
        timeout: highAccuracy ? 12000 : 15000,
        maximumAge: 60000,
      },
    );
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("This browser can't share your location. Drag the 📍 to your spot instead.");
      return;
    }
    setError(null);
    setLocating(true);
    locate(true, false);
  }

  return (
    <div>
      <button
        type="button"
        onClick={useMyLocation}
        className="mb-2 w-full rounded-lg border border-plum-ink/15 py-2 text-sm font-semibold"
      >
        {locating ? "Locating…" : "📍 Use my current location"}
      </button>
      <div ref={mapEl} className="h-44 w-full overflow-hidden rounded-lg border border-plum-ink/10" />
      {error && <p className="mt-1 text-xs text-guava">{error}</p>}
      <p className="mt-1 text-xs text-plum-ink/50">
        {coords ? `Pinned: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : "Tap the map or drag the 📍 to your exact location."}
      </p>
    </div>
  );
}
