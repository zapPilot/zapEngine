import { Navigate, Route, Routes } from "react-router-dom";

import { BundlePage } from "./bundle/page";
import RootLayout from "./layout";
import { LandingPage } from "./page";

/**
 * Render the top-level SPA route tree.
 *
 * @returns The routed application shell.
 *
 * @example
 * ```tsx
 * <BrowserRouter>
 *   <App />
 * </BrowserRouter>
 * ```
 */
export function App() {
  return (
    <RootLayout>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/bundle" element={<BundlePage />} />
        <Route path="*" element={<Navigate to="/" replace={true} />} />
      </Routes>
    </RootLayout>
  );
}
