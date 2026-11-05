// Screen + rule + exact affected target; new nodes for the same rule still fail.
// Exceptions describe existing production UI that its owner hasn't fixed yet; each says where the fix belongs.
export const axeKnown: {
  screen: string;
  rule: string;
  target: string;
  reason: string;
}[] = [
  { screen: 'tv', rule: 'aria-prohibited-attr', target: JSON.stringify(['.tv-seat-crown']), reason: 'Host crown span has aria-label without an accessible role; fix belongs to src/tv/TvApp.' },
  { screen: 'tv', rule: 'label-content-name-mismatch', target: JSON.stringify(['button[aria-label="Switch to English"]']), reason: 'TV language button displays EN but its accessible name spells out English; fix belongs to src/tv/TvApp.' },
];
