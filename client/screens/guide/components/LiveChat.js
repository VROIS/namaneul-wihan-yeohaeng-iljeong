// ⚠️ 수정금지(승인필요): 라이브 대화 오버레이 — 카메라 위 반투명 채팅
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useStore } from '../state/store';
import { theme } from '../styles/theme';
import { CONFIG } from '../config/constants';

// ⚠️ 수정금지(승인필요): 라이브 모드 상태 텍스트
const STATUS_TEXT = {
  off: '',
  listening: '듣고 있어요...',
  thinking: '생각 중...',
  speaking: '말하는 중...',
};

export default function LiveChat() {
  const liveMode = useStore((s) => s.liveMode);
  const messages = useStore((s) => s.messages);

  if (liveMode === 'off') return null;

  const recentMessages = messages.slice(-5);

  return (
    <>
      {/* 상태 배지 (듣고 있어요 / 생각 중 / 말하는 중) */}
      {liveMode !== 'off' && (
        <View style={theme.statusBadge}>
          <Text style={theme.statusText}>{STATUS_TEXT[liveMode]}</Text>
        </View>
      )}

      {/* 대화 오버레이 */}
      {recentMessages.length > 0 && (
        <View style={theme.chatOverlay}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {recentMessages.map((msg, i) => (
              <Text
                key={i}
                style={msg.role === 'user' ? theme.userText : theme.aiText}
              >
                {msg.role === 'user' ? '🗣 ' : '🤖 '}
                {msg.text}
              </Text>
            ))}
          </ScrollView>
        </View>
      )}
    </>
  );
}
