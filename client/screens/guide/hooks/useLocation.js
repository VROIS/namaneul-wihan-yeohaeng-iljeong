// ⚠️ 수정금지(승인필요): 위치 훅 — GPS + 여행비서/SOS용
import { useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import { useStore } from '../state/store';

export function useLocation() {
  const setLocation = useStore((s) => s.setLocation);
  const location = useStore((s) => s.location);

  // ⚠️ 수정금지(승인필요): 현재 위치 1회 조회
  const getCurrentLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('[useLocation] 위치 권한 거부');
        return null;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const result = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy,
      };
      setLocation(result);
      return result;
    } catch (error) {
      console.error('[useLocation] 위치 조회 실패:', error.message);
      return null;
    }
  }, [setLocation]);

  // ⚠️ 수정금지(승인필요): 역지오코딩 — GPS → 주소 텍스트
  const getAddress = useCallback(async () => {
    const loc = location || await getCurrentLocation();
    if (!loc) return '위치를 확인할 수 없습니다';

    try {
      const addresses = await Location.reverseGeocodeAsync({
        latitude: loc.latitude,
        longitude: loc.longitude,
      });
      if (addresses.length > 0) {
        const a = addresses[0];
        return [a.country, a.region, a.city, a.street, a.name]
          .filter(Boolean)
          .join(' ');
      }
      return `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`;
    } catch {
      return `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`;
    }
  }, [location, getCurrentLocation]);

  // ⚠️ 수정금지(승인필요): SOS용 위치 텍스트 (음성 안내 + 공유용)
  const getSOSLocation = useCallback(async () => {
    const loc = await getCurrentLocation();
    const address = await getAddress();
    return {
      text: `현재 위치: ${address}`,
      coordinates: loc,
      mapUrl: loc ? `https://maps.google.com/?q=${loc.latitude},${loc.longitude}` : null,
    };
  }, [getCurrentLocation, getAddress]);

  return {
    location,
    getCurrentLocation,
    getAddress,
    getSOSLocation,
  };
}
