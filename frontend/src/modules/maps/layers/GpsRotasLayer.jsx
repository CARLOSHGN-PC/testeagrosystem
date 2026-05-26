import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';

export default function GpsRotasLayer({ map, onFinish, onPoint }) {
  const [paused, setPaused] = useState(false);
  const watchIdRef = useRef(null);
  const lineRef = useRef(null);
  const pointsRef = useRef([]);

  useEffect(() => {
    if (!map || !navigator.geolocation) return undefined;

    lineRef.current = L.polyline([], { color: '#1d4ed8', weight: 4 }).addTo(map);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (paused) return;
        const point = {
          ordem: pointsRef.current.length + 1,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          velocidade: pos.coords.speed,
          precisao: pos.coords.accuracy,
        };
        pointsRef.current.push(point);
        lineRef.current.addLatLng([point.latitude, point.longitude]);
        onPoint?.(point);
      },
      () => {
        // TODO: confirmar com equipe estratégia de fallback para erro de GPS.
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 },
    );

    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (lineRef.current) map.removeLayer(lineRef.current);
    };
  }, [map, paused, onPoint]);

  return (
    <div style={{ position: 'absolute', right: 16, bottom: 16, zIndex: 1000, display: 'grid', gap: 8 }}>
      <button type="button" onClick={() => setPaused((v) => !v)}>{paused ? 'Continuar' : 'Pausar'}</button>
      <button type="button" onClick={() => onFinish?.(pointsRef.current)}>Finalizar</button>
    </div>
  );
}
