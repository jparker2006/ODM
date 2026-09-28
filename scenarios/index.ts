// Every scenario by name, for the browser runner (?scenario=<name>).

import type { Scenario } from '../src/sim/scenario';
import { fixtureScenarios } from './fixtures';
import { districtScenarios } from './district';

export const ALL_SCENARIOS: Scenario[] = [...fixtureScenarios, ...districtScenarios];

export function findScenario(name: string): Scenario | null {
  return ALL_SCENARIOS.find((s) => s.name === name) ?? null;
}
