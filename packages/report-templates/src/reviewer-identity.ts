import { escapeHtml as e } from './html';
import { templateSince } from './template-version';
import type { ReportSnapshot } from './types';

type Reviewer = Pick<ReportSnapshot['holes'][number], 'reviewerName' | 'reviewerTitle'>;

function printedTitle(templateVersion: string, hole: Reviewer): string {
  return templateSince(templateVersion, '0.8.18') ? (hole.reviewerTitle?.trim() ?? '') : '';
}
/**
 * The reviewer as printed, already escaped. From 0.8.18 the professional title follows the name
 * on the same line ("Ana Souza — Engenheira Civil"), so the responsibility block keeps its
 * height. A hole approved before titles existed prints the name alone; earlier templates never
 * print the title.
 */
export function reviewerIdentity(templateVersion: string, hole: Reviewer): string {
  const title = printedTitle(templateVersion, hole);
  return e(hole.reviewerName) + (title ? ' — ' + e(title) : '');
}

/** Rows per responsibility page, as up to 0.8.17. */
const ROWS_PER_PAGE = 6;
/** Six rows with the longest name (200 characters) fit a page; a title must not add more. */
const ROW_CHARACTERS = 200;
const PAGE_CHARACTERS = ROWS_PER_PAGE * ROW_CHARACTERS;
/**
 * Splits the responsibility table into pages. Up to 0.8.17: six rows each. From 0.8.18 a long
 * name with its title can wrap over more lines, so a page also holds at most as many
 * characters as six of the longest names; short rows still fill six to a page.
 */
export function responsibilityPages<Hole extends Reviewer>(
  templateVersion: string,
  holes: readonly Hole[],
): Hole[][] {
  const pages: Hole[][] = [];
  if (!templateSince(templateVersion, '0.8.18')) {
    for (let i = 0; i < holes.length; i += ROWS_PER_PAGE)
      pages.push(holes.slice(i, i + ROWS_PER_PAGE));
    return pages;
  }
  let used = 0;
  for (const hole of holes) {
    const title = printedTitle(templateVersion, hole);
    const size = Math.max(
      ROW_CHARACTERS,
      hole.reviewerName.length + (title ? title.length + 3 : 0),
    );
    const page = pages.at(-1);
    if (page && page.length < ROWS_PER_PAGE && used + size <= PAGE_CHARACTERS) {
      page.push(hole);
      used += size;
    } else {
      pages.push([hole]);
      used = size;
    }
  }
  return pages;
}
