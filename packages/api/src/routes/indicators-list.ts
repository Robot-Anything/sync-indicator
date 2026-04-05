/**
 * GET /api/v1/indicators/list
 * 返回当前支持的指标列表及参数说明
 */

import { FastifyRequest, FastifyReply } from 'fastify';

const INDICATORS = [
  {
    name: 'ema',
    label: 'Exponential Moving Average',
    params: { period: { type: 'number', default: null, description: 'EMA period, e.g. ema[]=20&ema[]=50' } },
    response: 'ema_{period}',
  },
  {
    name: 'macd',
    label: 'MACD',
    params: {
      fast: { type: 'number', default: 12 },
      slow: { type: 'number', default: 26 },
      signal: { type: 'number', default: 9 },
    },
    response: ['macd', 'macd_signal', 'macd_histogram'],
  },
  {
    name: 'atr',
    label: 'Average True Range',
    params: { period: { type: 'number', default: 14 } },
    response: 'atr_{period}',
  },
  {
    name: 'rsi',
    label: 'Relative Strength Index',
    params: { period: { type: 'number', default: 14 } },
    response: 'rsi_{period}',
  },
  {
    name: 'bollinger',
    label: 'Bollinger Bands',
    params: {
      period: { type: 'number', default: 20 },
      stdDev: { type: 'number', default: 2 },
    },
    response: ['bb_upper', 'bb_middle', 'bb_lower'],
  },
  {
    name: 'adx',
    label: 'Average Directional Index',
    params: { period: { type: 'number', default: 14 } },
    response: ['adx_{period}', 'plus_di_{period}', 'minus_di_{period}'],
  },
];

export async function indicatorsListRoutes(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  reply.send({ indicators: INDICATORS });
}
