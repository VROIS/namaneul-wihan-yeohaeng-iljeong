const { GoogleGenAI } = require('@google/genai');
const key = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey: key });

// Already-generated slots (places + times only, no route optimization, no prices)
const existingSlots = {
  days: [
    { day: 1, places: [
      { name: 'Louvre Museum', type: 'activity', startTime: '09:00', endTime: '11:00' },
      { name: 'Bouillon Chartier Grands Boulevards', type: 'lunch', startTime: '12:00', endTime: '13:30' },
      { name: 'Tuileries Garden', type: 'activity', startTime: '13:30', endTime: '15:30' },
      { name: 'Eiffel Tower', type: 'activity', startTime: '16:00', endTime: '18:00' },
      { name: 'Le Comptoir du Relais', type: 'dinner', startTime: '19:00', endTime: '20:30' }
    ]},
    { day: 2, places: [
      { name: 'Palace of Versailles', type: 'activity', startTime: '09:00', endTime: '12:00' },
      { name: 'L Angelus', type: 'lunch', startTime: '13:00', endTime: '14:30' },
      { name: 'Montmartre', type: 'activity', startTime: '15:00', endTime: '17:00' },
      { name: 'Sacre-Coeur Basilica', type: 'activity', startTime: '17:00', endTime: '18:30' },
      { name: 'Le Relais de l Entrecote', type: 'dinner', startTime: '19:30', endTime: '21:00' }
    ]}
  ]
};

const prompt = `You are a Paris travel expert. Given this 2-day itinerary:
${JSON.stringify(existingSlots)}

Tasks:
1. Reorder places within each day if routing is inefficient (minimize backtracking)
2. Add 2026 actual admission prices in EUR (estimatedCostEur) per person
3. Add transit info in "reason" field: how to get there from previous place (metro line / walk / bus) and minutes

Respond JSON only:
{"days":[{"day":1,"places":[{"name":"","nameKo":"Korean name","type":"","startTime":"","endTime":"","reason":"transit + why visit","estimatedCostEur":0}]}]}`;

console.log('Prompt length:', prompt.length, 'chars');

const t0 = Date.now();
ai.models.generateContent({
  model: 'gemini-3-flash-preview',
  contents: [{ role: 'user', parts: [{ text: prompt }] }],
  config: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: 'application/json' }
}).then(r => {
  const ms = Date.now() - t0;
  const text = r.text || '';
  console.log('Response time:', ms + 'ms');
  console.log('Response length:', text.length, 'chars');
  try {
    const j = JSON.parse(text);
    const d1 = j.days[0].places;
    const d2 = j.days[1] ? j.days[1].places : [];
    console.log('Day1 order:', d1.map(p => p.name).join(' -> '));
    console.log('Day2 order:', d2.map(p => p.name).join(' -> '));
    console.log('');
    d1.slice(0, 3).forEach(p => {
      console.log(`[${p.name}] ${p.startTime}-${p.endTime} | EUR:${p.estimatedCostEur} | ${(p.reason||'').substring(0,80)}`);
    });
  } catch(e) {
    console.log('Parse error, first 300 chars:', text.substring(0, 300));
  }
}).catch(e => console.error('Error:', e.message));
