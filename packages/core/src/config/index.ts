/**
 * 默认配置与环境变量读取
 */

import { config } from 'dotenv';

/** 从项目根目录（当前工作目录）加载 .env，脚本入口应先调用 */
export function loadEnv(): void {
  config();
}

export interface AppConfig {
  env: 'backtest' | 'live';
  exchange?: string;
  symbols?: string[];
}

const defaultConfig: AppConfig = {
  env: 'backtest',
  symbols: [],
};

export function loadConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    ...defaultConfig,
    ...overrides,
  };
}
