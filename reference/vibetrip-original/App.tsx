import React, { useState, useEffect, useRef } from 'react';
import { VibeSelector } from './components/VibeSelector';
import { PlaceCard } from './components/PlaceCard';
import { generateItinerary } from './services/geminiService';
import { Itinerary, Vibe, Place, TravelPriority, CompanionType, CompanionDetail, CurationFocus } from './types';

declare global {
  interface Window {
    google: any;
  }
}

type Screen = 'Input' | 'Loading' | 'Result';

const App: React.FC = () => {
  const [screen, setScreen] = useState<Screen>('Input');
  const [formData, setFormData] = useState({
    birthDate: '1985-06-15',
    companionType: 'Family' as CompanionType,
    companionCount: 4,
    companionAges: '55, 59',
    curationFocus: 'Everyone' as CurationFocus,
    destination: '파리, 프랑스',
    startDate: '2024-12-24',
    endDate: '2024-12-26',
    vibes: ['Culture', 'Foodie'] as Vibe[],
    priority: 'Comfort/Efficiency' as TravelPriority
  });

  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [activeDay, setActiveDay] = useState(0);
  const [loadingStep, setLoadingStep] = useState(0);
  
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markers = useRef<any[]>([]);
  const polylines = useRef<any>(null);

  useEffect(() => {
    if (!window.google && !document.getElementById('google-maps-script')) {
      const script = document.createElement('script');
      script.id = 'google-maps-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.API_KEY}&libraries=places,geometry`;
      script.async = true;
      script.onload = () => console.log("Google Maps Loaded");
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    if (screen === 'Result' && itinerary && mapRef.current && window.google) {
      const initMap = () => {
        const dayPlaces = itinerary.days[activeDay].places;
        if (dayPlaces.length === 0) return;

        const bounds = new window.google.maps.LatLngBounds();
        const path: any[] = [];

        if (!mapInstance.current) {
          mapInstance.current = new window.google.maps.Map(mapRef.current, {
            zoom: 13,
            styles: [
              { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
              { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] }
            ],
            disableDefaultUI: true,
            zoomControl: true,
          });
        }

        markers.current.forEach(m => m.setMap(null));
        markers.current = [];
        if (polylines.current) polylines.current.setMap(null);

        dayPlaces.forEach((place, index) => {
          const pos = { lat: place.lat, lng: place.lng };
          path.push(pos);
          bounds.extend(pos);

          const marker = new window.google.maps.Marker({
            position: pos,
            map: mapInstance.current,
            label: { text: (index + 1).toString(), color: "white", fontWeight: "900" },
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              fillColor: "#4f46e5",
              fillOpacity: 1,
              strokeWeight: 2,
              strokeColor: "#ffffff",
              scale: 14,
            }
          });
          markers.current.push(marker);
        });

        polylines.current = new window.google.maps.Polyline({
          path,
          geodesic: true,
          strokeColor: "#6366f1",
          strokeOpacity: 0.8,
          strokeWeight: 4,
          map: mapInstance.current
        });

        mapInstance.current.fitBounds(bounds, { top: 60, bottom: 60, left: 60, right: 60 });
      };

      const timeoutId = setTimeout(initMap, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [screen, itinerary, activeDay]);

  return (
    <div className="mx-auto w-full max-w-md h-screen bg-white overflow-hidden shadow-2xl relative">
      {/* Input, Loading, Result screens */}
    </div>
  );
};

export default App;
