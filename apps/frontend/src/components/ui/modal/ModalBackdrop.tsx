import { motion } from "framer-motion";
import type { PropsWithChildren } from "react";

import { Z_INDEX } from "@/constants/design-system";
import { fadeInOut } from "@/lib/ui/animationVariants";

interface ModalBackdropProps {
  onDismiss: () => void;
  innerClassName?: string;
}

export function ModalBackdrop({
  children,
  onDismiss,
  innerClassName = "",
}: PropsWithChildren<ModalBackdropProps>) {
  return (
    <motion.div
      variants={fadeInOut}
      initial="initial"
      animate="animate"
      exit="exit"
      className={`fixed inset-0 ${Z_INDEX.MODAL} bg-gray-950/80 backdrop-blur-lg flex items-center justify-center p-4`}
      onClick={onDismiss}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className={innerClassName}
        onClick={event => event.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
