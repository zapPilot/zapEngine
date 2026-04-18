// Google Analytics configuration
export const GA_TRACKING_ID = process.env.NEXT_PUBLIC_GA_ID || '';

// Track page views
export const pageview = (url: string) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('config', GA_TRACKING_ID, {
      page_path: url,
    });
  }
};

// Track custom events
export const event = ({
  name,
  parameters,
}: {
  name: string;
  parameters?: Record<string, string | number | boolean>;
}) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', name, parameters);
  }
};
