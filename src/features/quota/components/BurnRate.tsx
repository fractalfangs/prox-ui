import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useNow } from '@/hooks/useNow';
import { buildResetDisplay } from '@/utils/quota';
import { getQuotaDisplayName } from '@/utils/quota/identity';
import { getTypeLabel } from '@/features/authFiles/constants';
import { burnRateAccountKey, buildBurnRateWindows } from '../burnRate';
import type { QuotaFileEntry } from '../logic';
import type { QuotaCardState } from '../providers';
import styles from './BurnRate.module.scss';

interface Props {
  entries: QuotaFileEntry[];
  quotaFor: (entry: QuotaFileEntry) => QuotaCardState | undefined;
  onRefresh: (entry: QuotaFileEntry) => void;
  canRefresh: boolean;
}

export function BurnRate({ entries, quotaFor, onRefresh, canRefresh }: Props) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const now = useNow();
  const [selected, setSelected] = useState<string | null>(null);
  const entry = entries.find((item) => burnRateAccountKey(item) === selected) ?? entries[0];
  const activeKey = entry ? burnRateAccountKey(entry) : null;
  const activeIndex = entries.findIndex((item) => burnRateAccountKey(item) === activeKey);
  const quota = entry ? quotaFor(entry) : undefined;
  const windows = entry ? buildBurnRateWindows(entry.type, quota, t) : [];
  const offset =
    quota && 'serverTimeOffsetMs' in quota && typeof quota.serverTimeOffsetMs === 'number'
      ? quota.serverTimeOffsetMs
      : 0;

  return (
    <section className={styles.panel} aria-label={t('burn_rate.title')}>
      <h2>{t('burn_rate.title')}</h2>
      <p className={styles.note}>{t('burn_rate.description')}</p>
      {!entry ? (
        <EmptyState
          title={t('quota_management.empty_title')}
          description={t('quota_management.empty_desc')}
        />
      ) : (
        <>
          <div className={styles.tabs} role="tablist" aria-label={t('burn_rate.accounts')}>
            {entries.map((item, index) => {
              const key = burnRateAccountKey(item);
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  id={`${id}-tab-${index}`}
                  aria-controls={`${id}-panel`}
                  aria-selected={key === activeKey}
                  tabIndex={key === activeKey ? 0 : -1}
                  onClick={() => setSelected(key)}
                  onKeyDown={(event) => {
                    const next =
                      event.key === 'ArrowRight'
                        ? (index + 1) % entries.length
                        : event.key === 'ArrowLeft'
                          ? (index + entries.length - 1) % entries.length
                          : event.key === 'Home'
                            ? 0
                            : event.key === 'End'
                              ? entries.length - 1
                              : null;
                    if (next === null) return;
                    event.preventDefault();
                    setSelected(burnRateAccountKey(entries[next]));
                    const target = event.currentTarget.parentElement?.children[next] as
                      HTMLButtonElement | undefined;
                    target?.focus();
                    target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                  }}
                >
                  {getTypeLabel(t, item.file.provider || item.type)} ·{' '}
                  {getQuotaDisplayName(item.file)}
                </button>
              );
            })}
          </div>
          <div
            id={`${id}-panel`}
            role="tabpanel"
            aria-labelledby={`${id}-tab-${activeIndex}`}
            tabIndex={0}
            aria-busy={quota?.status === 'loading'}
            className={styles.detail}
          >
            <div className={styles.heading}>
              <h3>{getQuotaDisplayName(entry.file)}</h3>
              <Button
                size="sm"
                variant="secondary"
                disabled={!canRefresh || quota?.status === 'loading'}
                onClick={() => onRefresh(entry)}
              >
                {t('auth_files.quota_refresh_single')}
              </Button>
            </div>
            {quota && 'stale' in quota && quota.stale === true && (
              <p role="status" className={styles.note}>
                {t('claude_quota.stale_snapshot', {
                  time:
                    'observedAt' in quota && typeof quota.observedAt === 'string'
                      ? new Date(quota.observedAt).toLocaleString(i18n.resolvedLanguage)
                      : '--',
                })}
              </p>
            )}
            {!quota || quota.status === 'idle' ? (
              <p role="status">{t('burn_rate.load')}</p>
            ) : quota.status === 'loading' ? (
              <p role="status">{t('common.loading')}</p>
            ) : quota.status === 'error' ? (
              <p role="alert" className={styles.error}>
                {quota.error || t('notification.refresh_failed')}
              </p>
            ) : windows.length === 0 ? (
              <p role="status">{t('burn_rate.unavailable')}</p>
            ) : (
              windows.map((window) => {
                const reset = buildResetDisplay(
                  window.resetLabel,
                  window.resetAtMs,
                  now + offset,
                  i18n.resolvedLanguage
                );
                const used = window.usedPercent;
                return (
                  <div key={window.id} className={styles.window}>
                    <div className={styles.heading}>
                      <span>{window.label}</span>
                      <strong>
                        {used === null
                          ? t('burn_rate.unknown')
                          : t('burn_rate.consumed', { percent: Number(used.toFixed(1)) })}
                      </strong>
                    </div>
                    {used !== null && (
                      <meter
                        min={0}
                        max={100}
                        low={30}
                        high={70}
                        optimum={0}
                        value={used}
                        aria-label={window.label}
                      >
                        {used}%
                      </meter>
                    )}
                    <span className={styles.note}>
                      {reset
                        ? `${t('burn_rate.resets')} ${reset.absolute}${reset.relative ? ` · ${reset.relative}` : ''}`
                        : t('burn_rate.reset_unknown')}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </section>
  );
}
