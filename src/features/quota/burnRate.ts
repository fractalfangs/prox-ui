import type { TFunction } from 'i18next';
import type {
  AntigravityQuotaState,
  ClaudeQuotaState,
  CodexQuotaState,
  DevinQuotaState,
  KimiQuotaState,
  MetaQuotaState,
  XaiQuotaState,
} from '@/types';
import { getQuotaCacheKey } from '@/utils/quota/identity';
import type { QuotaFileEntry } from './logic';
import type { QuotaCardState } from './providers';
import {
  resolveAntigravityBucketLabelKey,
  resolveAntigravityGroupLabelKey,
} from './providers/antigravity/labels';

export interface BurnRateWindow {
  id: string;
  label: string;
  usedPercent: number | null;
  resetAtMs?: number | null;
  resetLabel?: string;
}

export const burnRateAccountKey = (entry: QuotaFileEntry) =>
  JSON.stringify([entry.type, getQuotaCacheKey(entry.file)]);

const percent = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;
const inverse = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? percent(100 - value) : null;

/** Keep each reported pool and reset separate. Never derive spend or a temporal rate. */
export function buildBurnRateWindows(
  type: QuotaFileEntry['type'],
  quota: QuotaCardState | undefined,
  t: TFunction
): BurnRateWindow[] {
  if (!quota || quota.status !== 'success') return [];
  switch (type) {
    case 'claude':
    case 'codex':
      return (quota as ClaudeQuotaState | CodexQuotaState).windows.map((window) => ({
        ...window,
        label: window.labelKey
          ? t(window.labelKey, 'labelParams' in window ? window.labelParams : undefined)
          : window.label,
        usedPercent: percent(window.usedPercent),
      }));
    case 'devin':
      return (quota as DevinQuotaState).windows.map((window) => ({
        id: window.id,
        label: t(`devin_quota.${window.id}`),
        usedPercent: inverse(window.remainingPercent),
        resetAtMs: window.resetAtMs,
      }));
    case 'kimi':
      return (quota as KimiQuotaState).rows.map((row) => ({
        id: row.id,
        label: row.labelKey ? t(row.labelKey, row.labelParams) : (row.label ?? row.id),
        usedPercent:
          Number.isFinite(row.used) && Number.isFinite(row.limit) && row.limit > 0
            ? percent((row.used / row.limit) * 100)
            : null,
        resetAtMs: row.resetAtMs,
        resetLabel: row.resetHint,
      }));
    case 'meta':
      return ((quota as MetaQuotaState).data?.windows ?? []).map((window) => ({
        id: window.id,
        label:
          window.id === 'window' && window.durationMinutes
            ? t('meta_quota.window_duration', { minutes: window.durationMinutes })
            : t(`meta_quota.${window.id}`),
        usedPercent: percent(window.usedPercent),
        resetAtMs: window.resetAt === undefined ? null : window.resetAt * 1000,
      }));
    case 'antigravity':
    case 'plugin':
      return (quota as AntigravityQuotaState).groups.flatMap((group) => {
        const groupKey =
          type === 'antigravity' ? resolveAntigravityGroupLabelKey(group.label) : null;
        const groupLabel = groupKey ? t(`antigravity_quota.${groupKey}`) : group.label;
        return group.buckets.map((bucket) => {
          const bucketKey =
            type === 'antigravity'
              ? resolveAntigravityBucketLabelKey(bucket.label, bucket.window)
              : null;
          const label = bucketKey ? t(`antigravity_quota.${bucketKey}`) : bucket.label;
          return {
            id: JSON.stringify([group.id, bucket.id]),
            label: `${groupLabel} · ${label}`,
            usedPercent: inverse(bucket.remainingFraction * 100),
            resetAtMs: bucket.resetAtMs ?? (bucket.resetTime ? Date.parse(bucket.resetTime) : null),
          };
        });
      });
    case 'xai': {
      const billing = (quota as XaiQuotaState).billing;
      // Monthly billing caps and on-demand spend are not subscription capacity.
      return billing?.mode === 'billing' && billing.periodType === 'weekly'
        ? [
            {
              id: 'weekly',
              label: t('xai_quota.weekly_limit'),
              usedPercent: percent(billing.usagePercent),
              resetAtMs: billing.resetAtMs,
            },
          ]
        : [];
    }
  }
}
