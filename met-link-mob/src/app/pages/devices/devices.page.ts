import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import {
  LoadingController,
  ToastController,
  AlertController,
} from '@ionic/angular/standalone';
import { IonicModule } from '@ionic/angular';
import { NavController } from '@ionic/angular';

import { Capacitor } from '@capacitor/core';
import { addIcons } from 'ionicons';
import { Device } from '@capacitor/device';
import {
  menuOutline,
  ellipsisVertical,
  batteryFull,
  batteryCharging,
  menu,
  playOutline,
  stopOutline,
} from 'ionicons/icons';
import { BluetoothService } from 'src/app/services/bluedata.service';
import { Subscription } from 'rxjs';
import { GlobalService } from 'src/app/services/global.service';

@Component({
  selector: 'app-devices',
  templateUrl: './devices.page.html',
  styleUrls: ['./devices.page.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule, IonicModule],
})
export class DevicesPage implements OnInit, OnDestroy {
  private subscriptions: Subscription[] = [];
  private scanInterval: any = null;
  private scanTimeout: any = null;

  private globalService = inject(GlobalService);

  // Signals for reactive UI state
  readonly devices = signal<any[]>([]);
  readonly isScanning = signal(false);
  readonly isConnected = signal(false);
  readonly deviceName = signal('');

  // Computed values
  readonly theme = computed(() => this.globalService.theme());
  readonly connectButtonLabel = computed(() =>
    this.isConnected() ? `Disconnect ${this.deviceName()}` : 'Find devices'
  );

  constructor(
    public bluetoothService: BluetoothService,
    private loadingController: LoadingController,
    private toastController: ToastController,
    private alertController: AlertController,
    private router: Router,
    private navCtrl: NavController
  ) {
    addIcons({
      menuOutline,
      ellipsisVertical,
      batteryFull,
      batteryCharging,
      menu,
      playOutline,
      stopOutline,
    });
  }

  async ngOnInit() {
    // Subscribe to connection state changes
    this.subscriptions.push(
      this.bluetoothService.connectionState$.subscribe((state) => {
        this.isConnected.set(state.isConnected);
        this.deviceName.set(state.currentDevice?.name || '');
      })
    );

    await this.checkConnectionStatus();
  }

  ngOnDestroy() {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.clearScanTimers();
  }

  openMenu() {
    this.globalService.openMenu();
  }

  async ionViewDidEnter() {
    if (this.bluetoothService.isDemoActive) {
      this.isConnected.set(true);
      this.deviceName.set('DEMO');
    } else {
      await this.checkConnectionStatus();
    }
  }

  async ionViewDidLeave(): Promise<void> {
    // Guarantee the scan is halted whenever the user leaves this page,
    // regardless of how they leave (back button, tab switch, etc.).
    await this.stopScan();
  }

  private async checkConnectionStatus() {
    try {
      const connected = await this.bluetoothService.isConnected();
      if (connected) {
        const device = await this.bluetoothService.getCurrentDevice();
        if (device) {
          this.isConnected.set(true);
          this.deviceName.set(device.name);
        }
      } else {
        this.isConnected.set(false);
        this.deviceName.set('');
      }
    } catch (error) {
      console.error('Connection check error:', error);
      this.isConnected.set(false);
    }
  }

  async findDevices() {
    console.log('Scanning Started');
    this.devices.set([]);
    this.isScanning.set(true);
    this.clearScanTimers();

    try {
      const permissionsResult = await this.checkAndRequestAllPermissions();

      if (!permissionsResult.success) {
        this.isScanning.set(false);
        if (permissionsResult.errorType === 'bluetooth_disabled') {
          await this.presentBluetoothEnableDialog();
        } else if (permissionsResult.errorType === 'permission_denied') {
          await this.presentPermissionsSettingsDialog(
            permissionsResult.permissionType as string
          );
        } else {
          await this.presentDemoModeDialog();
        }
        return;
      }

      // Start BLE scan
      this.bluetoothService.startDeviceScan();

      // Poll discovered devices every 200ms
      this.scanInterval = setInterval(() => {
        this.devices.set([...this.bluetoothService.discoveredDevices]);
      }, 200);

      // Auto-stop after 30 seconds
      this.scanTimeout = setTimeout(() => this.stopScan(), 30000);
    } catch (error) {
      console.error('Error during device discovery:', error);
      await this.globalService.showToast('Error discovering devices');
      await this.presentDemoModeDialog();
      this.isScanning.set(false);
      this.clearScanTimers();
    }
  }

  private async stopScan() {
    this.clearScanTimers();
    await this.bluetoothService.stopDeviceScan();
    this.isScanning.set(false);
    console.log('BLE scan stopped.');
  }

  private clearScanTimers() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }
  }

  async checkAndRequestAllPermissions(): Promise<{
    success: boolean;
    errorType?: 'bluetooth_disabled' | 'permission_denied' | 'unknown';
    permissionType?: string;
  }> {
    const platform = Capacitor.getPlatform();

    // ── iOS ─────────────────────────────────────────────────────────────────
    // On iOS the system BLE access prompt is shown automatically by Core
    // Bluetooth during BleClient.initialize().  We must NOT call
    // AndroidPermissions here — the plugin is Android-only and will throw.
    if (platform === 'ios') {
      let bluetoothEnabled = false;
      try {
        bluetoothEnabled = (await this.bluetoothService.isEnabled()) || false;
      } catch {
        return { success: false, errorType: 'bluetooth_disabled' };
      }
      return bluetoothEnabled
        ? { success: true }
        : { success: false, errorType: 'bluetooth_disabled' };
    }

    // ── Web (ionic serve) ────────────────────────────────────────────────────
    if (platform === 'web') {
      return { success: true }; // Web BLE handles its own permissions dialog
    }

    // ── Android ─────────────────────────────────────────────────────────────
    let bluetoothEnabled = false;
    try {
      bluetoothEnabled = (await this.bluetoothService.isEnabled()) || false;
    } catch {
      return { success: false, errorType: 'bluetooth_disabled' };
    }

    if (!bluetoothEnabled) {
      return { success: false, errorType: 'bluetooth_disabled' };
    }

    const deviceInfo = await Device.getInfo();
    const sdkVersion = deviceInfo.androidSDKVersion
      ? parseInt(String(deviceInfo.androidSDKVersion), 10)
      : 0;

    // Android 12+ (SDK 31+) requires BLUETOOTH_SCAN + BLUETOOTH_CONNECT.
    if (sdkVersion >= 31) {
      const [connectResult, scanResult] = await Promise.all([
        this.bluetoothService.androidPermissions.checkPermission(
          this.bluetoothService.androidPermissions.PERMISSION.BLUETOOTH_CONNECT
        ),
        this.bluetoothService.androidPermissions.checkPermission(
          this.bluetoothService.androidPermissions.PERMISSION.BLUETOOTH_SCAN
        ),
      ]);

      if (!connectResult.hasPermission || !scanResult.hasPermission) {
        try {
          const [cg, sg] = await Promise.all([
            this.bluetoothService.androidPermissions.requestPermission(
              this.bluetoothService.androidPermissions.PERMISSION
                .BLUETOOTH_CONNECT
            ),
            this.bluetoothService.androidPermissions.requestPermission(
              this.bluetoothService.androidPermissions.PERMISSION.BLUETOOTH_SCAN
            ),
          ]);
          if (!cg.hasPermission || !sg.hasPermission) {
            return {
              success: false,
              errorType: 'permission_denied',
              permissionType: 'Bluetooth',
            };
          }
        } catch {
          return {
            success: false,
            errorType: 'permission_denied',
            permissionType: 'Bluetooth',
          };
        }
      }
    }

    // Android requires fine location for BLE on SDK ≤ 30; on SDK 31+ it is
    // optional but some OEM firmwares still need it — we request it anyway.
    try {
      const locationResult =
        await this.bluetoothService.androidPermissions.checkPermission(
          this.bluetoothService.androidPermissions.PERMISSION
            .ACCESS_FINE_LOCATION
        );
      if (!locationResult.hasPermission) {
        const granted =
          await this.bluetoothService.androidPermissions.requestPermission(
            this.bluetoothService.androidPermissions.PERMISSION
              .ACCESS_FINE_LOCATION
          );
        if (!granted.hasPermission) {
          return {
            success: false,
            errorType: 'permission_denied',
            permissionType: 'Location',
          };
        }
      }
    } catch {
      return {
        success: false,
        errorType: 'permission_denied',
        permissionType: 'Location',
      };
    }

    return { success: true };
  }

  async presentPermissionsSettingsDialog(permissionType: string) {
    const alert = await this.alertController.create({
      header: `${permissionType} Permission Required`,
      message: `This app needs ${permissionType.toLowerCase()} permission to scan for Bluetooth devices.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Use Demo Mode',
          handler: async () => {
            await this.bluetoothService.toggleDemoMode();
            this.navCtrl.navigateRoot('/live-data/dashboard');
          },
        },
      ],
    });
    await alert.present();
  }

  async presentBluetoothEnableDialog() {
    const alert = await this.alertController.create({
      header: 'Bluetooth Required',
      message: 'Please enable Bluetooth to scan for devices.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Enable Bluetooth',
          handler: async () => {
            try {
              await this.bluetoothService.requestBluetoothPermissions();
              this.findDevices();
            } catch {
              await this.globalService.showToast('Could not enable Bluetooth');
              await this.presentDemoModeDialog();
            }
          },
        },
        {
          text: 'Use Demo Mode',
          handler: async () => {
            await this.bluetoothService.toggleDemoMode();
            this.navCtrl.navigateRoot('/live-data/dashboard');
          },
        },
      ],
    });
    await alert.present();
  }

  async presentDemoModeDialog() {
    const alert = await this.alertController.create({
      header: 'Connection Issue',
      message: 'Would you like to use Demo Mode instead?',
      buttons: [
        { text: 'No', role: 'cancel' },
        {
          text: 'Use Demo Mode',
          handler: async () => {
            await this.bluetoothService.toggleDemoMode();
            this.navCtrl.navigateRoot('/live-data/dashboard');
          },
        },
      ],
    });
    await alert.present();
  }

  async connectToDevice(device: any) {
    console.log('Connecting to device:', device);

    // Stop scan before connecting — required on iOS
    await this.stopScan();

    const loading = await this.loadingController.create({
      message: 'Connecting...',
      duration: 10000,
    });
    await loading.present();

    try {
      await this.bluetoothService.connect(device);
      await loading.dismiss();
    } catch (error) {
      await loading.dismiss();
      console.error('Connection error:', error);
      await this.globalService.showToast(
        "Unable to connect to your sensor. Please verify it's turned on and fully charged."
      );
    }
  }

  async disconnectDevice() {
    try {
      if (!this.bluetoothService.isDemoActive) {
        await this.bluetoothService.disconnect();
      } else {
        await this.bluetoothService.stopDemo();
      }
      this.bluetoothService.clearBuffer();
      this.isConnected.set(false);
      this.deviceName.set('');
    } catch (error) {
      console.error('Disconnection error:', error);
      await this.globalService.showToast('Error disconnecting from device');
    }
  }

  async goToConfig() {
    this.globalService.goToConfig();
  }
}
