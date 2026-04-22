import { Check } from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';

import { getProtocolLogo } from '../utils/assetHelpers';

interface VisualizerLane {
  id: string;
  name: string;
  est: string;
}

interface IntentVisualizerProps {
  steps?: string[];
  lanes?: VisualizerLane[];
}

const DEFAULT_LANES: VisualizerLane[] = [
  { id: 'hyperliquid', name: 'Hyperliquid', est: '2.1s' },
  { id: 'gmx-v2', name: 'GMX V2', est: '~3.5s' },
  { id: 'morpho', name: 'Morpho', est: '1.8s' },
];

const DEFAULT_STEPS = ['Approve', 'Swap', 'Deposit'];

function getStepStatusClassName(
  isStepComplete: boolean,
  isStepActive: boolean,
): string {
  if (isStepComplete) {
    return 'bg-green-500 border-green-500';
  }

  if (isStepActive) {
    return 'bg-gray-900 border-green-500 animate-pulse';
  }

  return 'bg-gray-950 border-gray-800';
}

export function IntentVisualizer({
  steps = DEFAULT_STEPS,
  lanes = DEFAULT_LANES,
}: IntentVisualizerProps): ReactElement {
  const [laneProgress, setLaneProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    // Reset state on mount or when props change
    const initialProgress = lanes.reduce(
      (acc, lane) => ({ ...acc, [lane.id]: 0 }),
      {},
    );
    setLaneProgress(initialProgress);

    const intervals: NodeJS.Timeout[] = [];

    for (const lane of lanes) {
      // Randomize speed for each lane to simulate async network conditions
      const speed = Math.random() * 600 + 400;

      const timer = setInterval(() => {
        setLaneProgress((prev) => {
          const current = prev[lane.id] ?? 0;
          if (current >= steps.length) return prev;
          return { ...prev, [lane.id]: current + 1 };
        });
      }, speed);
      intervals.push(timer);
    }

    return () => {
      for (const interval of intervals) {
        clearInterval(interval);
      }
    };
  }, [lanes, steps.length]);

  return (
    <div className="w-full py-4 space-y-3">
      {lanes.map((lane) => {
        const currentStepIndex = laneProgress[lane.id] ?? 0;
        const isComplete = currentStepIndex >= steps.length;
        const progressPercent = Math.min(
          (currentStepIndex / steps.length) * 100,
          100,
        );

        return (
          <div
            key={lane.id}
            className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 flex items-center gap-4 relative overflow-hidden"
          >
            {/* Success Background Flash */}
            {isComplete && (
              <div className="absolute inset-0 bg-green-500/5 pointer-events-none" />
            )}

            {/* Protocol Identity */}
            <div className="w-8 h-8 rounded shrink-0 relative">
              <img
                src={getProtocolLogo(lane.id)}
                className="w-full h-full object-cover rounded opacity-80"
                alt={lane.name}
              />
              {isComplete && (
                <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-0.5 border-2 border-gray-900">
                  <Check className="w-2.5 h-2.5 text-black" />
                </div>
              )}
            </div>

            {/* Steps Flow */}
            <div className="flex-1 flex items-center justify-between relative">
              {/* Connecting Line */}
              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gray-800 -z-0">
                <div
                  className="h-full bg-green-500 transition-all duration-300 ease-linear"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {steps.map((label, idx) => {
                // Logic:
                // IF currentStepIndex > idx => Completed (Green)
                // IF currentStepIndex == idx => Current (Pulse)
                // ELSE => Pending (Gray)

                const isStepComplete = currentStepIndex > idx;
                const isStepActive = currentStepIndex === idx;

                return (
                  <div
                    key={idx}
                    className="relative z-10 flex flex-col items-center gap-1 group"
                  >
                    <div
                      className={`
                                        w-3 h-3 rounded-full border-2 transition-colors duration-300
                                        ${getStepStatusClassName(
                                          isStepComplete,
                                          isStepActive,
                                        )}
                                    `}
                    ></div>
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider ${isComplete || isStepComplete || isStepActive ? 'text-gray-300' : 'text-gray-700'}`}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* EST Time */}
            <div className="text-xs font-mono text-gray-500 w-12 text-right">
              {isComplete ? 'DONE' : lane.est}
            </div>
          </div>
        );
      })}
    </div>
  );
}
