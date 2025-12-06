// app/lib/draw.ts
export type Participant = { id: string; name: string };
export type Prize = { id: string; title: string; quantity: number };

// Linear Congruential Generator (seeded random) để audit
export function seededRandom(prevSeed: number) {
  const next = (prevSeed * 1664525 + 1013904223) % 4294967296;
  return { nextSeed: next, value: next / 4294967296 };
}