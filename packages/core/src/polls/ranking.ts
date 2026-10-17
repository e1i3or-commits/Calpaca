export type PollChoice = "yes" | "if_needed" | "no";

export type PollOptionTally = {
  optionId: string;
  yes: number;
  ifNeeded: number;
  no: number;
};

export function rankPollOptions(tallies: readonly PollOptionTally[]): PollOptionTally[] {
  return [...tallies].sort((left, right) => {
    if (left.yes !== right.yes) return right.yes - left.yes;
    if (left.ifNeeded !== right.ifNeeded) return right.ifNeeded - left.ifNeeded;
    if (left.no !== right.no) return left.no - right.no;
    return left.optionId.localeCompare(right.optionId);
  });
}
