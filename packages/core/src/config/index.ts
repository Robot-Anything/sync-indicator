/**
 * 默认配置与环境变量读取
 */

import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';

/**
 * 从 process.cwd() 向上遍历查找最近的 .env 文件并加载。
 * monorepo 结构下 pnpm 在子包目录执行脚本，.env 通常在 workspace 根目录。
 */
export function loadEnv(): void {
  let dir = process.cwd();
  while (true) {
    const envPath = path.join(dir, '.env');
    if (fs.existsSync(envPath)) {
      config({ path: envPath });
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // 已到文件系统根目录
    dir = parent;
  }
  config(); // fallback：dotenv 默认行为
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

/**
 * 从环境变量 SYMBOLS 读取同步目标（逗号分隔），未设置时默认 ['ETH-USDT']。
 * 若 SYMBOLS 存在但解析后为空，回退到默认值以避免静默失败。
 */
export function loadSymbols(): string[] {
  const raw = process.env.SYMBOLS;
  if (!raw) return ['ETH-USDT'];
  const symbols = raw.split(',').map(s => s.trim()).filter(Boolean);
  return symbols.length > 0 ? symbols : ['ETH-USDT'];
}
