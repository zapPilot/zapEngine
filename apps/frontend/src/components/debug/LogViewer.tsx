import { useEffect, useState } from 'react';

import { BaseCard } from '@/components/ui/BaseCard';
import { Z_INDEX } from '@/constants/design-system';
import { getRuntimeEnv, isRuntimeMode } from '@/lib/env/runtimeEnv';
import { type LogEntry, logger, LogLevel } from '@/utils/logger';

/**
 * Development Log Viewer Component
 *
 * Renders when `VITE_ENABLE_LOG_VIEWER=1` in development, or when
 * `VITE_ENABLE_DEBUG_LOGGING=true` (e.g. production diagnostics).
 */
export function LogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [filterLevel, setFilterLevel] = useState<LogLevel>(LogLevel.DEBUG);

  const shouldShow =
    (isRuntimeMode('development') &&
      getRuntimeEnv('VITE_ENABLE_LOG_VIEWER') === '1') ||
    getRuntimeEnv('VITE_ENABLE_DEBUG_LOGGING') === 'true';

  useEffect(() => {
    if (!shouldShow) return;

    const interval = setInterval(() => {
      const currentLogs = logger.getLogs();
      setLogs(currentLogs.filter((log) => log.level >= filterLevel));
    }, 1000);

    return () => clearInterval(interval);
  }, [shouldShow, filterLevel]);

  if (!shouldShow) return null;

  const getLevelColor = (level: LogLevel) => {
    switch (level) {
      case LogLevel.DEBUG:
        return 'text-gray-400';
      case LogLevel.INFO:
        return 'text-blue-400';
      case LogLevel.WARN:
        return 'text-yellow-400';
      case LogLevel.ERROR:
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const getLevelName = (level: LogLevel) => {
    switch (level) {
      case LogLevel.DEBUG:
        return 'DEBUG';
      case LogLevel.INFO:
        return 'INFO';
      case LogLevel.WARN:
        return 'WARN';
      case LogLevel.ERROR:
        return 'ERROR';
      default:
        return 'UNKNOWN';
    }
  };

  return (
    <div className={`fixed bottom-4 right-4 ${Z_INDEX.TOAST}`}>
      <button
        onClick={() => setIsVisible(!isVisible)}
        className="bg-gray-800 text-white px-3 py-2 rounded-lg text-sm font-mono"
      >
        🐛 Logs ({logs.length})
      </button>

      {isVisible && (
        <BaseCard
          variant="glass"
          className="mt-2 w-96 max-h-96 overflow-hidden"
        >
          <div className="p-3">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-semibold">Development Logs</h3>
              <div className="flex gap-2">
                <select
                  value={filterLevel}
                  onChange={(e) => setFilterLevel(parseInt(e.target.value))}
                  className="text-xs bg-gray-700 text-white rounded px-2 py-1"
                >
                  <option value={LogLevel.DEBUG}>DEBUG+</option>
                  <option value={LogLevel.INFO}>INFO+</option>
                  <option value={LogLevel.WARN}>WARN+</option>
                  <option value={LogLevel.ERROR}>ERROR</option>
                </select>
                <button
                  onClick={() => {
                    logger.clearLogs();
                    setLogs([]);
                  }}
                  className="text-xs bg-red-600 text-white rounded px-2 py-1"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="overflow-y-auto max-h-64 font-mono text-xs space-y-1">
              {logs.slice(-50).map((log, index) => {
                const renderData = () => {
                  if (!log.data) return null;
                  try {
                    const dataStr =
                      typeof log.data === 'string'
                        ? log.data
                        : JSON.stringify(log.data, null, 2);
                    return (
                      <div className="ml-4 text-gray-500 text-xs">
                        <pre>{dataStr}</pre>
                      </div>
                    );
                  } catch {
                    return (
                      <div className="ml-4 text-gray-500 text-xs">
                        <pre>[Object]</pre>
                      </div>
                    );
                  }
                };

                return (
                  <div key={index} className={`${getLevelColor(log.level)}`}>
                    <span className="text-gray-500">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="ml-2 font-semibold">
                      {getLevelName(log.level)}
                    </span>
                    {log.context && (
                      <span className="ml-1 text-gray-400">
                        [{log.context}]
                      </span>
                    )}
                    <span className="ml-2">{log.message}</span>
                    {renderData()}
                  </div>
                );
              })}
            </div>
          </div>
        </BaseCard>
      )}
    </div>
  );
}
