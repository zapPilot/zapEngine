import { motion } from "framer-motion";

import { DATA_TEST_ID_PROP } from "../constants";
import { Skeleton } from "../Skeleton";

export function MetricsSkeleton({
  className = "",
  [DATA_TEST_ID_PROP]: testId = "metrics-skeleton",
}: {
  className?: string;
  [DATA_TEST_ID_PROP]?: string;
}) {
  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-3 gap-4 ${className}`}
      data-testid={testId}
    >
      {Array.from({ length: 3 }).map((_, index) => (
        <motion.div
          key={index}
          className="text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: index * 0.1 }}
        >
          <Skeleton variant="text" height={32} className="mb-2" width="70%" />
          <Skeleton variant="text" height={16} width="50%" />
        </motion.div>
      ))}
    </div>
  );
}
