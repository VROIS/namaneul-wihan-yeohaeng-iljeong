// 중앙 캐릭터 카드(전신 이미지) = BTSPlaceCartScreen 분리(2026-07-16 §0 슬림화, 순수 이동)
import React from "react";
import { View } from "react-native";
import { Image } from "expo-image";

import { BTS_CHARACTER_IMAGES } from "@/constants/bts-characters";
import { styles } from "../styles";

// ⚠️ 수정금지(승인필요) — 중앙 캐릭터 카드 (전신 이미지만)
// ⚠️ 수정금지(승인필요) — 2026-04-23 Track 1b-⑦⑧: DIM 오버레이 제거 + tilt/scale 애니메이션 제거 (selectedCount 의존 useEffect 삭제). 정적 표시로 GPU 레이어 축소.
// TODO: Rive 파일(.riv) 수급 후 <Rive source=... />로 대체 — 캐릭터별 7종
function CharacterHero({
  characterId,
  gradient,
  w,
  h,
}: {
  characterId: string;
  gradient: readonly [string, string];
  w: number;
  h: number;
}) {
  const imgSource = BTS_CHARACTER_IMAGES[characterId] || BTS_CHARACTER_IMAGES.collector;

  return (
    <View
      style={[
        styles.heroCard,
        {
          width: w,
          height: h,
          shadowColor: gradient[0],
        },
      ]}
    >
      <Image
        source={imgSource}
        style={styles.heroImage}
        contentFit="cover"
        priority="low"
        cachePolicy="memory-disk"
        transition={200}
      />
    </View>
  );
}

export default CharacterHero;
