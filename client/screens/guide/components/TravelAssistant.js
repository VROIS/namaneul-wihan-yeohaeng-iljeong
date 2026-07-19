// ⚠️ 수정금지(승인필요): 여행비서 UI — 통역/환율/SOS/메뉴판/위치
// 버튼 클릭 → 음성 인사: "무엇을 도와드릴까요?"
// 현지 비서 페르소나 — Gemma 4 Tool Calling으로 자동 기능 호출
import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../state/store';
import { CONFIG } from '../config/constants';

// ⚠️ 수정금지(승인필요): 여행비서 서브 메뉴
const ASSISTANT_MENUS = [
  { id: 'translate', icon: 'language', label: '통역', color: '#4CAF50' },
  { id: 'exchange', icon: 'cash', label: '환율', color: '#FF9800' },
  { id: 'sos', icon: 'alert-circle', label: 'SOS', color: '#F44336' },
  { id: 'menu', icon: 'restaurant', label: '메뉴판', color: '#9C27B0' },
  { id: 'transport', icon: 'bus', label: '교통', color: '#2196F3' },
  { id: 'share', icon: 'share-social', label: '위치공유', color: '#607D8B' },
];

export default function TravelAssistant({ visible, onSelect, onClose }) {
  const assistantMode = useStore((s) => s.assistantMode);

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>여행비서</Text>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>무엇을 도와드릴까요?</Text>

      <View style={styles.grid}>
        {ASSISTANT_MENUS.map(({ id, icon, label, color }) => (
          <TouchableOpacity
            key={id}
            style={[styles.menuItem, { borderColor: color }]}
            onPress={() => onSelect(id)}
            activeOpacity={0.7}
          >
            <Ionicons name={icon} size={32} color={color} />
            <Text style={styles.menuLabel}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 110,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 20,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  menuItem: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  menuLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
});
