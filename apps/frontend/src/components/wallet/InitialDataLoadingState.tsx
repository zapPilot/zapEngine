import { Loader2 } from "lucide-react";

interface InitialDataLoadingStateProps {
  status?: string;
}

export function InitialDataLoadingState({
  status,
}: InitialDataLoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8 space-y-6">
      <div className="relative">
        <div className="absolute inset-0 bg-purple-500/20 blur-xl rounded-full" />
        <Loader2 className="w-16 h-16 text-purple-400 animate-spin relative z-10" />
      </div>

      <div className="space-y-2 max-w-md">
        <h3 className="text-xl font-semibold text-white">
          Fetching Wallet Data
        </h3>
        <p className="text-gray-400">
          This is the first time we&apos;ve seen this wallet. We&apos;re
          fetching your on-chain positions and calculating metrics. This usually
          takes 2-5 minutes.
        </p>
      </div>

      {status && (
        <div className="text-sm font-medium text-purple-300 bg-purple-500/10 px-4 py-2 rounded-full border border-purple-500/20">
          {getStatusMessage(status)}
        </div>
      )}
    </div>
  );
}

const STATUS_MESSAGES: Record<string, string> = {
  pending: "Job queued...",
  processing: "Fetching data from DeBank...",
  completed: "Finalizing...",
  failed: "Something went wrong",
};

function getStatusMessage(status: string): string {
  return STATUS_MESSAGES[status] ?? "Initializing...";
}
