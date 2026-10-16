import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import DetailViewerJs from "@/screens/guide/components/DetailViewer";
import type { GuideRow } from "./TripisModal";

const DetailViewer = DetailViewerJs as unknown as React.ComponentType<
  Record<string, unknown>
>;

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
  const sentences = useMemo(
    () => splitSentences(guide.aiGeneratedContent || ""),
    [guide.aiGeneratedContent],
  );

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
  fill: { flex: 1, overflow: "hidden" },
});
