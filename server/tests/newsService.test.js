import { describe, expect, it } from 'vitest';
import { filterRelevantArticles } from '../src/services/newsService.js';

describe('news entity and recency filtering', () => {
  it('does not attribute Reliance Communications news to Reliance Industries', () => {
    const now = new Date('2026-09-01T10:00:00Z');
    const articles = [
      { title: 'Reliance Communications faces debt action', publishedAt: now },
      { title: 'Reliance Industries receives regulatory nod for Jio IPO', publishedAt: now },
    ];
    expect(filterRelevantArticles('RELIANCE', articles, now).map((a) => a.title)).toEqual([
      'Reliance Industries receives regulatory nod for Jio IPO',
    ]);
  });

  it('removes headlines older than the declared 14-day news window', () => {
    const now = new Date('2026-09-01T10:00:00Z');
    const articles = [
      { title: 'RELIANCE old result', publishedAt: new Date('2026-08-01T10:00:00Z') },
      { title: 'RELIANCE current result', publishedAt: new Date('2026-08-31T10:00:00Z') },
    ];
    expect(filterRelevantArticles('RELIANCE', articles, now)).toHaveLength(1);
  });
});
