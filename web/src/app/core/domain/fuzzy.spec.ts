import { rank, score } from './fuzzy';

// Ported from FuzzyTest.kt.
describe('Fuzzy', () => {
  it('totr matches take out trash', () => {
    expect(score('totr', 'take out trash')).not.toBeNull();
  });

  it('non-subsequence does not match', () => {
    expect(score('xyz', 'take out trash')).toBeNull();
    expect(score('trot', 'take out trash')).toBeNull();
  });

  it('match is case-insensitive', () => {
    expect(score('TOTR', 'Take Out Trash')).not.toBeNull();
  });

  it('word-boundary initials beat scattered matches', () => {
    const ranked = rank('totr', ['the other train', 'take out trash']);
    expect(ranked[0]).toBe('take out trash');
  });

  it('rank filters non-matches and respects limit', () => {
    const candidates = ['walk dog', 'take out trash', 'water plants', 'buy milk'];
    const ranked = rank('wa', candidates, 1);
    expect(ranked.length).toBe(1);
    expect(['walk dog', 'water plants']).toContain(ranked[0]);
  });

  it('empty query matches everything with zero score', () => {
    expect(score('', 'anything')).toBe(0);
  });

  it('exact prefix scores higher than gapped match', () => {
    const prefix = score('take', 'take out trash')!;
    const gapped = score('tkot', 'take out trash')!;
    expect(prefix).toBeGreaterThan(gapped);
  });
});
