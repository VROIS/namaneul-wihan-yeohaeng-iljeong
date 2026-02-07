/**
 * PlaceAutocomplete - Google Places 자동완성 컴포넌트
 * 
 * 서버 프록시 방식: API 키가 클라이언트에 노출되지 않음
 * 용도: 목적지(도시) 검색 + 숙소(lodging) 검색
 * 
 * 초행 여행자 UX 원칙:
 * - 도시를 모르는 사람도 쉽게 검색 가능 (한국어 지원)
 * - 선택하면 정확한 좌표 자동 확보
 * - 드롭다운이 기존 UI를 가리지 않도록 zIndex 관리
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  TextInput,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Brand, Spacing, BorderRadius } from '@/constants/theme';
import { apiRequest } from '@/lib/query-client';

export interface PlaceSelection {
  placeId: string;
  name: string;
  address: string;
  coords: { lat: number; lng: number };
}

interface Prediction {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
  types: string[];
}

interface PlaceAutocompleteProps {
  placeholder: string;
  value: string;
  onSelect: (place: PlaceSelection) => void;
  onClear?: () => void;
  icon?: keyof typeof Feather.glyphMap;
  types?: string;          // Google Places types filter: '(cities)', 'lodging', 'establishment'
  locationBias?: string;   // "lat,lng" for biasing results to a region
  radiusBias?: string;     // radius in meters for location bias
  theme: {
    text: string;
    textSecondary: string;
    textTertiary: string;
    backgroundDefault: string;
    background: string;
  };
  disabled?: boolean;
  helperText?: string;     // 안내 텍스트 (ex: "나중에도 설정 가능")
  zIndex?: number;
}

export function PlaceAutocomplete({
  placeholder,
  value,
  onSelect,
  onClear,
  icon = 'map-pin',
  types,
  locationBias,
  radiusBias,
  theme,
  disabled = false,
  helperText,
  zIndex = 10,
}: PlaceAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSelected, setIsSelected] = useState(!!value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 자동완성 검색 (디바운싱 300ms)
  const searchPlaces = useCallback(async (input: string) => {
    if (input.length < 2) {
      setPredictions([]);
      setShowDropdown(false);
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams({ input });
      if (types) params.append('types', types);
      if (locationBias) params.append('location', locationBias);
      if (radiusBias) params.append('radius', radiusBias);

      const response = await apiRequest('GET', `/api/places/autocomplete?${params}`);
      const data = await response.json();

      setPredictions(data.predictions || []);
      setShowDropdown((data.predictions || []).length > 0);
    } catch (error) {
      console.error('[PlaceAutocomplete] Search error:', error);
      setPredictions([]);
    } finally {
      setIsLoading(false);
    }
  }, [types, locationBias, radiusBias]);

  const handleTextChange = (text: string) => {
    setQuery(text);
    setIsSelected(false);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchPlaces(text), 300);
  };

  // 장소 선택 → 상세 정보(좌표) 가져오기
  const handleSelect = async (prediction: Prediction) => {
    setQuery(prediction.mainText);
    setShowDropdown(false);
    setPredictions([]);
    setIsLoading(true);

    try {
      const response = await apiRequest('GET', `/api/places/details?placeId=${prediction.placeId}`);
      const detail = await response.json();

      setIsSelected(true);
      onSelect({
        placeId: detail.placeId,
        name: detail.name,
        address: detail.address,
        coords: detail.coords,
      });
    } catch (error) {
      console.error('[PlaceAutocomplete] Details error:', error);
      // 좌표 없이라도 이름은 설정
      setIsSelected(true);
      onSelect({
        placeId: prediction.placeId,
        name: prediction.mainText,
        address: prediction.description,
        coords: { lat: 0, lng: 0 },
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setIsSelected(false);
    setPredictions([]);
    setShowDropdown(false);
    onClear?.();
  };

  return (
    <View style={[styles.container, { zIndex }]}>
      <View style={[styles.inputBox, { backgroundColor: theme.backgroundDefault }]}>
        <Feather name={icon} size={20} color={isSelected ? Brand.primary : theme.textTertiary} />
        <TextInput
          style={[styles.textInput, { color: theme.text }]}
          value={query}
          onChangeText={handleTextChange}
          placeholder={placeholder}
          placeholderTextColor={theme.textTertiary}
          editable={!disabled}
          onFocus={() => {
            if (predictions.length > 0) setShowDropdown(true);
          }}
          onBlur={() => {
            // 지연 닫기 (Pressable 터치 이벤트가 먼저 처리되도록)
            setTimeout(() => setShowDropdown(false), 200);
          }}
        />
        {isLoading && <ActivityIndicator size="small" color={Brand.primary} />}
        {isSelected && query.length > 0 && (
          <Pressable onPress={handleClear} hitSlop={8}>
            <Feather name="x-circle" size={18} color={theme.textTertiary} />
          </Pressable>
        )}
      </View>

      {helperText && !isSelected && !showDropdown && (
        <Text style={[styles.helperText, { color: theme.textTertiary }]}>{helperText}</Text>
      )}

      {/* 자동완성 드롭다운 */}
      {showDropdown && predictions.length > 0 && (
        <View style={[styles.dropdown, { backgroundColor: theme.background, zIndex: zIndex + 1 }]}>
          <FlatList
            data={predictions}
            keyExtractor={(item) => item.placeId}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            style={styles.dropdownList}
            renderItem={({ item }) => (
              <Pressable
                style={styles.predictionItem}
                onPress={() => handleSelect(item)}
              >
                <Feather
                  name={item.types.includes('lodging') ? 'home' : 'map-pin'}
                  size={16}
                  color={Brand.primary}
                  style={styles.predictionIcon}
                />
                <View style={styles.predictionText}>
                  <Text style={[styles.mainText, { color: theme.text }]} numberOfLines={1}>
                    {item.mainText}
                  </Text>
                  <Text style={[styles.secondaryText, { color: theme.textSecondary }]} numberOfLines={1}>
                    {item.secondaryText}
                  </Text>
                </View>
              </Pressable>
            )}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'web' ? 12 : 14,
    borderRadius: BorderRadius.md,
    gap: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    padding: 0,
  },
  helperText: {
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    borderRadius: BorderRadius.md,
    marginTop: 4,
    maxHeight: 200,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
      web: {
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      },
    }),
  },
  dropdownList: {
    maxHeight: 200,
  },
  predictionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  predictionIcon: {
    marginRight: 10,
  },
  predictionText: {
    flex: 1,
  },
  mainText: {
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryText: {
    fontSize: 12,
    marginTop: 2,
  },
});
