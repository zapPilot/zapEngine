/** Browser navigation boundary: tolerate a missing or not-yet-mounted stage. */
export function jumpEngine(section: HTMLElement | null, time: number): void {
  if (!section) {
    return;
  }
  const stage = section.firstElementChild;
  window.scrollTo({
    top:
      section.getBoundingClientRect().top +
      window.scrollY -
      68 +
      (0.065 + 0.935 * time) *
        (section.offsetHeight - (stage?.clientHeight ?? 820)),
    behavior: 'smooth',
  });
}
