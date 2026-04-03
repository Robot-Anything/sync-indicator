import type { BboData, OrderbookData } from '../api/client';

interface OrderbookWidgetProps {
  bbo: BboData | null;
  orderbook: OrderbookData | null;
}

function formatPrice(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatSize(n: number): string {
  return n.toFixed(4);
}

export default function OrderbookWidget({ bbo, orderbook }: OrderbookWidgetProps) {
  const spread = bbo ? bbo.ask_px - bbo.bid_px : 0;
  const spreadPct = bbo ? ((spread / bbo.ask_px) * 100).toFixed(3) : '0';

  // Find max size for depth bars
  const maxSize = orderbook
    ? Math.max(
        ...orderbook.bids.map(([, sz]) => sz),
        ...orderbook.asks.map(([, sz]) => sz)
      )
    : 1;

  // Bids: highest price first (descending)
  const bids = orderbook
    ? [...orderbook.bids].sort((a, b) => b[0] - a[0])
    : [];

  // Asks: lowest price first (ascending)
  const asks = orderbook
    ? [...orderbook.asks].sort((a, b) => a[0] - b[0])
    : [];

  return (
    <div className="sidebar">
      {/* BBO */}
      <div className="bbo-panel glass-panel">
        <div className="bbo-header">Best Bid / Offer</div>
        {bbo ? (
          <div className="bbo-row">
            <div className="bbo-side">
              <span className="bbo-label">Bid</span>
              <span className="bbo-price bull">{formatPrice(bbo.bid_px)}</span>
              <span className="bbo-size">{formatSize(bbo.bid_sz)}</span>
            </div>
            <div className="bbo-spread">
              <span className="bbo-spread-value">{formatPrice(spread)}</span>
              <span className="bbo-spread-value">{spreadPct}%</span>
            </div>
            <div className="bbo-side" style={{ alignItems: 'flex-end' }}>
              <span className="bbo-label">Ask</span>
              <span className="bbo-price bear">{formatPrice(bbo.ask_px)}</span>
              <span className="bbo-size">{formatSize(bbo.ask_sz)}</span>
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--color-text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            Loading...
          </div>
        )}
      </div>

      {/* Orderbook */}
      <div className="orderbook-panel">
        <div className="orderbook-header">
          <span>Size</span>
          <span>Price</span>
          <span>Size</span>
        </div>
        <div className="orderbook-rows">
          {/* Asks (reversed so lowest ask is at bottom, nearest spread) */}
          {[...asks].reverse().map(([price, size], i) => (
            <div key={`ask-${i}`} className="orderbook-row ask">
              <div
                className="depth-bar ask"
                style={{ width: `${(size / maxSize) * 100}%` }}
              />
              <span className="ob-size-left">{formatSize(size)}</span>
              <span className="ob-price">{formatPrice(price)}</span>
              <span className="ob-size-right" />
            </div>
          ))}

          {/* Spread divider */}
          {bbo && (
            <div className="orderbook-section-label" style={{ textAlign: 'center' }}>
              Spread: {formatPrice(spread)} ({spreadPct}%)
            </div>
          )}

          {/* Bids (highest first) */}
          {bids.map(([price, size], i) => (
            <div key={`bid-${i}`} className="orderbook-row bid">
              <div
                className="depth-bar bid"
                style={{ width: `${(size / maxSize) * 100}%` }}
              />
              <span className="ob-size-left">{formatSize(size)}</span>
              <span className="ob-price">{formatPrice(price)}</span>
              <span className="ob-size-right" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
