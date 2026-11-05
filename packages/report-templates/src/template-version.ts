/** Ordered, explicit compatibility registry. Unknown versions never inherit features. */
export const SUPPORTED_TEMPLATE_VERSIONS = [
  '0.7.0',
  '0.7.1',
  '0.7.2',
  '0.8.0',
  '0.8.1',
  '0.8.2',
  '0.8.3',
  '0.8.4',
  '0.8.5',
  '0.8.6',
  '0.8.7',
  '0.8.8',
  '0.8.9',
  '0.8.10',
  '0.8.11',
  '0.8.12',
  '0.8.13',
  '0.8.14',
] as const;
export type TemplateVersion = (typeof SUPPORTED_TEMPLATE_VERSIONS)[number];
export const TEMPLATE_VERSION: TemplateVersion = '0.8.14';
export function isSupportedTemplateVersion(version: string): version is TemplateVersion {
  return (SUPPORTED_TEMPLATE_VERSIONS as readonly string[]).includes(version);
}
export function templateSince(version: string, first: TemplateVersion): boolean {
  const index = (SUPPORTED_TEMPLATE_VERSIONS as readonly string[]).indexOf(version);
  return index >= SUPPORTED_TEMPLATE_VERSIONS.indexOf(first);
}
