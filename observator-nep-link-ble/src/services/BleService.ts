import { BleManager, ConnectionPriority, LogLevel, ScanMode, Device, Subscription } from 'react-native-ble-plx';
import base64 from 'base-64';

// Types
interface BleDeviceFound {
  bleDevice: Device;
  key: string;
  timestamp: number;
}

type BluetoothStateFunction = (state: string) => void;
type UpdateFunction = (devices: BleDeviceFound[]) => void;
type OnDeviceConnectedHandler = () => void;
type OnSensorDataReceivedHandler = (data: string) => void;
type OnBatteryDataReceivedHandler = (data: any) => void;
type OnDeviceDisconnectedHandler = () => void;

class BleService {
  private static manager: BleManager;
  private static bleDevicesFound: BleDeviceFound[] = [];
  private static bleDevicesFoundUpdateIntervalId: NodeJS.Timeout | null = null;
  private static subscription: Subscription | null = null;
  private static isScanning: boolean = false;
  private static bluetoothStateFunction: BluetoothStateFunction | null = null;
  private static updateFunction: UpdateFunction | null = null;
  private static connectedDevice: Device | null = null;
  private static readonly serviceIdsArray: string[] = [
    'c25d444c-2836-4cc0-8f2f-95f4c8fd7f8b',
    '86a324aa-4b2f-46c7-b4d8-949cae59e6d7',
  ];

  static init(): void {
    this.bleDevicesFound = [];
    this.bleDevicesFoundUpdateIntervalId = null;
    this.subscription = null;
    this.isScanning = false;
    this.bluetoothStateFunction = null;
    this.updateFunction = null;

    this.manager = new BleManager();

    const onStateChangeSubscription = this.manager.onStateChange((state) => {
      if (state === 'PoweredOn') {
        this.manager
          .connectedDevices(this.serviceIdsArray)
          .then((connectedDevicesArray) => {
            connectedDevicesArray.forEach((device) => {
              device.cancelConnection();
            });

            this.manager.setLogLevel(LogLevel.Verbose);

            if (this.isScanning && this.bluetoothStateFunction && this.updateFunction) {
              this.startScan(this.bluetoothStateFunction, this.updateFunction);
            }
          })
          .catch((error) => {
            console.error('Error initializing BLE manager:', error);
          });

        onStateChangeSubscription.remove();
      }
    }, true);
  }

  static restartBleManager(): void {
    if (this.manager) {
      this.manager.destroy();
    }
    this.init();
  };

  static destroyBleManager(): void {
    if (this.manager) {
      this.manager.destroy();
    }
  }

  static startScan(bluetoothStateFunction: BluetoothStateFunction, updateFunction: UpdateFunction): void {
    console.log("XXX startScan");
    if (this.bleDevicesFoundUpdateIntervalId) {
      clearInterval(this.bleDevicesFoundUpdateIntervalId);
      this.bleDevicesFoundUpdateIntervalId = null;
    }

    this.bluetoothStateFunction = bluetoothStateFunction;
    this.updateFunction = updateFunction;
    this.bleDevicesFound = [];

    const scanFn = (): void => {
      this.manager.startDeviceScan(
        null,
        { allowDuplicates: true, scanMode: ScanMode.LowLatency },
        (error, device) => {
          // if (device?.name?.match(/NEP-LINK/)) {
          //   console.log('NEP-LINK device found:', [device.name, device.id]);
          // }

          if (error) {
            console.error('Scan error:', error);
            return;
          }

          if (!device) return;

          this.isScanning = true;

          // console.log(
          //   'Devices found BEFORE filter:',
          //   this.bleDevicesFound.map(({ bleDevice }) => bleDevice.name)
          // );

          // Filter out devices older than 5 seconds
          const currentTime = new Date().getTime();
          this.bleDevicesFound = this.bleDevicesFound.filter(
            ({ timestamp }) => timestamp > currentTime - 5000
          );

          // console.log(
          //   'Devices found AFTER filter:',
          //   this.bleDevicesFound.map(({ bleDevice }) => bleDevice.name)
          // );

          if (device.name?.match(/NEP-LINK/)) {
            const deviceExists = this.bleDevicesFound.find((o) => o.bleDevice.id === device.id);

            if (!deviceExists) {
              this.bleDevicesFound = [
                ...this.bleDevicesFound,
                {
                  bleDevice: device,
                  key: this.bleDevicesFound.length.toString(),
                  timestamp: currentTime,
                },
              ];
              updateFunction(this.bleDevicesFound);
            }
          }
        }
      );
    };

    // Periodically clean up old devices
    this.bleDevicesFoundUpdateIntervalId = setInterval(() => {
      const currentTime = new Date().getTime();
      this.bleDevicesFound = this.bleDevicesFound.filter(
        ({ timestamp }) => timestamp > currentTime - 5000
      );
      updateFunction(this.bleDevicesFound);
    }, 10000);

    this.subscription = this.manager.onStateChange((state) => {
      console.log('Bluetooth state:', state);
      bluetoothStateFunction(state);
      if (state === 'PoweredOn') {
        scanFn();
      }
    }, true);
  }

  static stopScan(): void {
    console.log("XXX stopScan");
    this.isScanning = false;
    //this.bleDevicesFound = [];

    if (this.bleDevicesFoundUpdateIntervalId) {
      clearInterval(this.bleDevicesFoundUpdateIntervalId);
      this.bleDevicesFoundUpdateIntervalId = null;
    }

    // Add this: Remove the state change subscription
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }

    if (!this.manager) return;

    this.manager.stopDeviceScan();
  }

  static async isBluetoothEnabled(): Promise<boolean> {
    if (!this.manager) {
      return false;
    }

    const state = await this.manager.state();
    // Include 'Unsupported' for iOS simulator testing
    return ['PoweredOn', 'Unsupported'].includes(state);
  }

  // Add state change listener method
  static onStateChange(callback: (state: string) => void): Subscription | null {
    if (!this.manager) {
      return null;
    }

    return this.manager.onStateChange((state) => {
      callback(state);
    }, true);
  }

  static connectAndListen(
    device: Device,
    onDeviceConnectedHandler: OnDeviceConnectedHandler,
    onSensorDataReceivedHandler: OnSensorDataReceivedHandler,
    onBatteryDataReceivedHandler: OnBatteryDataReceivedHandler,
    onDeviceDisconnectedHandler?: OnDeviceDisconnectedHandler
  ): void {
    console.log('Connecting to device:', device);

    const connectedDiscoveredAction = (): void => {
      // Monitor battery characteristic
      device.monitorCharacteristicForService(
        '86a324aa-4b2f-46c7-b4d8-949cae59e6d7',
        '266b64b4-19ee-4941-8253-650b4d7ab197',
        (error, characteristic) => {
          if (characteristic && characteristic.value) {
            // this.stopScan();
            const batteryResponseJsonStr = base64.decode(characteristic.value);
            try {
              const batteryDataObj = JSON.parse(batteryResponseJsonStr);
              onBatteryDataReceivedHandler(batteryDataObj);
            } catch (e) {
              console.error('Error parsing battery data:', e);
            }
          }
        }
      );

      // Monitor sensor characteristic
      device.monitorCharacteristicForService(
        'c25d444c-2836-4cc0-8f2f-95f4c8fd7f8b',
        '9915b449-2b52-429b-bfd0-ab634002404d',
        (error, characteristic) => {
          if (characteristic && characteristic.value) {
            //this.stopScan();
            const responseStr = base64.decode(characteristic.value);
            try {
              onSensorDataReceivedHandler(responseStr);
            } catch (e) {
              console.error('Error parsing sensor data:', e);
            }
          }
        }
      );

      this.connectedDevice = device;
    };

    // Set up disconnect handler
    this.manager.onDeviceDisconnected(device.id, (error, device) => {
      if (onDeviceDisconnectedHandler) {
        onDeviceDisconnectedHandler();
      } else {
        console.error('onDeviceDisconnectedHandler is undefined');
      }
    });

    // Check if already connected
    this.manager
      .isDeviceConnected(device.id)
      .then((isConnected) => {
        console.log('Device connected status:', isConnected);

        if (isConnected) {
          connectedDiscoveredAction();
        } else {
          // Connect to device
          this.manager
            .connectToDevice(device.id, { timeout: 15000, autoConnect: true, requestMTU: 200 })
            .then((connectedDevice) => {
              onDeviceConnectedHandler();
              console.log('Connected, requesting high priority connection...');

              return this.manager.requestConnectionPriorityForDevice(
                connectedDevice.id,
                ConnectionPriority.High
              );
            })
            .then((device) => {
              console.log('High priority set, discovering services...');
              return device.discoverAllServicesAndCharacteristics();
            })
            .then((device) => {
              connectedDiscoveredAction();
            })
            .catch((error) => {
              console.error('Error connecting to device:', error);
            });
        }
      })
      .catch((error) => {
        console.error('Error checking device connection:', error);
      });
  }

  static disconnectConnectedDevice(): void {
    console.log("XXX disconnectConnectedDevice");
    if (this.manager) {
      this.manager
        .connectedDevices(this.serviceIdsArray)
        .then((devices) => {
          console.log('XXX Disconnecting connected devices:', devices);
          devices.forEach((device) => {
            console.log("XXX device disconnecting",device);
            device.cancelConnection();
          });
        })
        .catch((error) => {
          console.error('Error disconnecting devices:', error);
        });
      }

    if (this.connectedDevice) {
      this.connectedDevice.cancelConnection();
      this.connectedDevice = null;
    }
  }

  static disconnectConnectedRestartBle(): void {
    this.restartBleManager();
  }

  static stopScanningDisconnectConnectedDestroyBleManager(): void {
    this.stopScan();

    if (!this.manager) return;

    if (this.subscription) {
      this.subscription.remove();
    }

    this.manager
      .connectedDevices(this.serviceIdsArray)
      .then((connectedDevicesArray) => {
        connectedDevicesArray.forEach((device) => {
          device.cancelConnection();
        });
        this.manager.destroy();
      })
      .catch((error) => {
        console.error('Error cleaning up BLE manager:', error);
      });
  }
}

export default BleService;
