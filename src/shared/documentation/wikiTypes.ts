export type WikiCategoryId =
  | 'basics'
  | 'settlement'
  | 'food'
  | 'logistics'
  | 'frontier'
  | 'industry'
  | 'progression'
  | 'reference';

export type WikiBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'callout'; title: string; text: string; tone?: 'info' | 'warning' | 'success' }
  | { type: 'table'; columns: string[]; rows: string[][] }
  | { type: 'statGrid'; stats: { label: string; value: string; note?: string }[] }
  | { type: 'flow'; steps: string[] }
  | { type: 'barChart'; title: string; bars: { label: string; value: number; max?: number; note?: string }[] }
  | { type: 'imageGrid'; images: { label: string; src: string; note?: string }[] };

export interface WikiPageDefinition {
  id: string;
  category: WikiCategoryId;
  title: string;
  summary: string;
  keywords: string[];
  blocks: WikiBlock[];
  relatedPageIds?: string[];
}

export interface WikiCategoryDefinition {
  id: WikiCategoryId;
  label: string;
  summary: string;
  sortOrder: number;
}
