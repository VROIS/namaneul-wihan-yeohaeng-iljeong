// 📖 TRIPIS 콘텐츠 본문 슬롯 = 기존 DetailViewer(내손앱 실증 클론)를 내부 무수정으로 그대로 끼움(§16, B-0 사장님 결정)
// = 보관함(guides) 행 1건을 보기 전용으로 표시: 사진 + 해설 낭독(TTS = 뷰어 내장) + 위치명.
// = 저장 콜백은 넘기지 않는다(보기 전용 = 이미 저장된 콘텐츠).
// = 뷰어의 자체 닫기(←)에는 모달 onClose 를 연결 = 껍데기 [X]와 어느 쪽을 눌러도 닫힘.
import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import DetailViewerJs from "@/screens/guide/components/DetailViewer";
import type { GuideRow } from "./TripisModal";

// 레거시 모듈 = JS(무타입) = allowJs import → ComponentType 배선(타입만, 동작 무관 = GuideStackNavigator 와 동일 패턴 §16)
const DetailViewer = DetailViewerJs as unknown as React.ComponentType<
  Record<string, unknown>
>;

// 문장 분리 = GuideStackNavigator 스트리밍 수신부와 동일 기준 = [.?!] 종결부호 단위(운영 index.js 클론)
function splitSentences(text: string): string[] {
  const out: string[] = [];
  let buf = text;
  let idx = buf.search(/[.?!]/);
  while (idx !== -1) {
    const sentence = buf.substring(0, idx + 1).trim();
    buf = buf.substring(idx + 1);
    if (sentence) out.push(sentence);
    idx = buf.search(/[.?!]/);
  }
  const rest = buf.trim();
  if (rest) out.push(rest);
  return out;
}

interface Props {
  guide: GuideRow;
  onClose(): void; // 뷰어 자체 닫기(←) = 모달 닫기와 동일 동작
}

export default function GuideViewSlot({ guide, onClose }: Props) {
  // 저장 당시 해설 전체를 문장 배열로 = 뷰어가 문장별 낭독·하이라이트 자체 처리
  const sentences = useMemo(
    () => splitSentences(guide.aiGeneratedContent || ""),
    [guide.aiGeneratedContent],
  );

  // 뷰어 lang 키(ko/en/ja/zh-CN/fr/de/es) = 저장된 voiceLang(예: ko-KR)에서 도출
  const lang = guide.voiceLang?.startsWith("zh")
    ? "zh-CN"
    : (guide.voiceLang || "ko").split("-")[0];

  return (
    <View style={styles.fill}>
      <DetailViewer
        imageUri={guide.imageUrl || undefined}
        sentences={sentences}
        loading={false}
        loadingText=""
        done={true}
        locationName={guide.locationName}
        voiceQuery={null}
        mode="camera"
        lang={lang}
        onClose={onClose}
        onSave={undefined}
        onAskAgain={undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // DetailViewer 는 absolute 전체채움 = 부모가 본문 영역을 flex 로 차지해야 그 안에 가둬짐
  fill: { flex: 1, overflow: "hidden" },
});
