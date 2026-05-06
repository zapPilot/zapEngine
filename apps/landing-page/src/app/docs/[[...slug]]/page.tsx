import { notFound } from 'next/navigation';
import {
  DocsPage,
  DocsBody,
  DocsTitle,
  DocsDescription,
} from 'fumadocs-ui/page';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { source } from '@/lib/source';
import type { TOCItemType } from 'fumadocs-core/toc';
import type { ComponentType } from 'react';

// MDX-enhanced page data interface with body and toc
interface PageDataWithMDX {
  title: string;
  description?: string;
  body: ComponentType<Record<string, unknown>>;
  toc: TOCItemType[];
}

type DocsRouteParams = Promise<{ slug?: string[] }>;
type DocsRouteProps = { params: DocsRouteParams };

function getDocsPage(slug: string[] | undefined) {
  const page = source.getPage(slug);
  if (!page) notFound();
  return page;
}

async function resolveDocsPage(params: DocsRouteParams) {
  return getDocsPage((await params).slug);
}

export default async function Page(props: DocsRouteProps) {
  const page = await resolveDocsPage(props.params);

  const data = page.data as PageDataWithMDX;
  const MDX = data.body;

  return (
    <DocsPage toc={data.toc}>
      <DocsTitle>{data.title}</DocsTitle>
      <DocsDescription>{data.description}</DocsDescription>
      <DocsBody>
        <MDX components={defaultMdxComponents} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({ params }: DocsRouteProps) {
  const page = await resolveDocsPage(params);

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
