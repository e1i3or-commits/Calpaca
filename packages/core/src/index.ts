// @calpaca/core: the pure scheduling engine behind Calpaca. No I/O: every
// function takes plain data (Temporal values, rules, busy intervals) and
// returns plain data, so it runs the same in Bun, Node and the browser.

export * from "./result.js";
export * from "./timezone.js";
export * from "./availability/intervals.js";
export * from "./availability/rules.js";
export * from "./availability/overrides.js";
export * from "./availability/slots.js";
export * from "./availability/scoring.js";
export * from "./availability/group.js";
export * from "./availability/mutual.js";
export * from "./availability/provenance.js";
export * from "./availability/suggest.js";
export * from "./availability/troubleshoot.js";
export * from "./assignment/round-robin.js";
export * from "./booking/durations.js";
export * from "./booking/guests.js";
export * from "./booking/locations.js";
export * from "./booking/questions.js";
export * from "./booking/state.js";
export * from "./routing/condition.js";
export * from "./routing/evaluate.js";
export * from "./routing/form.js";
export * from "./polls/ranking.js";
export * from "./proposals/state.js";
export * from "./sync/busy-mapping.js";

// Re-exported so callers build Instants with the exact Temporal copy the
// engine was compiled against (polyfill brand checks reject foreign copies).
export { Temporal } from "@js-temporal/polyfill";
