type PrimaryActionLabelOptions = {
  hasCurrentRun: boolean;
  hasExistingSettlement: boolean;
};

export function getPrimaryActionLabel({
  hasCurrentRun,
  hasExistingSettlement,
}: PrimaryActionLabelOptions): string {
  if (hasExistingSettlement) {
    return 'Continue Colony';
  }

  return hasCurrentRun ? 'Continue Colony' : 'Start Colony';
}
