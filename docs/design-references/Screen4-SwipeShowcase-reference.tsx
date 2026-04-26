/**
 * REF — 스크린 4: 8장의 카드 한 장 선택 후 같은 페이지에서 스크롤로 나올 화면 구성 예시
 * 저장일: 2026-04-22 (사용자 제공)
 *
 * 원본 기술: React + Framer Motion (웹 전용 프로토타입)
 *
 * ─── 핵심 구성 ───────────────────────────────────
 * 1) 메인 이미지 영역 (풀스크린, 높이 400px)
 *    - motion.div drag="x" + useMotionValue(x) + animate(spring)
 *    - 드래그 종료 시 offset 30% 또는 velocity 500+ 기준 snap → 이전/다음 인덱스
 *    - Prev/Next 버튼 + "1/12" 카운터
 *
 * 2) 하단 썸네일 바 (가로 스크롤)
 *    - 선택된 것 = 120px 확장 (FULL_WIDTH)
 *    - 나머지 = 35px 축소 (COLLAPSED_WIDTH)
 *    - motion.button variants로 width 애니메이션 (0.3s easeOut)
 *    - 현재 선택된 썸네일이 화면 중앙에 오도록 scrollTo({behavior:'smooth'})
 *
 * ─── 투명도 / BlurView 분석 (사용자 질문 답) ─────────
 * ❌ BlurView 미사용 — 이 코드는 투명/블러 효과 "거의 없음"
 *
 *   · 메인 컨테이너: bg-gray-100 (불투명 회색 배경)
 *   · 이미지 <img>: object-cover, 불투명
 *   · Prev/Next 버튼: bg-white (불투명 흰 원형)
 *   · 카운터 뱃지: bg-black/50 (검정 50% 알파만, blur 아님)
 *   · 썸네일 버튼: button 기본 (투명 배경) + img만 표시
 *
 *   즉 "유리 느낌" 연출 아니라 **단순 flex carousel + 썸네일 bar**.
 *   BlurView로 감싸고 싶다면 이 구조 위에 별도 레이어 추가해야 함.
 *
 * ─── React Native 이식 가능성 ────────────────────
 * Framer Motion → React Native 대응:
 *   - motion.div drag="x" + useMotionValue → react-native-reanimated + gesture-handler PanGesture
 *   - animate(spring) → withSpring
 *   - motion.button variants width → Animated.View + useSharedValue + withTiming
 *   - scrollTo({behavior:'smooth'}) → ScrollView ref + scrollTo({animated:true})
 *   - <img> → expo-image <Image>
 * 이식 복잡도: 중간
 *
 * ─── 현재 프로젝트와의 관계 ──────────────────────
 * · Screen 4 궤도형 8 카드 → Swipe Showcase 전환 시 참고할 상호작용 패턴
 * · URL 카탈로그 시안 B (TikTok/Airbnb Stories) 구현 예시
 * · 카드 1장 선택 후 풀스크린으로 확대 + 썸네일 rail 동시 보기 UX
 * · 사진을 "최대한 크게 보여주기" + "8장 동시 접근" 두 요구 동시 충족
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';

const items = [
  {
    id: 1,
    url: 'https://plus.unsplash.com/premium_photo-1712685912272-96569030d1d7?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=1175',
    title: 'A large body of water surrounded by mountains',
  },
  {
    id: 2,
    url: 'https://plus.unsplash.com/premium_photo-1761478617343-12a3dd981cf6?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=1175',
    title: 'Abstract streaks of pink and blue on black',
  },
  {
    id: 3,
    url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=880&h=600&fit=crop',
    title: 'Mountain Summit',
  },
  {
    id: 4,
    url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=880&h=600&fit=crop',
    title: 'Alpine Landscape',
  },
  {
    id: 5,
    url: 'https://images.unsplash.com/photo-1519904981063-b0cf448d479e?w=880&h=600&fit=crop',
    title: 'Mountain Range',
  },
  {
    id: 6,
    url: 'https://images.unsplash.com/photo-1454496522488-7a8e488e8606?w=880&h=600&fit=crop',
    title: 'Mountain Wilderness',
  },
  {
    id: 7,
    url: 'https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?w=880&h=600&fit=crop',
    title: 'Mountain Trail',
  },
  {
    id: 8,
    url: 'https://plus.unsplash.com/premium_photo-1761940415449-c09ef466c698?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=715',
    title: 'A lone figure stands on a futuristic, reflective surface.',
  },
  {
    id: 9,
    url: 'https://images.unsplash.com/photo-1486870591958-9b9d0d1dda99?w=880&h=600&fit=crop',
    title: 'Rocky Cliffs',
  },
  {
    id: 10,
    url: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=880&h=600&fit=crop',
    title: 'Forest Path',
  },
  {
    id: 11,
    url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=880&h=600&fit=crop',
    title: 'Green Hills',
  },
  {
    id: 12,
    url: 'https://images.unsplash.com/photo-1426604966848-d7adac402bff?w=880&h=600&fit=crop',
    title: 'Sunrise Peak',
  },
];

const FULL_WIDTH_PX = 120;
const COLLAPSED_WIDTH_PX = 35;
const GAP_PX = 2;
const MARGIN_PX = 2;

function Thumbnails({ index, setIndex }) {
  const thumbnailsRef = useRef(null);

  useEffect(() => {
    if (thumbnailsRef.current) {
      let scrollPosition = 0;
      for (let i = 0; i < index; i++) {
        scrollPosition += COLLAPSED_WIDTH_PX + GAP_PX;
      }

      scrollPosition += MARGIN_PX;

      const containerWidth = thumbnailsRef.current.offsetWidth;
      const centerOffset = containerWidth / 2 - FULL_WIDTH_PX / 2;
      scrollPosition -= centerOffset;

      thumbnailsRef.current.scrollTo({
        left: scrollPosition,
        behavior: 'smooth',
      });
    }
  }, [index]);

  return (
    <div
      ref={thumbnailsRef}
      className='overflow-x-auto'
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      <style>{`
        .overflow-x-auto::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div className='flex gap-0.5 h-20 pb-2' style={{ width: 'fit-content' }}>
        {items.map((item, i) => (
          <motion.button
            key={item.id}
            onClick={() => setIndex(i)}
            initial={false}
            animate={i === index ? 'active' : 'inactive'}
            variants={{
              active: {
                width: FULL_WIDTH_PX,
                marginLeft: MARGIN_PX,
                marginRight: MARGIN_PX,
              },
              inactive: {
                width: COLLAPSED_WIDTH_PX,
                marginLeft: 0,
                marginRight: 0,
              },
            }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className='relative shrink-0 h-full overflow-hidden rounded'
          >
            <img
              src={item.url}
              alt={item.title}
              className='w-full h-full object-cover pointer-events-none select-none'
              draggable={false}
            />
          </motion.button>
        ))}
      </div>
    </div>
  );
}

export default function Component() {
  const [index, setIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  const x = useMotionValue(0);

  useEffect(() => {
    if (!isDragging && containerRef.current) {
      const containerWidth = containerRef.current.offsetWidth || 1;
      const targetX = -index * containerWidth;

      animate(x, targetX, {
        type: 'spring',
        stiffness: 300,
        damping: 30,
      });
    }
  }, [index, x, isDragging]);

  return (
    <div className='w-full max-w-3xl mx-auto p-4 lg:p-10'>
      <div className='flex flex-col gap-3'>
        {/* Main Carousel */}
        <div className='relative overflow-hidden rounded-lg bg-gray-100' ref={containerRef}>
          <motion.div
            className='flex'
            drag='x'
            dragElastic={0.2}
            dragMomentum={false}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={(e, info) => {
              setIsDragging(false);
              const containerWidth = containerRef.current?.offsetWidth || 1;
              const offset = info.offset.x;
              const velocity = info.velocity.x;

              let newIndex = index;

              // If fast swipe, use velocity
              if (Math.abs(velocity) > 500) {
                newIndex = velocity > 0 ? index - 1 : index + 1;
              }
              // Otherwise use offset threshold (30% of container width)
              else if (Math.abs(offset) > containerWidth * 0.3) {
                newIndex = offset > 0 ? index - 1 : index + 1;
              }

              // Clamp index
              newIndex = Math.max(0, Math.min(items.length - 1, newIndex));
              setIndex(newIndex);
            }}
            style={{ x }}
          >
            {items.map((item) => (
              <div key={item.id} className='shrink-0 w-full h-[400px]'>
                <img
                  src={item.url}
                  alt={item.title}
                  className='w-full h-full object-cover rounded-lg select-none pointer-events-none'
                  draggable={false}
                />
              </div>
            ))}
          </motion.div>

          {/* Previous Button */}
          <motion.button
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className={`absolute left-4 text-black top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-transform z-10
              ${
                index === 0
                  ? 'opacity-40 cursor-not-allowed'
                  : 'bg-white hover:scale-110 hover:opacity-100 opacity-70'
              }`}
          >
            <svg
              className='w-6 h-6'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M15 19l-7-7 7-7'
              />
            </svg>
          </motion.button>

          {/* Next Button */}
          <motion.button
            disabled={index === items.length - 1}
            onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
            className={`absolute text-black right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-transform z-10
              ${
                index === items.length - 1
                  ? 'opacity-40 cursor-not-allowed'
                  : 'bg-white hover:scale-110 hover:opacity-100 opacity-70'
              }`}
          >
            <svg
              className='w-6 h-6'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M9 5l7 7-7 7'
              />
            </svg>
          </motion.button>

          {/* Image Counter */}
          <div className='absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-sm'>
            {index + 1} / {items.length}
          </div>
        </div>

        <Thumbnails index={index} setIndex={setIndex} />
      </div>
    </div>
  );
}
