import { templateSince } from './template-version';
import { engineeringProfiles, type ProfileViewOptions } from './engineering-profile';
import { metroReportCss } from './metro-brand';
import { sheetCss } from './sheet-layout';
import type { ReportSnapshot } from './types';
export function renderInteractiveProfile(
  snapshot: ReportSnapshot,
  options: ProfileViewOptions = {},
) {
  let body = engineeringProfiles(snapshot, snapshot.holes[0], { ...options, interactive: true });
  const pages = Array.from(body.matchAll(/<section class="page ([^"]+)"([^>]*)>/g), (match) => ({
    kind: match[1].includes('description-continuation') ? 'supplement' : 'profile',
    fromM: match[2].match(/data-depth-from="([^"]+)"/)?.[1] ?? null,
    toM: match[2].match(/data-depth-to="([^"]+)"/)?.[1] ?? null,
  }));
  const pageCount = pages.length;
  let page = 0;
  body = body.replace(/__SHEET__/g, () => String(++page)).replace(/__TOTAL__/g, String(pageCount));
  return {
    pageCount,
    pages,
    html: `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline';"><style>${sheetCss}${templateSince(snapshot.templateVersion, '0.8.12') ? '.metro-report .folio { display: none; }' : ''}${templateSince(snapshot.templateVersion, '0.8.11') ? metroReportCss : ''}
body{width:210mm;padding:18mm 16mm 20mm;background:white;margin:0;}
.page{display:none;min-height:244mm;}.page:first-child{display:flex;}
.interaction-hit{pointer-events:all;}.spt-record,.sampled-layer{cursor:pointer;outline:none;}
.profile-chart path,.profile-chart circle,.profile-frame{pointer-events:none;}
[data-sheet-selection]:hover .interaction-hit,[data-sheet-selection]:focus .interaction-hit{fill:#dbeafe;fill-opacity:.55;stroke:#2155b5;stroke-width:1;}
[data-sheet-selection].is-related .interaction-hit{fill:#eef0ff;fill-opacity:.65;}
[data-sheet-selection].is-selected .interaction-hit{fill:#dbeafe;fill-opacity:.75;stroke:#2155b5;stroke-width:1.5;}
::selection{background:#dbeafe;}
</style></head><body${templateSince(snapshot.templateVersion, '0.8.11') ? ' class="metro-report"' : ''}>${body}</body></html>`,
  };
}
