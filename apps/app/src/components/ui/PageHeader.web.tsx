import { useEffect, type ReactElement } from 'react';
import {
  PageHeader as SharedPageHeader,
  type PageHeaderProps,
} from './PageHeader.shared';
export function PageHeader(props: PageHeaderProps): ReactElement {
  useEffect(() => {
    document.title = `${props.title} · Zap Pilot`;
  }, [props.title]);
  return <SharedPageHeader {...props} />;
}
