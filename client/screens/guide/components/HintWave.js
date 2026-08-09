// ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 — 라이브뷰 사용법 1줄을 **글자마다 아래로 처지게** 한다.
// 왜: 가만히 있는 글자는 죽어 보인다(사장님 판정). 그리고 물결이 **아래로만** 흐르므로
//     시선이 자연스럽게 하단 [촬영]·[업로드] 버튼 쪽으로 끌린다 = 움직임이 방향을 가리킨다(§23 정합).
//
// ⚠️ 웹 부품(Elastic Text = framer-motion)은 앱에서 안 돈다 = RN 에 framer-motion 이 없다.
//    그래서 같은 느낌(글자별 스프링 + 이웃으로 번지는 지연)을 reanimated 로 만든다.
//    끌어당기는 조작은 넣지 않는다 = 이 글자는 만지는 것이 아니라 보는 것이고,
//    카메라 화면에서 손가락은 [촬영] 버튼으로 가야 한다.
import React, { useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';

import { theme } from '../styles/theme';

// ⚠️⚠️ 미검증 = 실기기 확인 필요 (2026-08-08, 판단3종 지적 · 사장님 승인으로 열어둠)
//   글자 1자당 Animated.Text 1개(한국어 약 30개)가 **카메라 라이브뷰 위에서 매 프레임** 갱신된다.
//   아이폰12·저사양 안드로이드에서 프리뷰가 끊기는지 미확인. 웹에서는 창이 가려지면 브라우저가
//   초당 1회로 묶어버려 **프레임을 잴 수 없다**(실측 2026-08-08 = 1fps 는 가짜 값).
//   재현 = 실기기에서 Tripis 탭을 30초 켜두고 프리뷰가 매끄러운지·뒷면이 뜨거워지는지 보기.
//   느리면 손댈 자리 = AMP·STRETCH 를 줄이거나 PERIOD_MS 를 늘리는 것이 아니라 **글자 수**(문구 길이)다.
//   정본 문서 = docs/2026-08-08 화면·모달·버튼 구조도.md §7-4
const AMP = 15; // 아래로 처지는 최대 깊이(px)
const PERIOD_MS = 2600; // 물결 하나가 글자 줄을 지나가는 시간 = 아주 느리게
const STEP = 0.38; // 옆 글자로 번지는 지연(= Elastic Text 의 follow 와 같은 역할)
// ⚠️ 수정금지(승인필요) 2026-08-08 사장님 지시 — 늘어남을 **최대로**. 글자가 안개처럼 흐려질 만큼
//   길게 끌려 내려가야 그 글자 자체가 **아래를 가리키는 화살표**가 된다(= 화살표 아이콘을 안 그려도 된다).
const STRETCH = 1.4; // 세로로 최대 2.4 배 = 엿가락처럼 끌려 내려감
const SQUEEZE = 0.18; // 늘어난 만큼 가로로 얇아진다 = 부피가 유지되는 고무줄
const FADE = 0.55; // 최대로 늘어났을 때 흐려지는 정도 = "안개"

// ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 = memo 로 감싼다.
//   카메라 화면은 상태가 자주 바뀌는데, 안 감싸면 그때마다 글자 30개가 통째로 다시 그려진다.
// ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 = **글자 크기를 폭에 맞춰 스스로 줄인다.**
//   글자를 한 자씩 따로 그리므로 줄바꿈이 **물리적으로 불가능**하다 = 길면 그냥 카드 밖으로 넘친다.
//   한국어(14자)만 실측해 21px 로 잡았는데 영어 36자·독일어 39자는 330px 칸을 55~95px 넘겼다
//   = 양끝 글자가 어두운 막 밖으로 나가 **막을 깐 목적(밝은 데서 읽히게)이 그 글자에서 무효**가 된다.
//   글자 폭 어림 = 한글·한자·가나 1.0 / 라틴·숫자 0.55 / 띄어쓰기 0.3 (em 기준).
const BASE_SIZE = 21; // theme.hintText 의 기본 크기 = 여기서부터 줄어들기만 한다
const CJK = /[가-힣ぁ-んァ-ヶ一-龥]/;
const emOf = (ch) => (ch === ' ' || ch === ' ' ? 0.3 : CJK.test(ch) ? 1.0 : 0.55);

const Letter = React.memo(function Letter({ ch, order, phase, still, size }) {
  const style = useAnimatedStyle(() => {
    // ⚠️ 수정금지(승인필요) 2026-08-08 = "동작 줄이기"면 **글자 스스로 제자리**를 그린다.
    //   위상만 되돌리는 방식은 멈추는 시점과 어긋나 글자가 2.4배로 늘어난 채 얼어붙었다(실측).
    //   여기서 끊으면 순서와 무관하게 항상 제자리다.
    if (still) return { opacity: 1, transform: [] };
    const s = Math.sin(phase.value - order * STEP);
    const dip = s > 0 ? s : 0; // 위로는 안 뜬다 = **아래로만** 흘러내린다
    return {
      opacity: 1 - dip * FADE,
      transform: [
        { translateY: dip * AMP },
        { scaleY: 1 + dip * STRETCH },
        { scaleX: 1 - dip * SQUEEZE },
      ],
    };
  }, [order, still]);

  const sized = size
    ? { fontSize: size, lineHeight: Math.round(size * 1.43) }
    : null;

  // 공백도 한 글자로 세야 물결 간격이 고르다.
  // 띄어쓰기는 **줄바꿈 안 되는 공백**( )으로 바꾼다 = 글자를 한 자씩 그리면 보통 공백은 폭이 죽는다.
  // 코드로 명시한다 = 눈으로는 보통 공백과 구별이 안 돼 후임이 무의미한 코드로 오해한다(실제 오해 있었음).
  return (
    <Animated.Text style={[theme.hintText, sized, style]}>
      {ch === ' ' ? ' ' : ch}
    </Animated.Text>
  );
});

export default function HintWave({ text }) {
  const phase = useSharedValue(0);
  const { width: sw } = useWindowDimensions();

  // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 승인 = **"동작 줄이기"를 켠 분에게는 물결이 안 흐른다.**
  //   매 프레임을 손수 더하는 방식이라 reanimated 의 자동 보호 밖이다(카드 날기 등은 자동으로 따름).
  //   ⚠️ 글자는 그대로 다 보인다 = 못 읽게 막는 게 아니라 **움직임만** 멈춘다.
  const reduceMotion = useReducedMotion();

  // ⚠️ dt 는 40ms 로 자른다 = 화면이 잠깐 멈췄다 돌아올 때 한 번에 확 튀는 것 방지
  useFrameCallback((f) => {
    'worklet';
    if (reduceMotion) return;
    const ms = f.timeSincePreviousFrame;
    const dt = Math.min(typeof ms === 'number' && ms > 0 ? ms : 16, 40);
    phase.value += (2 * Math.PI * dt) / PERIOD_MS;
  }, true);

  // 줄바꿈은 글이 직접 정한다(translations.js) = 자동으로 맡기면 낱말이 쪼개진다
  const rows = useMemo(() => {
    let order = 0;
    return text.split('\n').map((line) =>
      Array.from(line).map((ch) => ({ ch, order: order++ })),
    );
  }, [text]);

  // 가장 긴 줄이 카드 안에 들어가는 크기로 줄인다(줄어들 뿐, 커지지는 않는다).
  //   쓸 수 있는 폭 = 화면폭 − hintWrap 좌우 14×2 − hintCard 좌우 16×2
  const fitSize = useMemo(() => {
    const avail = sw - 14 * 2 - 16 * 2;
    const widest = Math.max(
      ...rows.map((r) => r.reduce((w, c) => w + emOf(c.ch), 0)),
      1,
    );
    return Math.max(13, Math.min(BASE_SIZE, Math.floor(avail / widest)));
  }, [rows, sw]);

  // ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 = **한 문장으로 읽히게 묶는다.**
  //   글자를 한 자씩 그리므로, 안 묶으면 읽어주는 기능이 "촬" "영" "·" … 30번을 따로 읽는다.
  //   바깥을 하나로 묶고 낱글자는 감춘다 = 한 번에 문장 전체가 읽힌다.
  return (
    <View accessible accessibilityLabel={text.replace(/\n/g, ' ')}>
      {rows.map((row, i) => (
        <View
          key={i}
          style={theme.hintRow}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {row.map((c) => (
            <Letter
              key={c.order}
              ch={c.ch}
              order={c.order}
              phase={phase}
              still={reduceMotion}
              size={fitSize}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
