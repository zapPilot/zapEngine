import {
  Activity,
  Headphones,
  House,
  type LucideIcon,
  PieChart,
  Sparkles,
  User,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';

interface TabItem {
  to: string;
  label: string;
  Icon: LucideIcon;
}

const TABS: readonly TabItem[] = [
  { to: '/home', label: 'Home', Icon: House },
  { to: '/portfolio', label: 'Portfolio', Icon: PieChart },
  { to: '/strategy', label: 'Strategy', Icon: Sparkles },
  { to: '/podcast', label: 'Podcast', Icon: Headphones },
  { to: '/activity', label: 'Activity', Icon: Activity },
  { to: '/account', label: 'Account', Icon: User },
];

/** Persistent bottom tab navigation pinned to the phone frame. */
export function BottomTabBar() {
  return (
    <nav
      className="flex shrink-0 border-t border-line px-1.5 pb-2 pt-3"
      style={{ background: 'rgba(10,10,10,.85)' }}
    >
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className="flex flex-1 flex-col items-center gap-1.5"
        >
          {({ isActive }) => (
            <span
              className={
                isActive
                  ? 'flex flex-col items-center gap-1.5 text-accent'
                  : 'flex flex-col items-center gap-1.5 text-ink-faint'
              }
            >
              <Icon size={22} strokeWidth={1.7} />
              <span
                className="text-[10px]"
                style={{ fontWeight: isActive ? 600 : 400 }}
              >
                {label}
              </span>
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
