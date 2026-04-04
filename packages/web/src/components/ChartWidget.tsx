import { useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
} from 'lightweight-charts';
import type { Bar } from '../api/client';

interface ChartWidgetProps {
  bars: Bar[];
  emaEnabled: boolean;
  rsiEnabled: boolean;
  macdEnabled: boolean;
  atrEnabled: boolean;
}

const BULL_COLOR = '#00C087';
const BEAR_COLOR = '#FF3062';

/**
 * API / DB 与 OKX 一致为毫秒；lightweight-charts v5 的 UTCTimestamp 为「秒」（可带小数）。
 */
function chartTime(msOrSeconds: number): number {
  return msOrSeconds > 1e12 ? msOrSeconds / 1000 : msOrSeconds;
}

export default function ChartWidget({
  bars,
  emaEnabled,
  rsiEnabled,
  macdEnabled,
  atrEnabled,
}: ChartWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  // Series refs
  const candlestickRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ema20Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const rsiRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdLineRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdSignalRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdHistRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const atrRef = useRef<ISeriesApi<'Line'> | null>(null);

  // Track pane indices
  const rsiPaneRef = useRef<number | null>(null);
  const macdPaneRef = useRef<number | null>(null);
  const atrPaneRef = useRef<number | null>(null);

  // Initialize chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#0B0E11', type: 'solid' as any },
        textColor: '#8A919E',
        fontFamily: "'Inter', -apple-system, sans-serif",
      },
      grid: {
        vertLines: { color: '#1E2330' },
        horzLines: { color: '#1E2330' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#555B69', width: 1, style: 2 as any },
        horzLine: { color: '#555B69', width: 1, style: 2 as any },
      },
      timeScale: {
        borderColor: '#2A2F3D',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#2A2F3D',
      },
    });

    chartRef.current = chart;

    // Candlestick
    const candlestick = chart.addSeries(CandlestickSeries, {
      upColor: BULL_COLOR,
      downColor: BEAR_COLOR,
      borderUpColor: BULL_COLOR,
      borderDownColor: BEAR_COLOR,
      wickUpColor: BULL_COLOR,
      wickDownColor: BEAR_COLOR,
    });
    candlestickRef.current = candlestick;

    // Volume (separate price scale at bottom)
    const volume = chart.addSeries(
      HistogramSeries,
      {
        color: '#2A2F3D',
        priceFormat: { type: 'volume' },
        priceScaleId: '',
      },
    );
    volume.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    volumeRef.current = volume;

    // EMA lines (on main pane, index 0)
    const ema20 = chart.addSeries(LineSeries, { color: '#FFB800', lineWidth: 2, priceScaleId: 'right' }, 0);
    const ema50 = chart.addSeries(LineSeries, { color: '#9B59B6', lineWidth: 2, priceScaleId: 'right' }, 0);
    ema20Ref.current = ema20;
    ema50Ref.current = ema50;

    // Resize observer
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      chart.resize(width, height);
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // Sync data
  useEffect(() => {
    // Clear all series when bars is empty (symbol/interval switch)
    if (!bars.length) {
      candlestickRef.current?.setData([]);
      volumeRef.current?.setData([]);
      ema20Ref.current?.setData([]);
      ema50Ref.current?.setData([]);
      rsiRef.current?.setData([]);
      macdLineRef.current?.setData([]);
      macdSignalRef.current?.setData([]);
      macdHistRef.current?.setData([]);
      atrRef.current?.setData([]);
      return;
    }

    const candleData = bars.map((b) => ({
      time: chartTime(b.time) as any,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));

    const volumeData = bars.map((b) => ({
      time: chartTime(b.time) as any,
      value: b.volume,
      color: b.close >= b.open ? 'rgba(0,192,135,0.35)' : 'rgba(255,48,98,0.35)',
    }));

    candlestickRef.current?.setData(candleData as any);
    volumeRef.current?.setData(volumeData as any);

    // EMA
    if (bars[0]?.ema_20 != null) {
      const ema20Data = bars.filter((b) => b.ema_20 != null).map((b) => ({ time: chartTime(b.time) as any, value: b.ema_20! }));
      const ema50Data = bars.filter((b) => b.ema_50 != null).map((b) => ({ time: chartTime(b.time) as any, value: b.ema_50! }));
      ema20Ref.current?.setData(ema20Data as any);
      ema50Ref.current?.setData(ema50Data as any);
    } else {
      ema20Ref.current?.setData([]);
      ema50Ref.current?.setData([]);
    }

    // RSI
    if (bars[0]?.rsi_14 != null) {
      const chart = chartRef.current;
      if (chart && rsiRef.current == null) {
        const pane = chart.addPane();
        const panes = chart.panes();
        rsiPaneRef.current = panes.indexOf(pane);
        const rsi = pane.addSeries(LineSeries, { color: '#8A919E', lineWidth: 2 });
        rsiRef.current = rsi;
        pane.addSeries(LineSeries, { color: '#555B69', lineWidth: 1, lineStyle: 2 as any }).setData(
          bars.map((b) => ({ time: chartTime(b.time) as any, value: 70 }))
        );
        pane.addSeries(LineSeries, { color: '#555B69', lineWidth: 1, lineStyle: 2 as any }).setData(
          bars.map((b) => ({ time: chartTime(b.time) as any, value: 30 }))
        );
      }
      const rsiData = bars.filter((b) => b.rsi_14 != null).map((b) => ({ time: chartTime(b.time) as any, value: b.rsi_14! }));
      rsiRef.current?.setData(rsiData as any);
    } else {
      rsiRef.current?.setData([]);
    }

    // MACD
    if (bars[0]?.macd != null) {
      const chart = chartRef.current;
      if (chart && macdLineRef.current == null) {
        const pane = chart.addPane();
        const panes = chart.panes();
        macdPaneRef.current = panes.indexOf(pane);
        const macdLine = pane.addSeries(LineSeries, { color: '#2962FF', lineWidth: 2 });
        const macdSignal = pane.addSeries(LineSeries, { color: '#FF6D00', lineWidth: 2 });
        const macdHist = pane.addSeries(HistogramSeries, {
          color: '#2A2F3D',
        });
        macdLineRef.current = macdLine;
        macdSignalRef.current = macdSignal;
        macdHistRef.current = macdHist;
      }
      const macdData = bars.filter((b) => b.macd != null).map((b) => ({ time: chartTime(b.time) as any, value: b.macd! }));
      const signalData = bars.filter((b) => b.macd_signal != null).map((b) => ({ time: chartTime(b.time) as any, value: b.macd_signal! }));
      const histData = bars.filter((b) => b.macd_histogram != null).map((b) => ({
        time: chartTime(b.time) as any,
        value: b.macd_histogram!,
        color: b.macd_histogram! >= 0 ? 'rgba(0,192,135,0.6)' : 'rgba(255,48,98,0.6)',
      }));
      macdLineRef.current?.setData(macdData as any);
      macdSignalRef.current?.setData(signalData as any);
      macdHistRef.current?.setData(histData as any);
    } else {
      macdLineRef.current?.setData([]);
      macdSignalRef.current?.setData([]);
      macdHistRef.current?.setData([]);
    }

    // ATR
    if (bars[0]?.atr_14 != null) {
      const chart = chartRef.current;
      if (chart && atrRef.current == null) {
        const pane = chart.addPane();
        const panes = chart.panes();
        atrPaneRef.current = panes.indexOf(pane);
        const atr = pane.addSeries(LineSeries, { color: '#3498DB', lineWidth: 2 });
        atrRef.current = atr;
      }
      const atrData = bars.filter((b) => b.atr_14 != null).map((b) => ({ time: chartTime(b.time) as any, value: b.atr_14! }));
      atrRef.current?.setData(atrData as any);
    } else {
      atrRef.current?.setData([]);
    }

    chartRef.current?.timeScale().fitContent();
  }, [bars]);

  // Toggle visibility
  useEffect(() => {
    ema20Ref.current?.applyOptions({ visible: emaEnabled });
    ema50Ref.current?.applyOptions({ visible: emaEnabled });
  }, [emaEnabled]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || rsiPaneRef.current == null) return;
    const pane = chart.panes()[rsiPaneRef.current];
    if (pane) pane.setHeight(rsiEnabled ? 150 : 0);
  }, [rsiEnabled]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || macdPaneRef.current == null) return;
    const pane = chart.panes()[macdPaneRef.current];
    if (pane) pane.setHeight(macdEnabled ? 150 : 0);
  }, [macdEnabled]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || atrPaneRef.current == null) return;
    const pane = chart.panes()[atrPaneRef.current];
    if (pane) pane.setHeight(atrEnabled ? 150 : 0);
  }, [atrEnabled]);

  return <div ref={containerRef} className="chart-widget-root" />;
}
