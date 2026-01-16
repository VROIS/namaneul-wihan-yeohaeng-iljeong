import React, { createContext, useContext, useState, useCallback } from "react";

interface MapToggleContextType {
  showMap: boolean;
  toggleMap: () => void;
  setShowMap: (show: boolean) => void;
}

const MapToggleContext = createContext<MapToggleContextType>({
  showMap: false,
  toggleMap: () => {},
  setShowMap: () => {},
});

export function MapToggleProvider({ children }: { children: React.ReactNode }) {
  const [showMap, setShowMap] = useState(false);

  const toggleMap = useCallback(() => {
    setShowMap((prev) => !prev);
  }, []);

  return (
    <MapToggleContext.Provider value={{ showMap, toggleMap, setShowMap }}>
      {children}
    </MapToggleContext.Provider>
  );
}

export function useMapToggle() {
  return useContext(MapToggleContext);
}
