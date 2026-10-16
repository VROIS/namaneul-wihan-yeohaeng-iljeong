import React from 'react';
import { Place } from '../types';

interface Props {
  place: Place;
  onPreview: (place: Place) => void;
}

export const PlaceCard: React.FC<Props> = ({ place, onPreview }) => {
  const isAlert = place.realityCheck?.status === 'Alert' || place.realityCheck?.penaltyNote;
  
  const imageUrl = place.image && place.image.startsWith('http') 
    ? place.image 
    : `https://source.unsplash.com/featured/?${encodeURIComponent(place.name)},travel,architecture`;

  return (
    <div className={`bg-white rounded-[2.5rem] border overflow-hidden shadow-sm hover:shadow-2xl transition-all duration-700 ${isAlert ? 'border-rose-200' : 'border-slate-100'}`}>
      <div className="relative h-64 overflow-hidden">
        <img 
          src={imageUrl} 
          alt={place.name} 
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        
        <div className="absolute top-5 left-5 flex flex-col gap-2">
          <div className="flex gap-2">
            <span className={`px-4 py-2 rounded-2xl text-[10px] font-black shadow-xl backdrop-blur-xl ${
              place.realityCheck?.status === 'Open' ? 'bg-emerald-500 text-white' : 
              place.realityCheck?.status === 'Alert' ? 'bg-rose-500 text-white' : 'bg-white/90 text-slate-900'
            }`}>
              {place.realityCheck?.status === 'Open' ? '● OPERATIONAL' : 
               place.realityCheck?.status === 'Alert' ? '● CAUTION' : '○ CHECKING'}
            </span>
          </div>
        </div>

        <div className="absolute bottom-5 left-5 right-5">
           <div className="bg-slate-900/60 backdrop-blur-2xl p-4 rounded-3xl border border-white/20 flex justify-between items-center shadow-2xl">
              <div className="flex flex-col">
                <span className="text-white/50 text-[8px] font-black uppercase tracking-widest">Data Trust</span>
                <span className="text-white text-base font-black">{place.confidenceScore || 95}%</span>
              </div>
              <div className="h-8 w-[1px] bg-white/10"></div>
              <div className="flex flex-col items-end">
                <span className="text-indigo-300/50 text-[8px] font-black uppercase tracking-widest">Vibe Match</span>
                <span className="text-indigo-300 text-base font-black">{place.vibeScore || 98}%</span>
              </div>
           </div>
        </div>
      </div>
      
      <div className="p-7">
        <h3 className="font-black text-slate-900 text-2xl mb-2 tracking-tight">{place.name}</h3>
        
        {place.realityCheck?.penaltyNote && (
          <div className="bg-rose-50 p-4 rounded-2xl mb-5 border border-rose-100">
            <p className="text-[11px] text-rose-800 font-bold leading-tight">
              {place.realityCheck.penaltyNote}
            </p>
          </div>
        )}

        <div className="bg-slate-50 p-5 rounded-3xl mb-5 border border-slate-100">
          <p className="text-[13px] text-slate-700 font-bold leading-relaxed">
            {place.personaFitReason}
          </p>
        </div>

        <div className="flex items-center justify-between pt-5 border-t border-slate-50">
          <span className="text-[11px] font-black text-slate-400">{place.priceEstimate || '비용 정보 없음'}</span>
          <button className="px-5 py-2.5 bg-indigo-600 text-white font-black rounded-xl text-[10px]">
            상세 정보
          </button>
        </div>
      </div>
    </div>
  );
};
