// Which shape the Home screen takes. This is a per-user *server* setting, not a
// localStorage one: it describes how someone wants to see their money, so it
// should follow them to another device.
//
// Goal progress is the third layout we intend to offer. It needs the goals
// entity to exist first, so it isn't listed yet — adding it means adding an id
// here, a case in Home, and nothing else.

export const HOME_LAYOUTS = [
  {
    id: 'runway',
    label: 'Runway & safety',
    description: 'Leads with whether any account is about to run short.',
  },
  {
    id: 'balance',
    label: 'Balance sheet',
    description: 'Leads with net worth, and where the money and the debt sit.',
  },
] as const;

export type HomeLayout = typeof HOME_LAYOUTS[number]['id'];

export const DEFAULT_HOME_LAYOUT: HomeLayout = 'runway';

export const HOME_LAYOUT_IDS: readonly HomeLayout[] = HOME_LAYOUTS.map((l) => l.id);

/**
 * The stored value, or the default when it's missing or unrecognized.
 *
 * Never trust the stored string: a value written by a newer build, or a layout
 * we later remove, must not be able to render nothing. This is the same failure
 * that blanked the whole app when a retired tab id came back from localStorage.
 */
export function resolveHomeLayout(raw: string | null | undefined): HomeLayout {
  return HOME_LAYOUT_IDS.includes(raw as HomeLayout) ? (raw as HomeLayout) : DEFAULT_HOME_LAYOUT;
}

export function homeLayoutLabel(layout: HomeLayout): string {
  return HOME_LAYOUTS.find((l) => l.id === layout)?.label ?? layout;
}
