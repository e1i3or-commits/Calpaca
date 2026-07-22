/**
 * Named DST scenarios shared across core test suites. Each fixture names an
 * IANA zone and a local wall-clock datetime at (or spanning) its transition,
 * fed to `zoned()` in tests/helpers/time.ts.
 */
export interface DstFixture {
  readonly name: string;
  readonly timeZone: string;
  readonly localTransition: string;
}

/** US spring-forward: second Sunday of March, clocks skip 02:00 -> 03:00 (a gap). */
export const usSpringForward: DstFixture = {
  name: "US spring-forward",
  timeZone: "America/New_York",
  localTransition: "2027-03-14 02:00",
};

/** US fall-back: first Sunday of November, the 01:00-02:00 wall-clock hour repeats (a fold). */
export const usFallBack: DstFixture = {
  name: "US fall-back",
  timeZone: "America/New_York",
  localTransition: "2027-11-07 01:30",
};

/** Southern-hemisphere DST start: first Sunday of October, clocks skip 02:00 -> 03:00 (a gap). */
export const sydneySpringForward: DstFixture = {
  name: "Sydney spring-forward",
  timeZone: "Australia/Sydney",
  localTransition: "2027-10-03 02:00",
};

/** No-DST zone: same nominal date as the US spring-forward, but the offset never moves. */
export const phoenixNoDst: DstFixture = {
  name: "Phoenix no-DST",
  timeZone: "America/Phoenix",
  localTransition: "2027-03-14 02:00",
};

export const dstFixtures: readonly DstFixture[] = [
  usSpringForward,
  usFallBack,
  sydneySpringForward,
  phoenixNoDst,
];
