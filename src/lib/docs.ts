import { getCollection, type CollectionEntry } from 'astro:content';

export type Doc = CollectionEntry<'archive'>;

export const SECTIONS = [
  'now',
  'strategy',
  'gtm',
  'product',
  'brand',
  'research',
  'company',
] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_BLURBS: Record<Section, string> = {
  now: 'What is true right now — current focus, constraints, open loops.',
  strategy: 'The long lines: thesis, positioning, how Rebl wins.',
  gtm: 'Action out: playbooks, outreach scripts, DM templates, campaigns, the founding-house pitch.',
  product: 'Specs, phases, and what ships next.',
  brand: 'Voice, identity, and how Rebl shows up.',
  research: 'Evidence in: interviews, notes, market signal. Research is separate from GTM on purpose.',
  company: 'Ops, money, legal, and the machinery of the company itself.',
};

export async function getAllDocs(): Promise<Doc[]> {
  return getCollection('archive');
}

export function sectionOf(doc: Doc): Section {
  return doc.data.section;
}

export function slugOf(doc: Doc): string {
  // id looks like "strategy/founding-thesis-v0-3"
  const parts = doc.id.split('/');
  return parts[parts.length - 1];
}

export function urlOf(doc: Doc): string {
  return `/archive/${sectionOf(doc)}/${slugOf(doc)}/`;
}

export function parseVersion(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/** Doc identity = title (within a section). Returns all versions of the same doc, newest first. */
export function versionsOf(doc: Doc, all: Doc[]): Doc[] {
  return all
    .filter((d) => d.data.section === doc.data.section && d.data.title === doc.data.title)
    .sort((a, b) => parseVersion(b.data.version) - parseVersion(a.data.version));
}

/** Highest non-superseded version renders as current. */
export function currentOf(doc: Doc, all: Doc[]): Doc | undefined {
  return versionsOf(doc, all).find((d) => d.data.status !== 'superseded');
}

export function isCurrent(doc: Doc, all: Doc[]): boolean {
  return currentOf(doc, all)?.id === doc.id;
}

/** All versions of this doc except the current one, newest first. */
export function olderVersionsOf(doc: Doc, all: Doc[]): Doc[] {
  const current = currentOf(doc, all);
  return versionsOf(doc, all).filter((d) => d.id !== current?.id);
}

/** One entry per doc identity: only the current version. */
export function currentDocs(all: Doc[]): Doc[] {
  return all.filter((d) => isCurrent(d, all));
}

/** Section index order: locked first, then by date desc. */
export function sortForIndex(docs: Doc[]): Doc[] {
  return [...docs].sort((a, b) => {
    const lockA = a.data.status === 'locked' ? 0 : 1;
    const lockB = b.data.status === 'locked' ? 0 : 1;
    if (lockA !== lockB) return lockA - lockB;
    return b.data.date.getTime() - a.data.date.getTime();
  });
}

export function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
