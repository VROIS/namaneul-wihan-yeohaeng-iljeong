import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, Platform } from 'react-native';

// 백엔드 API 주소
const getBackendUrl = () => {
    if (Platform.OS === 'web') {
        return 'http://localhost:8082';
    }
    // 실제 기기에서는 로컬 IP 사용 필요
    return 'http://localhost:8082';
};

interface VideoGeneratorProps {
    itineraryId: number;
    onVideoGenerated?: (videoUrl: string) => void;
}

type VideoStatus = 'idle' | 'generating' | 'polling' | 'completed' | 'failed';

export function VideoGenerator({ itineraryId, onVideoGenerated }: VideoGeneratorProps) {
    const [status, setStatus] = useState<VideoStatus>('idle');
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [taskId, setTaskId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const pollStatus = useCallback(async (id: number) => {
        const poll = async () => {
            try {
                const res = await fetch(`${getBackendUrl()}/api/itineraries/${id}/video`);
                const data = await res.json();

                if (data.status === 'succeeded' && data.videoUrl) {
                    setVideoUrl(data.videoUrl);
                    setStatus('completed');
                    onVideoGenerated?.(data.videoUrl);
                    return;
                } else if (data.status === 'failed') {
                    setStatus('failed');
                    setErrorMessage('영상 생성에 실패했습니다.');
                    return;
                }
                // 아직 진행 중이면 3초 후 다시 폴링
                setTimeout(poll, 3000);
            } catch (e) {
                console.error('Polling Error:', e);
                setStatus('failed');
                setErrorMessage('상태 확인 중 오류가 발생했습니다.');
            }
        };
        poll();
    }, [onVideoGenerated]);

    const handleGenerate = async () => {
        setStatus('generating');
        setVideoUrl(null);
        setErrorMessage(null);

        try {
            const res = await fetch(`${getBackendUrl()}/api/itineraries/${itineraryId}/video/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();

            if (data.success && data.taskId) {
                setTaskId(data.taskId);
                setStatus('polling');
                pollStatus(itineraryId);
            } else {
                throw new Error(data.error || '영상 생성 요청에 실패했습니다.');
            }
        } catch (e: any) {
            console.error('Seedance API Error:', e);
            setStatus('failed');
            setErrorMessage(e.message || '알 수 없는 오류가 발생했습니다.');
        }
    };

    const handleOpenVideo = () => {
        if (videoUrl) {
            Linking.openURL(videoUrl);
        }
    };

    const getButtonText = () => {
        switch (status) {
            case 'idle': return '✨ AI 영상 만들기';
            case 'generating': return '🔄 요청 중...';
            case 'polling': return '⏳ 생성 중... (약 2분 소요)';
            case 'completed': return '✅ 완료! 다시 만들기';
            case 'failed': return '❌ 실패 - 다시 시도';
        }
    };

    const isDisabled = status === 'generating' || status === 'polling';

    return (
        <View style={styles.container}>
            <Text style={styles.title}>🎬 Seedance AI 영상</Text>
            <Text style={styles.subtitle}>여행 일정을 기반으로 AI가 영상을 만들어 드립니다</Text>

            <TouchableOpacity
                style={[styles.button, isDisabled && styles.buttonDisabled]}
                onPress={handleGenerate}
                disabled={isDisabled}
                activeOpacity={0.8}
            >
                {isDisabled && <ActivityIndicator color="#fff" style={styles.spinner} />}
                <Text style={styles.buttonText}>{getButtonText()}</Text>
            </TouchableOpacity>

            {taskId && (
                <Text style={styles.taskId}>Task ID: {taskId}</Text>
            )}

            {errorMessage && (
                <Text style={styles.error}>{errorMessage}</Text>
            )}

            {videoUrl && status === 'completed' && (
                <View style={styles.resultContainer}>
                    <Text style={styles.successText}>🎉 영상이 생성되었습니다!</Text>
                    <TouchableOpacity style={styles.playButton} onPress={handleOpenVideo}>
                        <Text style={styles.playButtonText}>▶️ 영상 보기</Text>
                    </TouchableOpacity>
                    <Text style={styles.urlText} numberOfLines={2}>{videoUrl}</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 16,
        backgroundColor: 'rgba(147, 51, 234, 0.1)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(147, 51, 234, 0.3)',
        marginVertical: 12,
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
        color: '#a855f7',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 13,
        color: '#888',
        marginBottom: 16,
    },
    button: {
        backgroundColor: '#9333ea',
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonDisabled: {
        backgroundColor: 'rgba(147, 51, 234, 0.5)',
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    spinner: {
        marginRight: 8,
    },
    taskId: {
        fontSize: 11,
        color: '#666',
        marginTop: 8,
    },
    error: {
        fontSize: 13,
        color: '#ef4444',
        marginTop: 8,
    },
    resultContainer: {
        marginTop: 16,
        padding: 12,
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(34, 197, 94, 0.3)',
    },
    successText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#22c55e',
        marginBottom: 8,
    },
    playButton: {
        backgroundColor: '#22c55e',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
        alignItems: 'center',
    },
    playButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    urlText: {
        fontSize: 11,
        color: '#666',
        marginTop: 8,
    },
});
