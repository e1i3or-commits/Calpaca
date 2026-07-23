export function allowedDurations(
  defaultDuration: number,
  selectableDurations?: readonly number[],
): readonly number[] {
  return selectableDurations?.length ? selectableDurations : [defaultDuration];
}

export function isAllowedDuration(
  duration: number,
  defaultDuration: number,
  selectableDurations?: readonly number[],
): boolean {
  return allowedDurations(defaultDuration, selectableDurations).includes(duration);
}
