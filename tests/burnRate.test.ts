import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '../src/i18n';
import { buildBurnRateWindows, burnRateAccountKey } from '../src/features/quota/burnRate';
import { BurnRate } from '../src/features/quota/components/BurnRate';
import type { QuotaCardState } from '../src/features/quota/providers';
import type { QuotaFileEntry } from '../src/features/quota/logic';

await i18n.changeLanguage('en');
const t = i18n.t.bind(i18n);
const quota = <T extends QuotaCardState>(value: T) => value;
const codex: QuotaFileEntry = { type: 'codex', file: { name: 'personal.json', provider: 'codex' } };
const resetAtMs = Date.parse('2099-01-01T00:00:00Z');

describe('burn rate observations', () => {
  test('preserves independent windows, exact resets, unknown usage and bounds', () => {
    const windows = buildBurnRateWindows(
      'codex',
      quota({
        status: 'success',
        windows: [
          { id: 'five-hour', label: '5-hour', usedPercent: 0, resetAtMs, periodHours: 5 },
          { id: 'weekly', label: 'Weekly', usedPercent: 100, resetAtMs: resetAtMs + 123 },
          { id: 'spark', label: 'Spark', usedPercent: null },
          { id: 'invalid', label: 'Invalid', usedPercent: NaN },
        ],
      }),
      t
    );
    expect(windows.map((window) => window.usedPercent)).toEqual([0, 100, null, null]);
    expect(windows.map((window) => window.resetAtMs)).toEqual([
      resetAtMs,
      resetAtMs + 123,
      undefined,
      undefined,
    ]);
    expect(buildBurnRateWindows('codex', undefined, t)).toEqual([]);
    expect(buildBurnRateWindows('codex', { status: 'error' }, t)).toEqual([]);
  });

  test('inverts remaining quota and retains separate plugin pools and reset instants', () => {
    const rows = buildBurnRateWindows(
      'plugin',
      quota({
        status: 'success',
        groups: [
          {
            id: 'a',
            label: 'Pool A',
            buckets: [{ id: 'daily', label: 'Daily', remainingFraction: 0.8, resetAtMs }],
          },
          {
            id: 'b',
            label: 'Pool B',
            buckets: [
              {
                id: 'daily',
                label: 'Daily',
                remainingFraction: 0,
                resetTime: '2099-01-02T00:00:00Z',
              },
            ],
          },
        ],
      }),
      t
    );
    expect(rows.map((row) => row.usedPercent)).toEqual([20, 100]);
    expect(new Set(rows.map((row) => row.id)).size).toBe(2);
    expect(rows[1].resetAtMs).toBe(Date.parse('2099-01-02T00:00:00Z'));
    expect(
      buildBurnRateWindows(
        'devin',
        quota({ status: 'success', windows: [{ id: 'daily', remainingPercent: null, resetAtMs }] }),
        t
      )[0].usedPercent
    ).toBeNull();
  });

  test('derives Kimi consumption from counts and leaves zero-limit usage unknown', () => {
    const rows = buildBurnRateWindows(
      'kimi',
      quota({
        status: 'success',
        rows: [
          { id: 'a', label: 'Monthly', used: 3, limit: 10, resetAtMs },
          { id: 'b', label: 'Weekly', used: 0, limit: 0 },
        ],
      }),
      t
    );
    expect(rows.map((row) => row.usedPercent)).toEqual([30, null]);
    expect(rows[0].resetAtMs).toBe(resetAtMs);
  });

  test('converts Meta Unix seconds once and excludes xAI monetary caps', () => {
    const meta = buildBurnRateWindows(
      'meta',
      quota({
        status: 'success',
        data: { windows: [{ id: 'weekly', usedPercent: 12, resetAt: resetAtMs / 1000 }] },
      }),
      t
    );
    expect(meta[0].resetAtMs).toBe(resetAtMs);
    expect(meta[0].usedPercent).toBe(12);
    expect(
      buildBurnRateWindows(
        'xai',
        quota({
          status: 'success',
          billing: { mode: 'billing', periodType: 'monthly', usagePercent: 99 },
        }),
        t
      )
    ).toEqual([]);
    const weekly = buildBurnRateWindows(
      'xai',
      quota({
        status: 'success',
        billing: { mode: 'billing', periodType: 'weekly', usagePercent: 23, resetAtMs },
      }),
      t
    );
    expect(weekly[0].usedPercent).toBe(23);
  });

  test('keeps same-file plugin identities and different providers distinct', () => {
    const entry = (authIndex: string): QuotaFileEntry => ({
      type: 'plugin',
      file: { name: 'shared.json', provider: 'custom', supportsQuota: true, authIndex },
    });
    expect(burnRateAccountKey(entry('a'))).not.toBe(burnRateAccountKey(entry('b')));
    expect(burnRateAccountKey(codex)).not.toBe(burnRateAccountKey({ ...codex, type: 'claude' }));
  });
});

const render = (state?: QuotaCardState, entries = [codex]) =>
  renderToStaticMarkup(
    createElement(BurnRate, {
      entries,
      quotaFor: () => state,
      canRefresh: true,
      onRefresh: () => {},
    })
  );

describe('burn rate rendering', () => {
  test('provides labelled account tabs, consumed meters and exact resets', () => {
    const html = render(
      quota({
        status: 'success',
        windows: [{ id: 'five-hour', label: '5-hour', usedPercent: 37, resetAtMs }],
      }),
      [codex, { ...codex, file: { name: 'work.json', provider: 'codex' } }]
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-selected="false"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('37% consumed');
    expect(html).toContain('value="37"');
    expect(html).toContain('work.json');
    expect(html).not.toContain('aria-label="secret');
  });
  test('explains unloaded, loading, error, empty and unavailable states', () => {
    expect(render()).toContain(t('burn_rate.load'));
    expect(render({ status: 'loading' })).toContain('aria-busy="true"');
    expect(render({ status: 'error', error: 'Quota fetch failed' })).toContain('role="alert"');
    expect(render({ status: 'error', error: 'Quota fetch failed' })).toContain(
      'Quota fetch failed'
    );
    expect(render({ status: 'success' } as QuotaCardState, [])).toContain(
      t('quota_management.empty_title')
    );
    expect(render(quota({ status: 'success', windows: [] }))).toContain(t('burn_rate.unavailable'));
    expect(
      render(
        quota({
          status: 'success',
          windows: [{ id: 'unknown', label: 'Weekly', usedPercent: null }],
        })
      )
    ).toContain(t('burn_rate.unknown'));
  });
  test('labels retained Claude observations as stale and never renders account secrets', () => {
    const html = render(
      quota({ status: 'success', stale: true, observedAt: '2026-01-01T00:00:00Z', windows: [] }),
      [
        {
          type: 'claude',
          file: { name: 'claude.json', provider: 'claude', account: 'secret-do-not-render' },
        },
      ]
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('2026');
    expect(html).not.toContain('secret-do-not-render');
  });
});
