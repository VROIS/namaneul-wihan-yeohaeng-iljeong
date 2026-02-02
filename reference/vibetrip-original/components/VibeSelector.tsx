import React from 'react';
import { Vibe } from '../types';

interface VibeOption {
  id: Vibe;
  label: string;
  icon: string;
}

const VIBE_OPTIONS: VibeOption[] = [
  { id: 'Healing', label: '힐링', icon: 'spa' },
  { id: 'Adventure', label: '모험', icon: 'hiking' },
  { id: 'CityPop', label: '시티팝', icon: 'location_city' },
  { id: 'Foodie', label: '미식', icon: 'restaurant_menu' },
  { id: 'Romantic', label: '로맨틱', icon: 'favorite' },
  { id: 'Culture', label: '문화/예술', icon: 'temple_buddhist' },
];

interface Props {
  selectedVibes: Vibe[];
  onToggle: (vibe: Vibe) => void;
}

export const VibeSelector: React.FC<Props> = ({ selectedVibes, onToggle }) => {
  return (
    <div className="grid grid-cols-3 gap-3">
      {VIBE_OPTIONS.map((vibe) => {
        const isSelected = selectedVibes.includes(vibe.id);
        return (
          <button
            key={vibe.id}
            onClick={() => onToggle(vibe.id)}
            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border transition-all ${
              isSelected
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200 scale-105'
                : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
            }`}
          >
            <span className={`material-symbols-outlined text-2xl ${isSelected ? 'text-white' : 'text-slate-400'}`}>
              {vibe.icon}
            </span>
            <span className="text-xs font-bold">{vibe.label}</span>
          </button>
        );
      })}
    </div>
  );
};
