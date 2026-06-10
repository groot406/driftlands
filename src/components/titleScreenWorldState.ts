export type DesktopWorldMode = 'solo' | 'lan-host' | 'lan-join' | 'shared';

type DesktopWorldPanelState = {
  joinPanelOpen: boolean;
  sharedPanelOpen: boolean;
};

export function getDesktopWorldDisplayMode(
  activeMode: DesktopWorldMode,
  panels: DesktopWorldPanelState,
): DesktopWorldMode {
  if (panels.joinPanelOpen) {
    return 'lan-join';
  }

  if (panels.sharedPanelOpen) {
    return 'shared';
  }

  return activeMode;
}
