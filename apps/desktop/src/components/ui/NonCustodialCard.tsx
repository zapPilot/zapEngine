interface NonCustodialCardProps {
  title: string;
  body: string;
}

/** Reassurance card (shield + copy) shared by Confirm and Account. */
export function NonCustodialCard({ title, body }: NonCustodialCardProps) {
  return (
    <div
      className="flex gap-3 rounded-2xl p-4"
      style={{
        background: 'rgba(212,197,163,.07)',
        border: '1px solid rgba(212,197,163,.22)',
      }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#d4c5a3"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0, marginTop: 1 }}
        aria-hidden="true"
      >
        <path d="M12 2.5l7.5 3v5.5c0 4.4-3.1 8.2-7.5 9.5-4.4-1.3-7.5-5.1-7.5-9.5V5.5z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
      <div>
        <div className="text-[13.5px] font-semibold text-ink">{title}</div>
        <div
          className="mt-1 text-[11.5px] leading-relaxed"
          style={{ color: '#9a958a' }}
        >
          {body}
        </div>
      </div>
    </div>
  );
}
