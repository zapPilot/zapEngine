import { MESSAGES } from '@/config/messages';

export function RegimeStripV2() {
  return (
    <section className="regime-strip-section" aria-label="Regime data">
      <div className="regime-strip-header">
        <span className="live-status">
          <span aria-hidden />
          {MESSAGES.regimeTelemetry.status}
        </span>
        <strong>Telemetry feeding the next bundle</strong>
      </div>
      <div className="regime-strip">
        {MESSAGES.regimeTelemetry.items.map((item) => (
          <div className="regime-strip-item" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.detail}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
