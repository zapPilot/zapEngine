// The language menu is a <details> and works without this script. With it,
// opening one menu closes the others (every deck slide has its own), and a
// click elsewhere or Escape closes it.

export function initLangMenu(root: Document = document): () => void {
  const menus = Array.from(
    root.querySelectorAll<HTMLDetailsElement>('details.lang-switch'),
  );
  if (menus.length === 0) return () => undefined;

  const closeAll = (except?: Element): void => {
    for (const menu of menus) if (menu !== except) menu.open = false;
  };
  const onToggle = (event: Event): void => {
    const menu = event.currentTarget;
    if (menu instanceof HTMLDetailsElement && menu.open) closeAll(menu);
  };
  const onClick = (event: Event): void => {
    const target = event.target;
    closeAll(
      target instanceof Node
        ? menus.find((m) => m.contains(target))
        : undefined,
    );
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    const open = menus.find((menu) => menu.open);
    if (!open) return;
    open.open = false;
    open.querySelector('summary')?.focus();
  };

  for (const menu of menus) menu.addEventListener('toggle', onToggle);
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  return () => {
    for (const menu of menus) menu.removeEventListener('toggle', onToggle);
    root.removeEventListener('click', onClick);
    root.removeEventListener('keydown', onKey);
  };
}
