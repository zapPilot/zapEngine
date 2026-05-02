const REGIME_ITEMS = [
  ['REGIME', 'GREED'],
  ['FGI', '72'],
  ['200MA', '+14.2%'],
  ['NEXT REBAL', '02:14:00'],
] as const;

export function RegimeStripV2() {
  return (
    <section className="regime-strip-section" aria-label="Regime data">
      <div className="regime-strip">
        {REGIME_ITEMS.map(([label, value]) => (
          <div className="regime-strip-item" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
