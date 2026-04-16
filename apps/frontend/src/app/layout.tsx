/* c8 ignore file - Root shell composition is exercised through route tests */
import type { ReactNode } from "react";

import { ErrorBoundary } from "@/components/errors/ErrorBoundary";

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
