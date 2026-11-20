declare const __FOLLOWUP_VERSION__: string;
export const CURRENT_VERSION = __FOLLOWUP_VERSION__;
export const REPOSITORY_URL = 'https://github.com/996559536-commits/dsh-followup';
export const RELEASES_URL = `${REPOSITORY_URL}/releases`;
export const UPDATE_MANIFEST_URL = `${RELEASES_URL}/latest/download/update.json`;

export interface ReleaseInfo {
  version: string;
  releaseUrl: string;
  downloadUrl: string;
  sha256: string;
  publishedAt: string;
  notes: string;
}
export interface UpdateSnapshot {
  currentVersion: string;
  status: 'idle' | 'checking' | 'up-to-date' | 'available' | 'error';
  latest: ReleaseInfo | null;
  checkedAt: string | null;
  error: string | null;
}

function versionParts(value: string): number[] {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error('不支持的版本格式');
  const parts = value.split('.').map(Number);
  if (parts.some(part => !Number.isSafeInteger(part))) throw new Error('不支持的版本格式');
  return parts;
}
export function compareVersions(a: string, b: string): number {
  const left = versionParts(a), right = versionParts(b);
  for (let i = 0; i < 3; i++) {
    if (left[i]! !== right[i]!) return left[i]! > right[i]! ? 1 : -1;
  }
  return 0;
}
export function parseRelease(value: unknown): ReleaseInfo {
  if (!value || typeof value !== 'object') throw new Error('版本信息格式错误');
  const data = value as Record<string, unknown>;
  if (data.schemaVersion !== 1 || typeof data.version !== 'string') throw new Error('版本信息格式错误');
  versionParts(data.version);
  const tag = `v${data.version}`;
  if (data.releaseUrl !== `${RELEASES_URL}/tag/${tag}` || data.downloadUrl !== `${RELEASES_URL}/download/${tag}/dsh-followup-${data.version}.tgz`) throw new Error('版本下载地址无效');
  if (typeof data.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(data.sha256)) throw new Error('缺少安装包校验信息');
  if (typeof data.publishedAt !== 'string' || !Number.isFinite(Date.parse(data.publishedAt))) throw new Error('版本发布时间无效');
  if (typeof data.notes !== 'string' || data.notes.length > 2000) throw new Error('版本说明无效');
  return {version: data.version, releaseUrl: data.releaseUrl, downloadUrl: data.downloadUrl, sha256: data.sha256, publishedAt: data.publishedAt, notes: data.notes};
}
export function hasUpdate(value: UpdateSnapshot): boolean {
  return !!value.latest && compareVersions(value.latest.version, value.currentVersion) > 0;
}
