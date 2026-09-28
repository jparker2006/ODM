// Entry point: checks for WebGPU, reports the adapter, then boots the game (live play, or a
// named scenario with ?scenario=<name> for the browser runner).

import { Game } from './game/game';
import { Automation, type AdapterReport } from './game/automation';
import { Hud } from './ui/hud';
import { findScenario } from '../scenarios/index';

const auto = new Automation();
window.__odm = auto;

async function main(): Promise<void> {
  const hud = new Hud();
  const params = new URLSearchParams(location.search);
  const name = params.get('scenario');
  const scenario = name ? findScenario(name) : null;
  auto.scenario = name;
  if (name && !scenario) {
    auto.state = 'error';
    auto.errors.push(`Unknown scenario ${name}`);
    hud.showError('ODM', `Unknown scenario "${name}".`);
    return;
  }

  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  const adapter = gpu ? await gpu.requestAdapter({ powerPreference: 'high-performance' }) : null;
  if (!adapter) {
    auto.state = 'no-webgpu';
    hud.showError(
      'WebGPU needed',
      'ODM runs on WebGPU, and this browser has it turned off or unavailable. Use a current Chrome or Safari on a Mac with Apple silicon.',
    );
    return;
  }
  const info = (adapter as GPUAdapter & { info?: GPUAdapterInfo & { isFallbackAdapter?: boolean }; isFallbackAdapter?: boolean }).info;
  const report: AdapterReport = {
    vendor: info?.vendor ?? '',
    architecture: info?.architecture ?? '',
    device: info?.device ?? '',
    description: info?.description ?? '',
    isFallback: Boolean(info?.isFallbackAdapter ?? (adapter as { isFallbackAdapter?: boolean }).isFallbackAdapter),
    // ?timestamps=0 turns GPU timing off (to measure its own cost).
    timestamps: adapter.features.has('timestamp-query') && params.get('timestamps') !== '0',
  };
  auto.adapter = report;

  try {
    await new Game({ scenario, adapter, report, automation: auto }).boot();
  } catch (e) {
    auto.state = 'error';
    auto.errors.push(String(e instanceof Error ? (e.stack ?? e.message) : e));
    hud.showError('ODM', 'Something went wrong while loading. Details are in the console.');
    console.error(e);
  }
}

void main();
