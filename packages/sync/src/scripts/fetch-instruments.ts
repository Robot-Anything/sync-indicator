/**
 * 拉取 OKX 基础资产信息（instruments）并写入 Postgres
 */

import { loadEnv } from '@sync-indicator/core';
import { initPool } from '@sync-indicator/core';
import type { InstrumentRow } from '../data/db-instruments.js';
import { upsertInstruments } from '../data/db-instruments.js';
import { createLogger } from '@sync-indicator/core';

const log = createLogger('fetch-instruments');
const BASE_URL = 'https://www.okx.com/api/v5/public/instruments';

interface OkxInstrument {
  instId: string;
  instType: string;
  baseCcy: string;
  quoteCcy: string;
  lotSz: string;
  tickSz: string;
  ctVal?: string;
  ctMult?: string;
  state?: string;
}

interface OkxInstrumentsResponse {
  code: string;
  msg?: string;
  data?: OkxInstrument[];
}

async function fetchOkxInstruments(instType: string): Promise<OkxInstrument[]> {
  const url = `${BASE_URL}?instType=${encodeURIComponent(instType)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OKX instruments ${res.status}: ${res.statusText}`);
  }
  const json = (await res.json()) as OkxInstrumentsResponse;
  if (json.code !== '0') {
    throw new Error(`OKX API ${json.code}: ${json.msg ?? ''}`);
  }
  return json.data ?? [];
}

loadEnv();

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    log.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const exchange = 'okx';
  const instTypes = ['SPOT', 'SWAP'];

  const allRows: InstrumentRow[] = [];
  for (const instType of instTypes) {
    log.info(`fetch instType=${instType}`);
    const data = await fetchOkxInstruments(instType).catch((err) => {
      log.error(`fetch instType=${instType} failed`, err instanceof Error ? err.message : err);
      return [] as OkxInstrument[];
    });
    for (const d of data) {
      allRows.push({
        exchange,
        inst_id: d.instId,
        inst_type: d.instType,
        base_ccy: d.baseCcy ?? '',
        quote_ccy: d.quoteCcy ?? '',
        lot_sz: d.lotSz ?? '',
        tick_sz: d.tickSz ?? '',
        ct_val: d.ctVal,
        ct_mult: d.ctMult,
        state: d.state,
      });
    }
    log.info(`instType=${instType} count=${data.length}`);
  }

  log.info(`total rows=${allRows.length}`);

  const pool = initPool(databaseUrl);
  try {
    const { upserted } = await upsertInstruments(pool, allRows);
    log.info(`upserted ${upserted} instruments`);
  } catch (err) {
    log.error('upsert failed', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  log.info('done');
}

main().catch((err) => {
  log.error('main', err instanceof Error ? err.message : err);
  process.exit(1);
});
