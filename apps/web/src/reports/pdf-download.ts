import { auth, longRequestSignal, type AuthClient } from '../auth/client';

/** Keeps the blob URL alive long enough for Safari and Firefox to finish reading a large PDF. */
export const pdfUrlLifetimeMs = 30_000;

export interface IssuePdf {
  workId: string;
  reportId: string;
  issueId: string;
  issueNumber: number | null;
}

/** Browser operations used to hand a downloaded blob to the user. */
export interface BlobSaver {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  clickLink(url: string, fileName: string): void;
  schedule(task: () => void, delayMs: number): void;
}

export interface PdfDownloadDependencies {
  client: Pick<AuthClient, 'request'>;
  saver: BlobSaver;
}

const browserSaver: BlobSaver = {
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  clickLink: (url, fileName) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
  },
  schedule: (task, delayMs) => {
    setTimeout(task, delayMs);
  },
};

export function issuePdfPath(pdf: IssuePdf): string {
  return `/obras/${pdf.workId}/relatorios/${pdf.reportId}/emissoes/${pdf.issueId}/pdf`;
}

export function issuePdfFileName(issueNumber: number | null): string {
  return `sondagem-emissao-${issueNumber}.pdf`;
}

export function saveBlobAs(blob: Blob, fileName: string, saver: BlobSaver = browserSaver): void {
  const url = saver.createObjectURL(blob);
  saver.clickLink(url, fileName);
  saver.schedule(() => saver.revokeObjectURL(url), pdfUrlLifetimeMs);
}

/** Downloads one issued report PDF and saves it with the issue number in the file name. */
export async function downloadIssuePdf(
  pdf: IssuePdf,
  dependencies: PdfDownloadDependencies = { client: auth, saver: browserSaver },
): Promise<void> {
  const blob = await dependencies.client.request<Blob>(
    issuePdfPath(pdf),
    { signal: longRequestSignal() },
    (response) => response.blob(),
  );
  saveBlobAs(blob, issuePdfFileName(pdf.issueNumber), dependencies.saver);
}
