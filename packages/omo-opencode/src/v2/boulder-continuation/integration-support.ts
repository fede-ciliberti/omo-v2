/**
 * [OMC] v2 boulder-continuation integration support barrel.
 *
 * Re-exports the fixtures and the harness so `integration.test.ts` keeps one
 * import site. Split from a single 296-line file to respect the 200 LOC ceiling.
 */

export * from "./integration-fixtures"
export * from "./integration-harness"
