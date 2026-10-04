import type { FC } from 'react';
import { useCurrentFrame } from 'remotion';

import { rise } from '../../../primitives/motion';
import { jaFont } from '../fonts';
import { FIGURES } from '../story';
import { theme } from '../theme';
import { Icon } from './icons';
import { Pill, Zone } from './Zone';

/** Arrives with the step it points to. */
const Arrow: FC<{ readonly from: number }> = ({ from }) => {
  const frame = useCurrentFrame();
  return (
    <span style={{ display: 'inline-flex', opacity: rise(frame, from, 10) }}>
      <Icon name="arrow" size={30} color="#8e8e93" strokeWidth={2} />
    </span>
  );
};

/** Where patient data goes: to a cloud AI before, to the in-house AI after. */
export const DataFlow: FC<{ readonly from: number }> = ({ from }) => {
  const frame = useCurrentFrame();
  const { before, after, inside } = FIGURES.beforeAfter;
  const [data = '', cloud = '', worry = ''] = before.steps;
  const [ownData = '', kokode = '', local = ''] = after.steps;
  const afterFrom = from + 24;
  const label = (text: string, at: number) => (
    <span
      style={{ fontSize: 22, color: theme.muted, opacity: rise(frame, at) }}
    >
      {text}
    </span>
  );
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        fontFamily: jaFont,
        fontSize: 26,
      }}
    >
      {label(before.label, from)}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 24,
          opacity: 1 - rise(frame, afterFrom + 10, 16) * 0.5,
        }}
      >
        <Pill from={from}>{data}</Pill>
        <Arrow from={from + 6} />
        <Pill tone="muted" from={from + 6}>
          <Icon name="cloud" size={28} color={theme.muted} />
          {cloud}
        </Pill>
        <Arrow from={from + 12} />
        <Pill tone="warn" from={from + 12}>
          {worry}
        </Pill>
      </div>
      {label(after.label, afterFrom)}
      <Zone label={inside} from={afterFrom}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Pill from={afterFrom + 4}>{ownData}</Pill>
          <Arrow from={afterFrom + 10} />
          <Pill tone="accent" from={afterFrom + 10}>
            {kokode}
          </Pill>
          <Arrow from={afterFrom + 16} />
          <Pill tone="soft" from={afterFrom + 16}>
            {local}
          </Pill>
        </div>
      </Zone>
    </div>
  );
};

/**
 * Who can reach KOKODE: devices on the staff network, after login. The
 * patients' Wi-Fi is a separate network that cannot.
 */
export const NetworkDiagram: FC<{ readonly from: number }> = ({ from }) => {
  const f = FIGURES.boundary;
  const [pc = '', tablet = ''] = f.devices;
  return (
    <Zone
      label={f.inside}
      from={from}
      style={{ fontFamily: jaFont, fontSize: 26, width: 860 }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          padding: 22,
          borderRadius: 22,
          background: theme.blueSoft,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            color: theme.blue,
            fontWeight: 700,
          }}
        >
          <Icon name="wifi" size={30} color={theme.blue} />
          {f.network}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Pill from={from + 8}>
            <Icon name="pc" size={30} color={theme.ink} />
            {pc}
          </Pill>
          <Pill from={from + 12}>
            <Icon name="tablet" size={30} color={theme.ink} />
            {tablet}
          </Pill>
          <Arrow from={from + 20} />
          <Pill from={from + 20}>
            <Icon name="lock" size={28} color={theme.ink} />
            {f.login}
          </Pill>
          <Arrow from={from + 28} />
          <Pill tone="accent" from={from + 28}>
            <Icon name="server" size={28} color={theme.surface} />
            {f.server}
          </Pill>
        </div>
      </div>
      <div style={{ marginTop: 18, display: 'flex' }}>
        <Pill tone="muted" from={from + 36}>
          <Icon name="wifi" size={28} color={theme.muted} />
          {f.guest}
          <Icon name="blocked" size={30} color={theme.danger} />
        </Pill>
      </div>
    </Zone>
  );
};
