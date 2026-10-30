/**
 * Shared SVG defs for the drawn props (the bottle's board, the wheel's hub, the cup of sticks).
 * Render once per SVG. The ids are old names; the looks belong to the night room.
 */
export function PorcelainDefs() {
  return (
    <defs>
      <radialGradient id="plate" cx="40%" cy="30%" r="80%">
        <stop offset="0%" stopColor="#35325a" />
        <stop offset="60%" stopColor="#221f44" />
        <stop offset="100%" stopColor="#181633" />
      </radialGradient>
      <radialGradient id="glass" cx="50%" cy="45%" r="60%">
        <stop offset="0%" stopColor="rgba(255,255,255,0.1)" />
        <stop offset="100%" stopColor="rgba(255,255,255,0.03)" />
      </radialGradient>
      <radialGradient id="lampPool" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="var(--gel, #b072ff)" stopOpacity={0.22} />
        <stop offset="60%" stopColor="var(--gel, #b072ff)" stopOpacity={0.06} />
        <stop offset="100%" stopColor="var(--gel, #b072ff)" stopOpacity={0} />
      </radialGradient>
      <radialGradient id="lacquer" cx="50%" cy="40%" r="70%">
        <stop offset="0%" stopColor="#2c2955" />
        <stop offset="100%" stopColor="#131030" />
      </radialGradient>
      <linearGradient id="bamboo" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#d9d6f0" />
        <stop offset="50%" stopColor="#ffffff" />
        <stop offset="100%" stopColor="#b9b5da" />
      </linearGradient>
      <filter id="dishShadow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#05040f" floodOpacity="0.6" />
      </filter>
      <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#05040f" floodOpacity="0.5" />
      </filter>
    </defs>
  );
}
