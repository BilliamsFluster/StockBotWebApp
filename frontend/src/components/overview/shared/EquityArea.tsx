export function EquityArea({tone}:{tone?:"blue"|"purple"}) {
  const c = tone==="blue" ? "#3b82f6" : "#8b5cf6"; // blue-500, violet-500
  return (
    <div className="h-32 rounded-lg bg-muted/40 flex items-center justify-center">
      <svg viewBox="0 0 100 40" className="w-full h-full p-2" style={{color:c}}>
        <defs>
          <linearGradient id={`g-eq-${tone??"default"}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity=".4" />
            <stop offset="100%" stopColor="currentColor" stopOpacity=".05" />
          </linearGradient>
        </defs>
        <path d="M0,30 L10,28 L20,32 L30,24 L40,26 L50,18 L60,22 L70,15 L80,16 L90,8 L100,12 L100,40 L0,40 Z" fill={`url(#g-eq-${tone??"default"})`} />
        <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points="0,30 10,28 20,32 30,24 40,26 50,18 60,22 70,15 80,16 90,8 100,12" />
      </svg>
    </div>
  );
}
