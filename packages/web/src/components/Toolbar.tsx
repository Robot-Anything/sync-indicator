interface ToolbarProps {
  symbol: string;
  interval: string;
  emaEnabled: boolean;
  rsiEnabled: boolean;
  macdEnabled: boolean;
  atrEnabled: boolean;
  onSymbolChange: (symbol: string) => void;
  onIntervalChange: (interval: string) => void;
  onToggleEma: () => void;
  onToggleRsi: () => void;
  onToggleMacd: () => void;
  onToggleAtr: () => void;
}

const INTERVALS = ['15m', '1H', '4H', '1D'];
const SYMBOLS = ['ETH-USDT', 'BTC-USDT'];

export default function Toolbar({
  symbol,
  interval,
  emaEnabled,
  rsiEnabled,
  macdEnabled,
  atrEnabled,
  onSymbolChange,
  onIntervalChange,
  onToggleEma,
  onToggleRsi,
  onToggleMacd,
  onToggleAtr,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar-section">
        <select
          className="symbol-select"
          value={symbol}
          onChange={(e) => onSymbolChange(e.target.value)}
        >
          {SYMBOLS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-section">
        <div className="interval-group">
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              className={`interval-btn${interval === iv ? ' active' : ''}`}
              onClick={() => onIntervalChange(iv)}
            >
              {iv}
            </button>
          ))}
        </div>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-section">
        <div className="indicator-toggles">
          <button
            className={`toggle-chip${emaEnabled ? ' active' : ''}`}
            onClick={onToggleEma}
          >
            EMA
          </button>
          <button
            className={`toggle-chip${rsiEnabled ? ' active' : ''}`}
            onClick={onToggleRsi}
          >
            RSI
          </button>
          <button
            className={`toggle-chip${macdEnabled ? ' active' : ''}`}
            onClick={onToggleMacd}
          >
            MACD
          </button>
          <button
            className={`toggle-chip${atrEnabled ? ' active' : ''}`}
            onClick={onToggleAtr}
          >
            ATR
          </button>
        </div>
      </div>
    </div>
  );
}
