// F4 tuning panel: every feel constant, grouped by system with units, edited live, with a
// Markdown before and after table for Jake's approval.

import { PARAMS, TUNING_KEYS, defaultTuning, tuningTable, type Tuning, type TuningKey } from '../sim/tuning';

export class TuningPanel {
  private el = document.getElementById('tuning')!;
  private baseline: Tuning;
  private inputs = new Map<TuningKey, { range: HTMLInputElement; num: HTMLInputElement; row: HTMLElement }>();
  private out!: HTMLTextAreaElement;
  onChange: ((key: TuningKey) => void) | null = null;

  constructor(private readonly tuning: Tuning) {
    this.baseline = { ...tuning };
    this.build();
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  toggle(): void {
    this.el.hidden = !this.el.hidden;
  }

  /** The Markdown table of every constant that differs from the session's starting values. */
  exportTable(all = false): string {
    return tuningTable(this.baseline, this.tuning, all);
  }

  private build(): void {
    const head = document.createElement('div');
    head.innerHTML = '<h2>TUNING</h2><small>Changes apply live. Export shows before and after for approval.</small>';
    this.el.appendChild(head);
    const buttons = document.createElement('div');
    buttons.className = 'buttons';
    const exportBtn = button('Export changes', () => this.showExport(false));
    const exportAll = button('Export all', () => this.showExport(true));
    const reset = button('Reset to spec', () => this.resetAll());
    buttons.append(exportBtn, exportAll, reset);
    this.el.appendChild(buttons);
    this.out = document.createElement('textarea');
    this.out.readOnly = true;
    this.out.hidden = true;
    this.el.appendChild(this.out);

    let group = '';
    for (const k of TUNING_KEYS) {
      const s = PARAMS[k];
      if (s.group !== group) {
        group = s.group;
        const h = document.createElement('h3');
        h.textContent = group;
        this.el.appendChild(h);
      }
      const row = document.createElement('div');
      row.className = 'row';
      const label = document.createElement('label');
      label.textContent = s.label;
      const num = document.createElement('input');
      num.type = 'number';
      num.step = String(s.step);
      num.min = String(s.min);
      num.max = String(s.max);
      num.value = String(this.tuning[k]);
      const unit = document.createElement('small');
      unit.textContent = `${s.unit}  (${k})`;
      const range = document.createElement('input');
      range.type = 'range';
      range.min = String(s.min);
      range.max = String(s.max);
      range.step = String(s.step);
      range.value = String(this.tuning[k]);
      if (s.fixed) {
        num.disabled = true;
        range.disabled = true;
      }
      const set = (v: number) => {
        if (!Number.isFinite(v)) return;
        this.tuning[k] = v;
        num.value = String(v);
        range.value = String(v);
        row.classList.toggle('changed', v !== this.baseline[k]);
        this.onChange?.(k);
      };
      range.addEventListener('input', () => set(Number(range.value)));
      num.addEventListener('change', () => set(Number(num.value)));
      row.append(label, num, unit, range);
      this.el.appendChild(row);
      this.inputs.set(k, { range, num, row });
    }
  }

  private showExport(all: boolean): void {
    this.out.hidden = false;
    this.out.value = this.exportTable(all);
    this.out.select();
    void navigator.clipboard?.writeText(this.out.value).catch(() => undefined);
  }

  private resetAll(): void {
    const d = defaultTuning();
    for (const k of TUNING_KEYS) {
      this.tuning[k] = d[k];
      const i = this.inputs.get(k)!;
      i.num.value = String(d[k]);
      i.range.value = String(d[k]);
      i.row.classList.toggle('changed', d[k] !== this.baseline[k]);
      this.onChange?.(k);
    }
  }
}

function button(text: string, fn: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  b.addEventListener('click', fn);
  return b;
}
