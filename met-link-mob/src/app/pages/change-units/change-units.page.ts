import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Preferences } from '@capacitor/preferences';
import { GlobalService } from 'src/app/services/global.service';
import { BluetoothService } from 'src/app/services/bluedata.service';

// ─── Unit definitions ──────────────────────────────────────────────────────────

interface UnitOption {
  label: string;
  value: string;
  /** Conversion FROM this unit TO the base unit (m/s, Pa, °C, m) */
  toBase: (v: number) => number;
  /** Conversion FROM the base unit TO this unit */
  fromBase: (v: number) => number;
}

interface UnitGroup {
  label: string; // Display name, e.g. "Wind Speed"
  prefKey: string; // Preferences key to persist selection
  units: UnitOption[];
  selected: number; // Index into `units`
}

// Base units: wind → m/s, pressure → hPa, temperature → °C, altitude → m
const UNIT_GROUPS: UnitGroup[] = [
  {
    label: 'Wind Speed',
    prefKey: 'unit_wind_speed',
    units: [
      { label: 'm/s', value: 'm/s', toBase: (v) => v, fromBase: (v) => v },
      {
        label: 'knots',
        value: 'kt',
        toBase: (v) => v * 0.514444,
        fromBase: (v) => v / 0.514444,
      },
      {
        label: 'km/h',
        value: 'km/h',
        toBase: (v) => v / 3.6,
        fromBase: (v) => v * 3.6,
      },
      {
        label: 'mph',
        value: 'mph',
        toBase: (v) => v * 0.44704,
        fromBase: (v) => v / 0.44704,
      },
      {
        label: 'Bft',
        value: 'Bft',
        toBase: (v) => Math.pow(v / 0.836, 2 / 3),
        fromBase: (v) => 0.836 * Math.pow(v, 3 / 2),
      },
    ],
    selected: 0,
  },
  {
    label: 'Pressure',
    prefKey: 'unit_pressure',
    units: [
      { label: 'hPa', value: 'hPa', toBase: (v) => v, fromBase: (v) => v },
      { label: 'mbar', value: 'mbar', toBase: (v) => v, fromBase: (v) => v },
      {
        label: 'inHg',
        value: 'inHg',
        toBase: (v) => v * 33.8639,
        fromBase: (v) => v / 33.8639,
      },
      {
        label: 'mmHg',
        value: 'mmHg',
        toBase: (v) => v * 1.33322,
        fromBase: (v) => v / 1.33322,
      },
      {
        label: 'PSI',
        value: 'psi',
        toBase: (v) => v * 68.9476,
        fromBase: (v) => v / 68.9476,
      },
    ],
    selected: 0,
  },
  {
    label: 'Temperature',
    prefKey: 'unit_temperature',
    units: [
      { label: '°C', value: '°C', toBase: (v) => v, fromBase: (v) => v },
      {
        label: '°F',
        value: '°F',
        toBase: (v) => ((v - 32) * 5) / 9,
        fromBase: (v) => (v * 9) / 5 + 32,
      },
      {
        label: 'K',
        value: 'K',
        toBase: (v) => v - 273.15,
        fromBase: (v) => v + 273.15,
      },
    ],
    selected: 0,
  },
  {
    label: 'Altitude',
    prefKey: 'unit_altitude',
    units: [
      { label: 'm', value: 'm', toBase: (v) => v, fromBase: (v) => v },
      {
        label: 'ft',
        value: 'ft',
        toBase: (v) => v * 0.3048,
        fromBase: (v) => v / 0.3048,
      },
    ],
    selected: 0,
  },
];

@Component({
  selector: 'app-change-units',
  templateUrl: './change-units.page.html',
  styleUrls: ['./change-units.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class ChangeUnitsPage implements OnInit {
  private globalService = inject(GlobalService);
  private bluetoothService = inject(BluetoothService);

  readonly groups = signal<UnitGroup[]>(structuredClone(UNIT_GROUPS));

  get theme(): string {
    return this.globalService.theme();
  }

  async ngOnInit(): Promise<void> {
    await this.loadSavedSelections();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Persistence
  // ─────────────────────────────────────────────────────────────────────────────

  private async loadSavedSelections(): Promise<void> {
    const updated = [...this.groups()];
    for (const group of updated) {
      const { value } = await Preferences.get({ key: group.prefKey });
      if (value !== null) {
        const idx = group.units.findIndex((u) => u.value === value);
        if (idx !== -1) group.selected = idx;
      }
    }
    this.groups.set(updated);
  }

  async onUnitChange(groupIdx: number, unitIdx: number): Promise<void> {
    const updated = [...this.groups()];
    updated[groupIdx] = { ...updated[groupIdx], selected: unitIdx };
    this.groups.set(updated);

    const group = updated[groupIdx];
    await Preferences.set({
      key: group.prefKey,
      value: group.units[unitIdx].value,
    });

    // Notify BluetoothService so live data display updates immediately.
    this.bluetoothService.applyUnitPreferences(this.buildUnitMap(updated));
  }

  /** Returns a label → unit-value map consumed by BluetoothService. */
  private buildUnitMap(groups: UnitGroup[]): Record<string, string> {
    return groups.reduce((acc, g) => {
      acc[g.label] = g.units[g.selected].value;
      return acc;
    }, {} as Record<string, string>);
  }
}
