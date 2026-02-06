import type { Scenario, ScenarioIndexEntry } from "@ai-tutor/shared";

// ---------------------------------------------------------------------------
// Embedded scenarios — bundled at build time so the worker doesn't need KV/R2.
// Add new scenarios here and in the index.
// ---------------------------------------------------------------------------

import scenarioIndex from "../../../scenarios/index.json";
import a1TaxiBogota from "../../../scenarios/a1_taxi_bogota.json";

const scenarioMap: Record<string, Scenario> = {
  a1_taxi_bogota: a1TaxiBogota as unknown as Scenario,
};

export function getScenarioIndex(): ScenarioIndexEntry[] {
  return scenarioIndex as ScenarioIndexEntry[];
}

export function getScenario(id: string): Scenario | undefined {
  return scenarioMap[id];
}
