interface TrackRecordLoadingProps {
  label: string;
}

export function TrackRecordLoading({ label }: TrackRecordLoadingProps) {
  return (
    <div className="track-record-loading">
      <p>{label}</p>
    </div>
  );
}
