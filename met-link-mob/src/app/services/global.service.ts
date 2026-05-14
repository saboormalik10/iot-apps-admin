import { inject, Injectable, signal, computed } from '@angular/core';
import { ColorScheme } from '../interfaces/color-scheme.interface';
import {
  ModalController,
  MenuController,
  ToastController,
  NavController,
} from '@ionic/angular/standalone';

import { ConfigurationModalComponent } from 'src/app/components/configration-modal.component';
import { Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';

// ─── Theme definition ─────────────────────────────────────────────────────────

interface BatteryManager extends EventTarget {
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
  level: number;
  onchargingchange: ((this: BatteryManager, ev: Event) => any) | null;
  onchargingtimechange: ((this: BatteryManager, ev: Event) => any) | null;
  ondischargingtimechange: ((this: BatteryManager, ev: Event) => any) | null;
  onlevelchange: ((this: BatteryManager, ev: Event) => any) | null;
}

interface ThemeEntry {
  theme: string;
  themeLight: string;
}

const THEME_MAP: Record<number, ThemeEntry> = {
  0: { theme: 'obsblack', themeLight: 'obsblackL' },
  1: { theme: 'obsgrey', themeLight: 'obsgreyL' },
  2: { theme: 'obsblue', themeLight: 'obsblueL' },
};
const DEFAULT_COLOR_INDEX = 2;

@Injectable({
  providedIn: 'root',
})
export class GlobalService {
  // ── Signals ──────────────────────────────────────────────────────────────────
  // Using Angular Signals means any page that reads `globalService.theme` or
  // `globalService.themeLight` will automatically re-render when the theme
  // changes — no manual subscription or `ionViewWillEnter` refresh needed.

  private readonly _colorIndex = signal<number>(DEFAULT_COLOR_INDEX);

  readonly theme = computed(() => THEME_MAP[this._colorIndex()].theme);
  readonly themeLight = computed(
    () => THEME_MAP[this._colorIndex()].themeLight
  );
  readonly selectedColor = computed(() => this._colorIndex());

  // ── Phone battery (Web Battery Status API) ───────────────────────────────────
  // Works on Android WebView (Chrome 64+). iOS WKWebView does NOT implement
  // navigator.getBattery() — phoneBatteryAvailable stays false and the template
  // @if block simply won't render, so there's zero impact on iOS.
  readonly phoneBatteryLevel = signal<number>(1); // 0.0 – 1.0
  readonly phoneBatteryCharging = signal<boolean>(false);
  readonly phoneBatteryAvailable = signal<boolean>(false);

  /** Human-readable percentage, e.g. "87 %" */
  readonly phoneBatteryPct = computed(
    () => Math.round(this.phoneBatteryLevel() * 100) + ' %'
  );

  // ── DI ───────────────────────────────────────────────────────────────────────
  private readonly modalController = inject(ModalController);
  private readonly menuController = inject(MenuController);
  private readonly toastController = inject(ToastController);
  private readonly navCtrl = inject(NavController);
  private readonly router = inject(Router);

  // ── Wind rose color schemes ─────────────────────────────────────────────────
  readonly colorScheme: ColorScheme[] = [
    {
      // 0 — Black
      shadow0: 'rgba(0,0,0, 0.3)',
      shadow1: 'rgba(0,0,0, 0.6)',
      shadow2: 'rgba(0,0,0, 0.8)',
      out0: 'rgba(0,0,0, 1)',
      out1: 'grey',
      spike: 'black',
      out2: 'black',
      in0: 'grey',
      biem: '#424242',
      tria0: '#DCDCDC',
      tria1: '#6D6D6D',
      in1: 'black',
      num: 'white',
      ind0: '#C60F0F',
      ind1: '#870A0A',
    },
    {
      // 1 — Grey
      shadow0: 'rgba(128,128,128, 0.3)',
      shadow1: 'rgba(128,128,128, 0.6)',
      shadow2: 'rgba(128,128,128, 0.8)',
      out0: 'rgba(128,128,128, 1)',
      out1: 'darkgrey',
      spike: 'grey',
      out2: 'grey',
      in0: 'darkgrey',
      biem: '#949494',
      tria0: '#DCDCDC',
      tria1: '#6D6D6D',
      in1: 'grey',
      num: 'white',
      ind0: '#C60F0F',
      ind1: '#870A0A',
    },
    {
      // 2 — Observator Blue (default)
      shadow0: 'rgba(8,32,107, 0.3)',
      shadow1: 'rgba(8,32,132, 0.6)',
      shadow2: 'rgba(8,32,148, 0.8)',
      out0: 'rgba(8,32,90, 1)',
      out1: 'rgba(0,0,255, 1)',
      spike: 'rgba(8,32,90, 1)',
      out2: 'rgba(8,32,90, 1)',
      in0: 'rgba(8,32,148, 1)',
      biem: 'rgba(0,0,255,1)',
      tria0: '#00006B',
      tria1: '#0000CE',
      in1: 'rgba(8,32,90, 1)',
      num: 'white',
      ind0: '#C60F0F',
      ind1: '#870A0A',
    },
  ];

  constructor() {
    this.initTheme();
    this.initPhoneBattery();
  }

  // ── Phone battery init ────────────────────────────────────────────────────────

  /**
   * Subscribes to the Web Battery Status API.
   * - Android WebView supports this API natively.
   * - iOS WKWebView does NOT → `navigator.getBattery` is undefined → we set
   *   `phoneBatteryAvailable = false` and the template @if hides the widget.
   */
  private initPhoneBattery(): void {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<BatteryManager>;
    };
    if (typeof nav.getBattery !== 'function') return;

    nav
      .getBattery()
      .then((battery: BatteryManager) => {
        const update = () => {
          this.phoneBatteryLevel.set(battery.level);
          this.phoneBatteryCharging.set(battery.charging);
          this.phoneBatteryAvailable.set(true);
        };

        update();
        battery.addEventListener('levelchange', update);
        battery.addEventListener('chargingchange', update);
      })
      .catch(() => {
        // Permission denied or unsupported — keep phoneBatteryAvailable = false.
      });
  }

  // ── Theme init & persistence ─────────────────────────────────────────────────

  async initTheme(): Promise<void> {
    try {
      const { value } = await Preferences.get({ key: 'color' });
      this._setColorIndex(value ? parseInt(value, 10) : DEFAULT_COLOR_INDEX);
    } catch {
      // Preferences unavailable on first launch — keep default
      this._setColorIndex(DEFAULT_COLOR_INDEX);
    }
  }

  /**
   * Change the colour theme and persist the choice.
   * @param index  0 = black, 1 = grey, 2 = blue
   */
  async setThemeByColorIndex(index: number): Promise<void> {
    this._setColorIndex(index);
    try {
      await Preferences.set({ key: 'color', value: index.toString() });
    } catch (e) {
      console.warn('[GlobalService] Could not persist theme preference:', e);
    }
  }

  private _setColorIndex(raw: number): void {
    const safe = isNaN(raw) || raw < 0 || raw > 2 ? DEFAULT_COLOR_INDEX : raw;
    this._colorIndex.set(safe);
  }

  // ── Menu ─────────────────────────────────────────────────────────────────────

  async toggleMenu(): Promise<void> {
    const isOpen = await this.menuController.isOpen();
    isOpen
      ? await this.menuController.close()
      : await this.menuController.open();
  }

  async openMenu(): Promise<void> {
    await this.menuController.open();
  }
  async closeMenu(): Promise<void> {
    await this.menuController.close();
  }
  enableMenu(): void {
    this.menuController.enable(true);
  }

  // ── Configuration modal ──────────────────────────────────────────────────────

  async goToConfig(fromPage: number = 0): Promise<void> {
    const modal = await this.modalController.create({
      component: ConfigurationModalComponent,
      componentProps: { fromPage },
    });

    await modal.present();
    const { data } = await modal.onDidDismiss();

    if (data?.layoutChanged || data?.colorChanged || data?.demoMode) {
      // Navigate to the correct root — use navigateRoot so the back-stack is cleared.
      // fromPage === 1 means the modal was opened from the live-data section.
      const dest =
        fromPage === 1 || data?.demoMode ? '/live-data/dashboard' : '/devices';
      this.navCtrl.navigateRoot(dest);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  getWindRoseColorScheme(): ColorScheme {
    return this.colorScheme[this._colorIndex()];
  }

  isBlackTheme(): boolean {
    return this._colorIndex() === 0;
  }
  isGreyTheme(): boolean {
    return this._colorIndex() === 1;
  }
  isBlueTheme(): boolean {
    return this._colorIndex() === 2;
  }

  async showToast(message: string, color: string = 'dark'): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      position: 'bottom',
      color,
    });
    await toast.present();
  }
}
