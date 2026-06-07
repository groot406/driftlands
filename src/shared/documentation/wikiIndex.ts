import {
  buildBuildingReferencePages,
  buildProgressionReferencePages,
  buildResourceReferencePages,
  buildSeasonReferencePages,
  buildStudyReferencePages,
  buildTaskReferencePages,
  buildTerrainReferencePages,
} from './wikiReference.ts';
import { AUTHORED_WIKI_PAGES } from './wikiPages.ts';
import type { WikiBlock, WikiCategoryDefinition, WikiCategoryId, WikiPageDefinition } from './wikiTypes.ts';

export const WIKI_CATEGORIES: WikiCategoryDefinition[] = [
  { id: 'basics', label: 'Basics', summary: 'Core controls, first steps, and opening plans.', sortOrder: 10 },
  { id: 'settlement', label: 'Settlement', summary: 'Population, support, morale, repairs, and settlement health.', sortOrder: 20 },
  { id: 'food', label: 'Food', summary: 'Food routes, farming, crops, and processing chains.', sortOrder: 30 },
  { id: 'logistics', label: 'Logistics', summary: 'Roads, storage, markets, harbors, and trade movement.', sortOrder: 40 },
  { id: 'frontier', label: 'Frontier', summary: 'Exploration, terrain pressure, borders, and calamities.', sortOrder: 50 },
  { id: 'industry', label: 'Industry', summary: 'Job sites, mining, tools, and production planning.', sortOrder: 60 },
  { id: 'progression', label: 'Progression', summary: 'Studies, seasons, scoring, and unlock strategy.', sortOrder: 70 },
  { id: 'reference', label: 'Reference', summary: 'Generated data for buildings, tasks, terrain, resources, studies, seasons, and progression.', sortOrder: 80 },
];

const CATEGORY_SORT_ORDER = new Map<WikiCategoryId, number>(
  WIKI_CATEGORIES.map((category) => [category.id, category.sortOrder]),
);

function comparePages(left: WikiPageDefinition, right: WikiPageDefinition) {
  return (
    (CATEGORY_SORT_ORDER.get(left.category) ?? 999) - (CATEGORY_SORT_ORDER.get(right.category) ?? 999)
    || left.title.localeCompare(right.title)
    || left.id.localeCompare(right.id)
  );
}

let cachedPages: WikiPageDefinition[] | null = null;

export function getWikiPages(): WikiPageDefinition[] {
  if (!cachedPages) {
    cachedPages = [
      ...AUTHORED_WIKI_PAGES,
      ...buildBuildingReferencePages(),
      ...buildTaskReferencePages(),
      ...buildTerrainReferencePages(),
      ...buildResourceReferencePages(),
      ...buildStudyReferencePages(),
      ...buildSeasonReferencePages(),
      ...buildProgressionReferencePages(),
    ].slice().sort(comparePages);
  }

  return cachedPages.slice();
}

export function getWikiPageById(id: string) {
  return getWikiPages().find((page) => page.id === id) ?? null;
}

function blockSearchText(block: WikiBlock): string {
  switch (block.type) {
    case 'paragraph':
      return block.text;
    case 'callout':
      return `${block.title} ${block.text}`;
    case 'table':
      return `${block.columns.join(' ')} ${block.rows.flat().join(' ')}`;
    case 'statGrid':
      return block.stats.map((stat) => `${stat.label} ${stat.value} ${stat.note ?? ''}`).join(' ');
    case 'flow':
      return block.steps.join(' ');
    case 'barChart':
      return `${block.title} ${block.bars.map((bar) => `${bar.label} ${bar.value} ${bar.max ?? ''} ${bar.note ?? ''}`).join(' ')}`;
    case 'imageGrid':
      return block.images.map((image) => `${image.label} ${image.src} ${image.note ?? ''}`).join(' ');
  }
}

function pageSearchText(page: WikiPageDefinition) {
  return [
    page.id,
    page.title,
    page.summary,
    page.keywords.join(' '),
    page.blocks.map(blockSearchText).join(' '),
  ].join(' ').toLowerCase();
}

export function searchWikiPages(query: string) {
  const terms = query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((term) => term.length > 0);

  if (!terms.length) return getWikiPages();

  return getWikiPages().filter((page) => {
    const haystack = pageSearchText(page);
    return terms.every((term) => haystack.includes(term));
  });
}

export function getRelatedWikiPages(page: WikiPageDefinition) {
  const allPages = getWikiPages();
  const pagesById = new Map(allPages.map((wikiPage) => [wikiPage.id, wikiPage]));
  const related: WikiPageDefinition[] = [];
  const seen = new Set<string>([page.id]);

  for (const relatedId of page.relatedPageIds ?? []) {
    const relatedPage = pagesById.get(relatedId);
    if (!relatedPage || seen.has(relatedPage.id)) continue;
    related.push(relatedPage);
    seen.add(relatedPage.id);
  }

  for (const candidate of allPages) {
    if (related.length >= 6) break;
    if (candidate.category !== page.category || seen.has(candidate.id)) continue;
    related.push(candidate);
    seen.add(candidate.id);
  }

  return related;
}
