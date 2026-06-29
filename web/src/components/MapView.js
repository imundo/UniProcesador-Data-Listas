"use client";

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icons in Leaflet with Next.js
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom Premium Icon
const customIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const HeatmapLayer = ({ points }) => {
  const map = useMap();

  useEffect(() => {
    if (!map || points.length === 0) return;

    let heatLayer = null;

    import('leaflet.heat').then(() => {
      const heatPoints = points.map(p => [p.lat, p.lon, p.count * 10]); // Multiplicamos para intensidad
      const maxCount = Math.max(...points.map(p => p.count * 10));

      heatLayer = L.heatLayer(heatPoints, {
        radius: 35,
        blur: 25,
        maxZoom: 14,
        max: maxCount,
        gradient: {
          0.2: 'blue',
          0.4: 'cyan',
          0.6: 'lime',
          0.8: 'yellow',
          1.0: 'red'
        }
      }).addTo(map);
    });

    return () => {
      if (map && heatLayer) {
        map.removeLayer(heatLayer);
      }
    };
  }, [map, points]);

  return null;
};

export default function MapView() {
  const [locations, setLocations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const res = await fetch("/api/locations");
        const data = await res.json();
        setLocations(data || []);
      } catch (err) {
        console.error("Error fetching locations:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchLocations();
  }, []);

  if (isLoading) {
    return (
      <div className="w-full h-[500px] rounded-3xl bg-neutral-900 border border-neutral-800 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin h-8 w-8 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-neutral-400">Generando mapa de calor de zonas críticas...</span>
        </div>
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <div className="w-full p-12 text-center rounded-3xl bg-neutral-900 border border-neutral-800">
        <p className="text-neutral-500">No hay suficientes datos geográficos para mostrar el mapa.</p>
      </div>
    );
  }

  // Centered roughly on Caracas, La Guaira
  const center = [10.50, -66.90];

  return (
    <div className="w-full relative rounded-3xl overflow-hidden border border-neutral-800 shadow-[0_0_30px_rgba(239,68,68,0.1)]">
      <div className="absolute top-0 left-0 right-0 z-[400] pointer-events-none p-6">
        <h3 className="text-2xl font-bold bg-neutral-950/80 backdrop-blur-md inline-block px-4 py-2 rounded-xl text-white shadow-lg border border-red-500/20 text-red-400">
          📍 Densidad de Refugiados/Pacientes
        </h3>
      </div>
      <MapContainer 
        center={center} 
        zoom={9} 
        style={{ height: '500px', width: '100%', zIndex: 1, backgroundColor: '#0f172a' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          className="map-tiles"
        />
        
        <HeatmapLayer points={locations} />

        {locations.map((loc, idx) => (
          <Marker key={idx} position={[loc.lat, loc.lon]} icon={customIcon} opacity={0.8}>
            <Popup className="premium-popup">
              <div className="text-center p-1">
                <h4 className="font-bold text-gray-900 text-sm mb-1">{loc.centro}</h4>
                <div className="bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded-full inline-block">
                  {loc.count.toLocaleString()} registros
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <style jsx global>{`
        .premium-popup .leaflet-popup-content-wrapper {
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 10px 25px -5px rgba(239, 68, 68, 0.3);
          border: 1px solid rgba(239, 68, 68, 0.2);
        }
        .premium-popup .leaflet-popup-tip {
          background: #ffffff;
        }
      `}</style>
    </div>
  );
}
