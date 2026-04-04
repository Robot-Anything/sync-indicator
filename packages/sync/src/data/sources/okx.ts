/**
 * OKX 历史 K 线拉取：history-candles 分页
 */

import type { OHLCV } from '@sync-indicator/core';
import { normalizeOkxCandle } from '@sync-indicator/core';
import { createLogger } from '@sync-indicator/core';

const log = createLogger('fetch-ohlcv');
const BASE_URL = 'https://www.okx.com/api/v5/market/history-candles';
const LIMIT = 300;
const RATE_LIMIT_MS = 200;

interface OkxHistoryResponse {
  code: string;
  msg: string;
  data?: string[][];
}

export async function fetchHistoryCandles(
  instId: string,
  bar: string,
  options?: { after?: number; before?: number; limit?: number }
): Promise<OHLCV[]> {
  const limit = options?.limit ?? LIMIT;
  const params = new URLSearchParams({
    instId,
    bar,
    limit: String(limit),
  });
  if (options?.before != null) params.set('before', String(options.before));
  if (options?.after != null) params.set('after', String(options.after));

  const url = `${BASE_URL}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OKX history-candles ${res.status}: ${res.statusText}`);
  }
  const json = (await res.json()) as OkxHistoryResponse;
  if (json.code !== '0') {
    throw new Error(`OKX API ${json.code}: ${json.msg}`);
  }
  const data = json.data ?? [];
  return data.map((row) => normalizeOkxCandle(row));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 今日 0 点 UTC 的毫秒时间戳 */
function getTodayStartMs(): number {
  const now = new Date();
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0,
    0
  );
  return start;
}

export type OkxBarInterval = '1H' | '4H' | '15m' | '1D';

/** 按时间范围分页拉取 OKX 某标的的 1H/4H/15m/1D K 线，区间 [startMs, endMs]（毫秒） */
export async function fetchOkxRange(
  instId: string,
  startMs: number,
  endMs: number
): Promise<Record<OkxBarInterval, OHLCV[]>> {
  const fetchUntil = async (bar: string): Promise<OHLCV[]> => {
    const all: OHLCV[] = [];
    log.info(
      `start fetch instId=${instId} bar=${bar} startMs=${startMs} endMs=${endMs}`
    );
    let after: number | undefined;
    try {
      while (true) {
        const batch = await fetchHistoryCandles(instId, bar, {
          ...(after != null ? { after } : {}),
          limit: LIMIT,
        });
        await sleep(RATE_LIMIT_MS);
        if (batch.length === 0) break;

        // OKX API 返回：最新数据在索引 0，最老数据在最后

        // 过滤掉超出 endMs 的部分（第一批最可能超出）
        const filtered = batch.filter((b) => b.time <= endMs);
        if (filtered.length > 0) {
          all.push(...filtered);
        }

        const oldest = batch[batch.length - 1];

        // 如果 oldest 已经早于 startMs，本批是最老一批，停止
        if (oldest.time < startMs) {
          // 已推送的 all 里 startMs 以上的部分即为最终结果
          const inRange = all.filter((b) => b.time >= startMs);
          log.info(
            `bar=${bar} fetched ${all.length} bars, inRange=${inRange.length}, total=${all.length}`
          );
          break;
        }

        // 如果本批已无超出 endMs 的数据，说明已到上界，停止
        if (filtered.length === 0) {
          log.info(`bar=${bar} no bars within endMs=${endMs}, stopping`);
          break;
        }

        log.info(
          `bar=${bar} got ${batch.length} bars, oldest=${oldest.time}, total=${all.length}`
        );
        // 继续获取更早的数据：使用 oldest.time 作为 after 参数
        after = oldest.time;
      }
    } catch (err) {
      log.error(`bar=${bar} fetch error, saved ${all.length} bars`, err instanceof Error ? err.message : err);
    }
    return all;
  };

  const results = await Promise.allSettled([
    fetchUntil('1H'),
    fetchUntil('4H'),
    fetchUntil('15m'),
    fetchUntil('1D'),
  ]);
  const oneH = results[0].status === 'fulfilled' ? results[0].value : [];
  const fourH = results[1].status === 'fulfilled' ? results[1].value : [];
  const fifteenM = results[2].status === 'fulfilled' ? results[2].value : [];
  const oneD = results[3].status === 'fulfilled' ? results[3].value : [];

  return { '1H': oneH, '4H': fourH, '15m': fifteenM, '1D': oneD };
}

/** 2025-01-01 00:00:00 UTC 至今的 OKX K 线 */
export async function fetchOkxFrom2025Jan1(
  instId: string
): Promise<Record<OkxBarInterval, OHLCV[]>> {
  const startMs = Date.UTC(2025, 0, 1, 0, 0, 0, 0);
  const endMs = Date.now();
  return fetchOkxRange(instId, startMs, endMs);
}

/** 拉取 OKX「今日前三个月」的 1H/4H/15m/1D K 线（区间：今日 0 点往前 90 天，不含今日） */
export async function fetchOkxLast3Months(
  instId: string
): Promise<Record<OkxBarInterval, OHLCV[]>> {
  const threeMonthsMs = 90 * 24 * 60 * 60 * 1000;
  const endMs = getTodayStartMs();
  const startMs = endMs - threeMonthsMs;
  return fetchOkxRange(instId, startMs, endMs);
}
