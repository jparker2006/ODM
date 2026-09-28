// Every scenario by name, for the browser runner (?scenario=<name>).

import type { Scenario } from '../src/sim/scenario';
import { fixtureScenarios } from './fixtures';
import { districtScenarios } from './district';
import { titanScenarios, titanDistrictScenarios } from './titans';

export const ALL_SCENARIOS: Scenario[] = [...fixtureScenarios, ...districtScenarios, ...titanScenarios, ...titanDistrictScenarios];

export function findScenario(name: string): Scenario | null {
  return ALL_SCENARIOS.find((s) => s.name === name) ?? null;
}
