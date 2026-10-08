import { RootProvider } from 'fumadocs-ui/provider/next';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { BrandMark } from '@/components/BrandMark';
import { source } from '@/lib/source';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootProvider
      theme={{ defaultTheme: 'light', enableSystem: false }}
      search={{ options: { type: 'static', api: '/api/search/static.json' } }}
    >
      <DocsLayout
        tree={source.pageTree}
        nav={{ title: <BrandMark />, url: '/' }}
        sidebar={{ defaultOpenLevel: 1 }}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
