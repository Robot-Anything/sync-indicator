import { useState, useEffect, useCallback } from 'react';
import Toolbar from './components/Toolbar';
import ChartWidget from './components/ChartWidget';
import OrderbookWidget from './components/OrderbookWidget';
import {
  fetchIndicators,
  fetchBbo,
  fetchOrderbook,
  type Bar,
  type BboData,
  type OrderbookData,
} from './api/client';

export default function App() {
  // Config
  const [symbol, setSymbol] = useState('ETH-USDT');
  const [interval, setInterval] = useState('1H');
  const [emaEnabled, setEmaEnabled] = useState(true);
  const [rsiEnabled, setRsiEnabled] = useState(false);
  const [macdEnabled, setMacdEnabled] = useState(false);
  const [atrEnabled, setAtrEnabled] = useState(false);

  // Data
  const [bars, setBars] = useState<Bar[]>([]);
  const [bbo, setBbo] = useState<BboData | null>(null);
  const [orderbook, setOrderbook] = useState<OrderbookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch indicators on config change
  useEffect(() => {
    const ema: number[] = [];
    if (emaEnabled) {
      ema.push(20, 50);
    }

    // Always include at least one indicator to avoid 400
    if (!emaEnabled && !rsiEnabled && !macdEnabled && !atrEnabled) {
      ema.push(20);
    }

    setLoading(true);
    setError(null);

    fetchIndicators({
      exchange: 'okx',
      symbol,
      interval,
      limit: 200,
      ema: ema.length > 0 ? ema : undefined,
      rsi: rsiEnabled ? 14 : undefined,
      macd: macdEnabled ? 1 : undefined,
      atr: atrEnabled ? 14 : undefined,
    })
      .then(setBars)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [symbol, interval, emaEnabled, rsiEnabled, macdEnabled, atrEnabled]);

  // Poll BBO every 1s
  useEffect(() => {
    let cancelled = false;

    const poll = () => {
      fetchBbo('okx', symbol)
        .then((data) => {
          if (!cancelled) setBbo(data);
        })
        .catch(() => {});
    };

    poll();
    const id = window.setInterval(poll, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [symbol]);

  // Poll orderbook every 1s (staggered 500ms)
  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof window.setInterval> | undefined;

    const poll = () => {
      fetchOrderbook('okx', symbol, 15)
        .then((data) => {
          if (!cancelled) setOrderbook(data);
        })
        .catch(() => {});
    };

    const timeout = window.setTimeout(() => {
      poll();
      intervalId = window.setInterval(poll, 1000);
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      if (intervalId != null) window.clearInterval(intervalId);
    };
  }, [symbol]);

  const handleToggleEma = useCallback(() => setEmaEnabled((v) => !v), []);
  const handleToggleRsi = useCallback(() => setRsiEnabled((v) => !v), []);
  const handleToggleMacd = useCallback(() => setMacdEnabled((v) => !v), []);
  const handleToggleAtr = useCallback(() => setAtrEnabled((v) => !v), []);

  return (
    <div className="app">
      <Toolbar
        symbol={symbol}
        interval={interval}
        emaEnabled={emaEnabled}
        rsiEnabled={rsiEnabled}
        macdEnabled={macdEnabled}
        atrEnabled={atrEnabled}
        onSymbolChange={setSymbol}
        onIntervalChange={setInterval}
        onToggleEma={handleToggleEma}
        onToggleRsi={handleToggleRsi}
        onToggleMacd={handleToggleMacd}
        onToggleAtr={handleToggleAtr}
      />

      <div className="chart-area">
        <ChartWidget
          bars={bars}
          emaEnabled={emaEnabled}
          rsiEnabled={rsiEnabled}
          macdEnabled={macdEnabled}
          atrEnabled={atrEnabled}
        />
        {loading && (
          <div className="loading-overlay">
            <div className="spinner" />
          </div>
        )}
      </div>

      <OrderbookWidget bbo={bbo} orderbook={orderbook} />

      {error && <div className="error-toast">{error}</div>}
    </div>
  );
}
