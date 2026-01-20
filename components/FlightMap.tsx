import React, { useEffect, useRef, useState } from 'react';
import { Plane, Clock, MapPin } from 'lucide-react';

// --- Types based on the prompt's specific JSON structure ---
interface RouteLeg {
  from_city: string;
  from_airport_code: string;
  from_lat: number;
  from_lng: number;
  to_city: string;
  to_airport_code: string;
  to_lat: number;
  to_lng: number;
  airline: string;
  price: number;
  duration_hours: number;
  layover_hours?: number;
}

// --- Example Data ---
const MOCK_ROUTE: RouteLeg[] = [
  {
    from_city: "London", from_airport_code: "LHR", from_lat: 51.4700, from_lng: -0.4543,
    to_city: "Dubai", to_airport_code: "DXB", to_lat: 25.2532, to_lng: 55.3657,
    airline: "Emirates", price: 450, duration_hours: 7.0, layover_hours: 2.5
  },
  {
    from_city: "Dubai", from_airport_code: "DXB", from_lat: 25.2532, from_lng: 55.3657,
    to_city: "Singapore", to_airport_code: "SIN", to_lat: 1.3644, to_lng: 103.9915,
    airline: "Singapore Airlines", price: 380, duration_hours: 7.5, layover_hours: 14.0
  },
  {
    from_city: "Singapore", from_airport_code: "SIN", from_lat: 1.3644, from_lng: 103.9915,
    to_city: "Jakarta", to_airport_code: "CGK", to_lat: -6.1256, to_lng: 106.6559,
    airline: "Garuda Indonesia", price: 120, duration_hours: 1.8, layover_hours: 0
  }
];

declare global {
  interface Window {
    google: any;
    initMap: () => void;
  }
}

export const FlightMap: React.FC = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Statistics Calculation ---
  const totalStats = MOCK_ROUTE.reduce((acc, leg) => ({
    price: acc.price + leg.price,
    duration: acc.duration + leg.duration_hours + (leg.layover_hours || 0)
  }), { price: 0, duration: 0 });

  useEffect(() => {
    // 1. Load Google Maps Script dynamically
    const loadScript = () => {
      if (window.google?.maps) {
        setMapLoaded(true);
        return;
      }

      const existingScript = document.getElementById('google-maps-script');
      if (existingScript) {
        setMapLoaded(true);
        return;
      }

      const script = document.createElement('script');
      // NOTE: Replace YOUR_API_KEY with a valid key for the map to render tiles correctly.
      // If the key is invalid, the map will show "Development Purposes Only" or fail.
      const apiKey = process.env.GOOGLE_MAPS_API_KEY || 'YOUR_API_KEY';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry`;
      script.id = 'google-maps-script';
      script.async = true;
      script.defer = true;
      
      script.onload = () => {
        setMapLoaded(true);
      };
      
      script.onerror = () => {
        setError("Failed to load Google Maps API. Please check your API Key.");
      };

      document.body.appendChild(script);
    };

    loadScript();
  }, []);

  useEffect(() => {
    if (mapLoaded && mapRef.current && window.google) {
      initMap();
    }
  }, [mapLoaded]);

  const initMap = () => {
    if (!mapRef.current) return;

    // Initialize Map
    const map = new window.google.maps.Map(mapRef.current, {
      zoom: 2,
      center: { lat: 20, lng: 0 },
      styles: [
        {
          "featureType": "all",
          "elementType": "geometry.fill",
          "stylers": [{ "weight": "2.00" }]
        },
        {
          "featureType": "all",
          "elementType": "geometry.stroke",
          "stylers": [{ "color": "#9c9c9c" }]
        },
        {
          "featureType": "all",
          "elementType": "labels.text",
          "stylers": [{ "visibility": "on" }]
        },
        {
          "featureType": "landscape",
          "elementType": "all",
          "stylers": [{ "color": "#f2f2f2" }]
        },
        {
          "featureType": "landscape",
          "elementType": "geometry.fill",
          "stylers": [{ "color": "#ffffff" }]
        },
        {
          "featureType": "water",
          "elementType": "all",
          "stylers": [{ "color": "#eaf6f8" }, { "visibility": "on" }]
        }
      ],
      disableDefaultUI: true,
      zoomControl: true,
    });

    renderRoute(map, MOCK_ROUTE);
  };

  const renderRoute = (map: any, legs: RouteLeg[]) => {
    const bounds = new window.google.maps.LatLngBounds();
    const infoWindow = new window.google.maps.InfoWindow();

    legs.forEach((leg, index) => {
      const origin = { lat: leg.from_lat, lng: leg.from_lng };
      const dest = { lat: leg.to_lat, lng: leg.to_lng };

      bounds.extend(origin);
      bounds.extend(dest);

      // --- Draw Polyline ---
      // Color logic: Highlight legs with long layovers *following* them? 
      // Or legs that *are* long layovers? 
      // The prompt says "Color direct/short-layover legs in one color and long-layover legs in another".
      // We'll interpret layover_hours >= 12 as a "Long Layover Route".
      const isLongLayover = (leg.layover_hours || 0) >= 12;
      
      const lineSymbol = {
        path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 3,
        strokeColor: isLongLayover ? '#f97316' : '#3b82f6' // Orange for long layover, Blue for standard
      };

      const flightPath = new window.google.maps.Polyline({
        path: [origin, dest],
        geodesic: true,
        strokeColor: isLongLayover ? '#f97316' : '#3b82f6',
        strokeOpacity: 1.0,
        strokeWeight: 3,
        icons: [{
          icon: lineSymbol,
          offset: '50%'
        }]
      });

      flightPath.setMap(map);

      // --- Add Markers ---
      // Add Origin Marker (only for first leg)
      if (index === 0) {
        addMarker(map, origin, leg.from_city, leg.from_airport_code, "Origin", infoWindow);
      }
      
      // Add Destination Marker (which is also the layover point for intermediate legs)
      const isFinal = index === legs.length - 1;
      const type = isFinal ? "Destination" : `Layover (${leg.layover_hours}h)`;
      addMarker(map, dest, leg.to_city, leg.to_airport_code, type, infoWindow);
    });

    map.fitBounds(bounds);
  };

  const addMarker = (map: any, position: any, city: string, code: string, type: string, infoWindow: any) => {
    const marker = new window.google.maps.Marker({
      position: position,
      map: map,
      title: city,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 6,
        fillColor: "#ffffff",
        fillOpacity: 1,
        strokeWeight: 4,
        strokeColor: type.includes("Origin") ? "#3b82f6" : type.includes("Destination") ? "#10b981" : "#f59e0b"
      }
    });

    marker.addListener("click", () => {
      infoWindow.setContent(`
        <div style="padding: 8px; font-family: sans-serif;">
          <h3 style="margin: 0 0 4px 0; font-weight: bold; font-size: 14px;">${city} (${code})</h3>
          <p style="margin: 0; font-size: 12px; color: #666;">${type}</p>
        </div>
      `);
      infoWindow.open(map, marker);
    });
  };

  return (
    <div className="flex flex-col md:flex-row h-full rounded-2xl overflow-hidden bg-white shadow-sm border border-slate-200">
      
      {/* Sidebar Panel */}
      <div className="w-full md:w-80 bg-slate-50 border-r border-slate-200 flex flex-col">
        <div className="p-6 border-b border-slate-200 bg-white">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Plane className="text-blue-600" size={20} />
            Route Overview
          </h2>
          <div className="mt-4 flex justify-between items-end">
            <div>
              <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider">Total Price</p>
              <p className="text-2xl font-bold text-slate-800">${totalStats.price}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider">Duration</p>
              <p className="text-lg font-semibold text-slate-700">{Math.floor(totalStats.duration)}h {(totalStats.duration % 1 * 60).toFixed(0)}m</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider pl-2">Itinerary Breakdown</p>
          
          {MOCK_ROUTE.map((leg, i) => (
            <div key={i} className="relative pl-4 pb-6 last:pb-0">
               {/* Connector Line */}
               {i !== MOCK_ROUTE.length - 1 && (
                 <div className="absolute left-[21px] top-8 bottom-0 w-0.5 bg-slate-300" />
               )}

               <div className="flex gap-3">
                 <div className="mt-1 relative z-10">
                   <div className="w-4 h-4 rounded-full bg-white border-2 border-blue-500" />
                 </div>
                 <div className="flex-1 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                   <div className="flex justify-between items-start mb-1">
                     <span className="font-bold text-slate-800">{leg.from_airport_code} <span className="text-slate-400">→</span> {leg.to_airport_code}</span>
                     <span className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">${leg.price}</span>
                   </div>
                   <div className="text-sm text-slate-600 mb-2">{leg.airline}</div>
                   <div className="flex items-center gap-3 text-xs text-slate-400">
                     <span className="flex items-center gap-1"><Clock size={10} /> {leg.duration_hours}h</span>
                     {leg.layover_hours && leg.layover_hours > 0 ? (
                       <span className={`px-1.5 py-0.5 rounded ${leg.layover_hours >= 12 ? 'bg-orange-100 text-orange-700 font-bold' : 'bg-slate-100 text-slate-500'}`}>
                         {leg.layover_hours}h Layover
                       </span>
                     ) : null}
                   </div>
                 </div>
               </div>
            </div>
          ))}
          
          {/* Final Destination Node */}
          <div className="relative pl-4 pt-2">
             <div className="flex gap-3 items-center">
                 <div className="relative z-10">
                   <div className="w-4 h-4 rounded-full bg-emerald-500 border-2 border-white ring-2 ring-emerald-100" />
                 </div>
                 <div className="text-sm font-bold text-emerald-700">Arrive {MOCK_ROUTE[MOCK_ROUTE.length-1].to_city}</div>
             </div>
          </div>
        </div>
      </div>

      {/* Map Container */}
      <div className="flex-1 relative bg-slate-200 min-h-[400px]">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 p-4 text-center">
            <div>
              <MapPin size={48} className="mx-auto mb-2 text-slate-300" />
              <p>{error}</p>
              <p className="text-xs mt-2">Check console if API key is restricted.</p>
            </div>
          </div>
        ) : !mapLoaded ? (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400">
            Loading Google Maps...
          </div>
        ) : (
          <div ref={mapRef} className="w-full h-full" />
        )}
      </div>
    </div>
  );
};