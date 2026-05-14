import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Platform, AlertController, ToastController } from '@ionic/angular';
import { BehaviorSubject, Subject, Observable, Subscription } from 'rxjs';
import { takeUntil, filter } from 'rxjs/operators';
import { Preferences } from '@capacitor/preferences';
import {
  BleClient,
  BleDevice,
  numbersToDataView,
  dataViewToNumbers,
} from '@capacitor-community/bluetooth-le';
import { Camera, CameraResultType } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { SqliteService } from './sqlite.service';
import * as moment from 'moment';
import { Toast } from '@capacitor/toast';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { AndroidPermissions } from '@awesome-cordova-plugins/android-permissions/ngx';
import { Router } from '@angular/router';
import { NavController } from '@ionic/angular';

interface DataItem {
  Index: number;
  EnShow: number;
  EnLogging: number;
  NMEA: string;
  Type: string;
  Data: any;
  Unit: string;
  Desc: string;
  LogVal: number;
}

interface WindData {
  dirRel: number[];
  dirTru: number[];
  speedRel: number[];
  speedTru: number[];
}

interface DemoOffsets {
  relWindSpeed: number;
  relWindDir: number;
  truWindSpeed: number;
  truWindDir: number;
  temp: number;
  humi: number;
  press: number;
}

interface BluetoothDevice {
  deviceId: string;
  name: string;
  address?: string;
}

interface ConnectionState {
  isConnected: boolean;
  currentDevice: BluetoothDevice | null;
}

interface LogData {
  headerSentence: string;
  logSentence: string;
}

@Injectable({
  providedIn: 'root',
})
export class BluetoothService implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private bluetoothSubscription?: Subscription;
  recordingTimer?: any;
  demoTimer?: any;
  private connectionStateSubject = new BehaviorSubject<ConnectionState>({
    isConnected: false,
    currentDevice: null,
  });
  public connectionState$ = this.connectionStateSubject.asObservable();

  // BLE specific properties
  private connectedDevice?: BleDevice;
  private readonly SENSOR_DATA_SERVICE_UUID =
    'c25d444c-2836-4cc0-8f2f-95f4c8fd7f8b';
  private readonly SENSOR_DATA_CHARACTERISTIC_UUID =
    '9915b449-2b52-429b-bfd0-ab634002404d';
  private readonly METADATA_SERVICE_UUID =
    '86a324aa-4b2f-46c7-b4d8-949cae59e6d7';
  private readonly METADATA_CHARACTERISTIC_UUID =
    '266b64b4-19ee-4941-8253-650b4d7ab197';
  private dataBuffer = '';
  public discoveredDevices: BleDevice[] = [];

  // BehaviorSubjects for reactive state management
  private dataItemsSubject = new BehaviorSubject<DataItem[]>([]);
  loggingActiveSubject = new BehaviorSubject<boolean>(false);
  batteryStatusSubject = new BehaviorSubject<{
    charging: boolean;
    capacity: string;
  }>({ charging: false, capacity: '' });

  // Public Observables
  public dataItems$ = this.dataItemsSubject.asObservable();
  public loggingActive$ = this.loggingActiveSubject.asObservable();
  public batteryStatus$ = this.batteryStatusSubject.asObservable();
  private dataUpdatedSubject = new Subject<void>();
  dataUpdated$ = this.dataUpdatedSubject.asObservable();

  // Wind Data Properties
  private windData: WindData = {
    dirRel: new Array(600).fill(0),
    dirTru: new Array(600).fill(0),
    speedRel: new Array(600).fill(0),
    speedTru: new Array(600).fill(0),
  };

  // State Properties
  public dataItems: DataItem[] = [];
  public dataItemsAvailable = false;
  public defaultLogging: any[] = [];
  public defaultEnable: any[] = [];
  public recIsVisible = false;
  public currentLogId: any;
  public device = 'MET-LINK';
  public firstTimeLogging = true;
  public insertPicture = false;
  public theme = 'primary';
  public allData: string[] = [];
  public allDataCounter = 0;
  public enableAllData = false;
  public isDemoActive = false;
  public pauseData = false;

  public loggingActive: boolean = false;
  private logDataInProgress = false;
  public recSeconds: number = 0;
  public recMinutes: number = 0;
  public recHours: number = 0;
  public mwv10MinDirRel: number[] = [];
  public mwv10MinDirTru: number[] = [];
  public mwv10MinSpeedRel: number[] = [];
  public mwv10MinSpeedTru: number[] = [];
  public battCharging: boolean = false;
  public battCapacity: string = '';
  public statsReceived: boolean = false;

  // Recording State
  recordingState = {
    hours: 0,
    minutes: 0,
    seconds: 0,
  };

  // Graph Related
  public newGraphData = false;
  public graphDataItem = 0;
  public graphData: any[] = [];
  public graphActive = false;
  public graphDataChanged = true;

  // GPS Related
  public phoneLatitude: any;
  public phoneLongitude: any;
  public newGpsData: boolean = false;

  // QNH QFE Related
  public newWindData: boolean = false;
  public QqEnabled = false;
  public QqGpsHeight = false;
  public QqHeight: number = 0;
  public QfeHeight: number = 0;
  public QnhHeight: number = 0;
  public DpEnabled = false;

  // Dew Point
  natLog = [
    -5.2983, -4.1997, -3.6889, -3.3524, -3.1011, -2.9004, -2.7334, -2.5903,
    -2.4651, -2.3539, -2.2538, -2.1628, -2.0794, -2.0025, -1.931, -1.8643,
    -1.8018, -1.743, -1.6874, -1.6348, -1.5847, -1.5371, -1.4917, -1.4482,
    -1.4065, -1.3665, -1.328, -1.291, -1.2553, -1.2208, -1.1874, -1.1552,
    -1.1239, -1.0936, -1.0642, -1.0356, -1.0079, -0.9808, -0.9545, -0.9289,
    -0.9039, -0.8795, -0.8557, -0.8324, -0.8097, -0.7875, -0.7657, -0.7444,
    -0.7236, -0.7032, -0.6832, -0.6636, -0.6444, -0.6255, -0.607, -0.5888,
    -0.5709, -0.5534, -0.5361, -0.5192, -0.5025, -0.4861, -0.47, -0.4541,
    -0.4385, -0.4231, -0.408, -0.393, -0.3783, -0.3638, -0.3496, -0.3355,
    -0.3216, -0.3079, -0.2944, -0.281, -0.2679, -0.2549, -0.2421, -0.2294,
    -0.2169, -0.2046, -0.1924, -0.1803, -0.1684, -0.1567, -0.145, -0.1335,
    -0.1222, -0.1109, -0.0998, -0.0888, -0.078, -0.0672, -0.0566, -0.046,
    -0.0356, -0.0253, -0.0151, -0.005,
  ];
  DpHum: boolean = false;
  DpTemp: boolean = false;

  constructor(
    private platform: Platform,
    private ngZone: NgZone,
    private sqliteService: SqliteService,
    private alertCtrl: AlertController,
    public androidPermissions: AndroidPermissions,
    private router: Router,
    private navCtrl: NavController
  ) {
    this.initializeService();
    this.initCalcSettings();
  }
  ngOnDestroy() {
    this.cleanup();
  }

  // Improve demo mode initialization in initializeService method
  private async initializeService() {
    await this.platform.ready();
    await this.initData();

    // Check for saved demo mode preference
    const demoMode = await this.getPreference('demoMode');
    this.isDemoActive = demoMode === 'true';

    if (this.isDemoActive) {
      // Start demo mode immediately if it was enabled before
      this.startDemo();
    } else {
      // Otherwise try to set up Bluetooth
      this.setupBleDataSubscription();
    }

    this.startRecordingTimer();

    // Initialize arrays for wind data
    this.mwv10MinDirRel = new Array(600).fill(0);
    this.mwv10MinDirTru = new Array(600).fill(0);
    this.mwv10MinSpeedRel = new Array(600).fill(0);
    this.mwv10MinSpeedTru = new Array(600).fill(0);
  }

  private async initializeBle(): Promise<void> {
    try {
      // On Android we skip using location for BLE. On iOS this option is not
      // recognised and must be omitted — passing it causes a native error.
      if (Capacitor.getPlatform() === 'android') {
        await BleClient.initialize({ androidNeverForLocation: false });
      } else {
        await BleClient.initialize();
      }
      console.log('BLE Client initialized successfully');
    } catch (error) {
      console.error('BLE initialization error:', error);
    }
  }

  public async isEnabled() {
    try {
      await this.initializeBle();
      let enabled = await BleClient.isEnabled();
      const enabledRet = enabled ? true : false;
      console.log('BLE Client Enabled', enabled);
      return enabledRet;
    } catch (error) {
      console.error('isEnabled error:', error);
      return false;
    }
  }

  private async loadGraphSettings() {
    const graphItem = await this.getPreference('graphItem');
    this.graphDataItem = graphItem ? Number(graphItem) : 0;

    const graphActive = await this.getPreference('graphicalType');
    this.graphActive = graphActive === 'true' || false;
  }

  private async initData() {
    try {
      const [enShow, enLog] = await Promise.all([
        Preferences.get({ key: 'EnShow' }),
        Preferences.get({ key: 'EnLog' }),
      ]);

      if (enShow.value) this.defaultEnable = JSON.parse(enShow.value);
      if (enLog.value) this.defaultLogging = JSON.parse(enLog.value);
    } catch (error) {
      console.error('Error initializing data:', error);
    }
  }

  // BLE Data handling
  private setupBleDataSubscription() {
    if (!this.connectedDevice) return;

    // Request HIGH connection priority for ~15ms intervals (vs default 25–50ms)
    BleClient.requestConnectionPriority(this.connectedDevice.deviceId, 1)
      .then(() => console.log('Connection priority set to HIGH'))
      .catch((e: any) =>
        console.warn('Connection priority request failed (non-critical):', e)
      );

    BleClient.startNotifications(
      this.connectedDevice.deviceId,
      this.SENSOR_DATA_SERVICE_UUID,
      this.SENSOR_DATA_CHARACTERISTIC_UUID,
      (value) => {
        this.ngZone.run(() => {
          const data = new TextDecoder().decode(value);
          this.processIncomingData(data);
        });
      }
    ).catch((error) => {
      console.error('Error setting up BLE notifications:', error);
    });
    BleClient.startNotifications(
      this.connectedDevice.deviceId,
      this.METADATA_SERVICE_UUID,
      this.METADATA_CHARACTERISTIC_UUID,
      (value) => {
        const data = new TextDecoder().decode(value);
        this.processMetaData(data);
      }
    ).catch((error) => {
      console.error('Error setting up BLE notifications:', error);
    });
  }

  private processIncomingData(data: string) {
    if (this.pauseData) return;

    // Add data to buffer
    this.dataBuffer += data;

    // Process complete lines (ending with \n)
    const lines = this.dataBuffer.split('\n');
    this.dataBuffer = lines.pop() || ''; // Keep incomplete line in buffer

    lines.forEach((line) => {
      if (line.trim()) {
        this.handleBluetoothData(line + '\n');
      }
    });
  }

  private processMetaData(data: string): void {
    if (this.pauseData) return;

    try {
      const metaDataJson = JSON.parse(data);
      const battCharging = metaDataJson['isCharging'] === 1;
      const battCapacity = `${parseInt(metaDataJson['percentage'], 10)} %`;

      this.battCharging = battCharging;
      this.battCapacity = battCapacity;
      this.statsReceived = true;

      // Persist device metadata via Capacitor Preferences (survives reinstall on iOS,
      // and never touches localStorage which is wiped on some Android configurations).
      const serialNo: string = metaDataJson['serialNo'] || '';
      const firmwareVersion: string = metaDataJson['firmwareVersion'] || '';

      Promise.all([
        this.setPreference('bleModuleSerialNo', serialNo),
        this.setPreference('bleModuleFirmwareVersion', firmwareVersion),
      ]).catch((e) => console.warn('Failed to persist device metadata:', e));
    } catch (error) {
      console.warn('processMetaData: failed to parse metadata JSON', error);
    }
  }

  /**
   * Start BLE scan. Populates `discoveredDevices` with any device whose name
   * begins with "MET-LINK" (case-insensitive). On iOS `allowDuplicates` is
   * disabled to prevent excessive callbacks draining the battery.
   */
  async startDeviceScan(): Promise<void> {
    this.discoveredDevices = [];
    const isIos = Capacitor.getPlatform() === 'ios';

    try {
      await BleClient.requestLEScan({ allowDuplicates: !isIos }, (result) => {
        const name = (result.device.name || '').toLowerCase();
        const alreadyFound = this.discoveredDevices.some(
          (d) => d.deviceId === result.device.deviceId
        );
        if (name.startsWith('met-link') && !alreadyFound) {
          this.discoveredDevices.push(result.device);
        }
      });
    } catch (error) {
      console.error('Error starting BLE scan:', error);
      throw error; // Let DevicesPage handle the error and show the user a dialog
    }
  }

  async stopDeviceScan(): Promise<BleDevice[]> {
    try {
      await BleClient.stopLEScan();
      return this.discoveredDevices;
    } catch (error) {
      console.error('Error stopping BLE scan:', error);
      return this.discoveredDevices;
    }
  }

  // Enhanced demo data generation
  startDemo() {
    if (this.demoTimer) {
      clearInterval(this.demoTimer);
    }

    console.log('Starting demo mode');
    this.isDemoActive = true;

    let relWindSpeedOffset = 0;
    let relWindDirOffset = 0;
    let truWindSpeedOffset = 0;
    let truWindDirOffset = 0;
    let xdrTempOffset = 0;
    let xdrHumiOffset = 0;
    let xdrPressOffset = 0;
    let periodCounter = 59;

    // Initial values
    relWindSpeedOffset = Math.floor(Math.random() * 30);
    relWindDirOffset = Math.floor(Math.random() * 340);
    truWindSpeedOffset = Math.floor(Math.random() * 30);
    truWindDirOffset = Math.floor(Math.random() * 340);
    xdrTempOffset = Math.floor(Math.random() * 30);
    xdrHumiOffset = Math.floor(Math.random() * 50) + 30;
    xdrPressOffset = Math.floor(Math.random() * 100) + 1000;

    // Initial set of data to populate instantly
    this.generateDemoData({
      relWindSpeed: relWindSpeedOffset,
      relWindDir: relWindDirOffset,
      truWindSpeed: truWindSpeedOffset,
      truWindDir: truWindDirOffset,
      temp: xdrTempOffset,
      humi: xdrHumiOffset,
      press: xdrPressOffset,
    });

    // Also add some GPS data
    this.phoneLatitude = (Math.random() * 180 - 90).toFixed(6);
    this.phoneLongitude = (Math.random() * 360 - 180).toFixed(6);

    const ggaData = `$GPGGA,123519,${Math.abs(this.phoneLatitude)},${
      this.phoneLatitude >= 0 ? 'N' : 'S'
    },${Math.abs(this.phoneLongitude)},${
      this.phoneLongitude >= 0 ? 'E' : 'W'
    },1,08,0.9,545.4,M,46.9,M,,*47\r\n`;
    this.handleBluetoothData(ggaData);

    // Set battery status for demo
    this.battCharging = Math.random() > 0.5;
    this.battCapacity = `${Math.floor(Math.random() * 25) + 75} %`;
    this.statsReceived = true;

    this.demoTimer = setInterval(() => {
      // Wrap inside ngZone.run() so Angular's change detection fires on every tick
      this.ngZone.run(() => {
        if (this.isDemoActive && !this.pauseData) {
          // Generate demo data
          const demoData0 = this.demoMwv(
            relWindSpeedOffset,
            relWindDirOffset,
            'R'
          );
          this.handleBluetoothData(demoData0);

          const demoData1 = this.demoMwv(
            truWindSpeedOffset,
            truWindDirOffset,
            'T'
          );
          this.handleBluetoothData(demoData1);

          const demoData2 = this.demoXdr(
            xdrTempOffset,
            xdrHumiOffset,
            xdrPressOffset
          );
          this.handleBluetoothData(demoData2);

          // Update offsets every minute
          periodCounter++;
          if (periodCounter >= 60) {
            periodCounter = 0;

            // Add some variability to make data more realistic
            relWindSpeedOffset = Math.floor(Math.random() * 30);
            relWindDirOffset = Math.floor(Math.random() * 340);
            truWindSpeedOffset = Math.floor(Math.random() * 30);
            truWindDirOffset = Math.floor(Math.random() * 340);
            xdrTempOffset = Math.floor(Math.random() * 30);
            xdrHumiOffset = Math.floor(Math.random() * 50) + 30;
            xdrPressOffset = Math.floor(Math.random() * 100) + 1000;

            // Occasionally update GPS in demo mode
            if (Math.random() > 0.7) {
              this.phoneLatitude = (
                parseFloat(this.phoneLatitude) +
                (Math.random() * 0.001 - 0.0005)
              ).toFixed(6);
              this.phoneLongitude = (
                parseFloat(this.phoneLongitude) +
                (Math.random() * 0.001 - 0.0005)
              ).toFixed(6);

              const ggaData = `$GPGGA,${Math.floor(
                Math.random() * 240000
              )},${Math.abs(this.phoneLatitude)},${
                this.phoneLatitude >= 0 ? 'N' : 'S'
              },${Math.abs(this.phoneLongitude)},${
                this.phoneLongitude >= 0 ? 'E' : 'W'
              },1,${
                Math.floor(Math.random() * 12) + 4
              },0.9,545.4,M,46.9,M,,*47\r\n`;
              this.handleBluetoothData(ggaData);
            }

            // Update battery status periodically
            if (Math.random() > 0.8) {
              this.battCharging = Math.random() > 0.5;
              const currentCapacity = parseInt(this.battCapacity);
              this.battCapacity = `${Math.min(
                100,
                Math.max(1, currentCapacity + (this.battCharging ? 1 : -1))
              )} %`;
            }
          }
        }
      });
    }, 1000);
  }
  generateDemoData(offsets: DemoOffsets) {
    const relativeData = this.demoMwv(
      offsets.relWindSpeed,
      offsets.relWindDir,
      'R'
    );
    const trueData = this.demoMwv(
      offsets.truWindSpeed,
      offsets.truWindDir,
      'T'
    );
    const xdrData = this.demoXdr(offsets.temp, offsets.humi, offsets.press);

    [relativeData, trueData, xdrData].forEach((data) =>
      this.handleBluetoothData(data)
    );
  }

  startRecordingTimer() {
    this.recordingTimer = setInterval(() => {
      if (this.loggingActive) {
        this.recIsVisible = !this.recIsVisible;
        this.updateRecordingTime();

        // Fire-and-forget: don't await logData so the 1-second timer
        // never drifts because of slow SQLite writes.
        if (!this.logDataInProgress) {
          this.logDataInProgress = true;
          this.logData()
            .catch((err) => console.error('logData error:', err))
            .finally(() => (this.logDataInProgress = false));
        }
      } else {
        this.resetRecordingState();
      }
    }, 1000);
  }

  updateRecordingTime() {
    this.recSeconds++;
    if (this.recSeconds >= 60) {
      this.recSeconds = 0;
      this.recMinutes++;
      if (this.recMinutes >= 60) {
        this.recMinutes = 0;
        this.recHours++;
        if (this.recHours >= 60) {
          this.recHours = 0;
        }
      }
    }
  }

  resetRecordingState() {
    this.firstTimeLogging = true;
    this.recIsVisible = false;
    this.recHours = 0;
    this.recMinutes = 0;
    this.recSeconds = 0;
  }

  async logData() {
    if (!this.loggingActive) return;

    try {
      const lastRecordId = await this.sqliteService.selectLastIDRecord();

      if (this.firstTimeLogging) {
        let headerSentence = '';
        this.firstTimeLogging = false;

        for (let i = 0; i < this.dataItems.length; i++) {
          if (
            this.dataItems[i].EnShow == 1 &&
            this.dataItems[i].EnLogging == 1
          ) {
            if (headerSentence != '') {
              headerSentence =
                headerSentence +
                ',' +
                this.dataItems[i].Type +
                ',Unit,Description';
            } else {
              headerSentence = this.dataItems[i].Type + ',Unit,Description';
            }
          }
        }
        headerSentence = headerSentence + ',Latitude phone,Longitude phone';

        await this.sqliteService.insertMeasure(
          headerSentence,
          this.getDateStamp(),
          lastRecordId
        );
      }

      let logSentence = '';
      for (let i = 0; i < this.dataItems.length; i++) {
        if (this.dataItems[i].EnShow == 1 && this.dataItems[i].EnLogging == 1) {
          if (logSentence != '') {
            logSentence =
              logSentence +
              ',' +
              this.dataItems[i].Data +
              ',' +
              this.dataItems[i].Unit +
              ',' +
              this.dataItems[i].Desc;
          } else {
            logSentence =
              this.dataItems[i].Data +
              ',' +
              this.dataItems[i].Unit +
              ',' +
              this.dataItems[i].Desc;
          }
        }
      }
      logSentence =
        logSentence + ',' + this.phoneLatitude + ',' + this.phoneLongitude;

      await this.sqliteService.insertMeasure(
        logSentence,
        this.getDateStamp(),
        lastRecordId
      );
    } catch (error) {
      console.error('Error in logData:', error);
    }
  }

  handleBluetooth(data: string) {
    if (!this.isDemoActive) {
      this.handleBluetoothData(data);
    }
  }

  handleBluetoothData(data: string) {
    if (!this.pauseData) {
      if (this.enableAllData) {
        this.ngZone.run(() => {
          this.terminalData(data);
        });
      } else {
        this.allDataCounter = 0;
        if (data.indexOf('$') !== -1) {
          if (this.isNmeaValid(data)) {
            this.ngZone.run(() => {
              this.handleNMEA(data);
            });
          }
        } else if (data.indexOf('~,') !== -1) {
          this.handleStats(data);
        }
      }
    }
  }

  handleStats(BlueData: string) {
    this.statsReceived = true;
    const data = BlueData.split('\n');
    const line = data[0].split(',');

    if (line[2] && this.isNumber(line[2])) {
      this.battCapacity = Number(line[2]) > 100 ? ' 100 %' : ` ${line[2]} %`;
    }

    if (line[3]) {
      this.battCharging = line[3][0] === '1';
    }
  }

  isNumber(n: any): boolean {
    return !isNaN(parseFloat(n)) && isFinite(n);
  }

  handleNMEA(data: string) {
    const nmea = data.split('\n');
    const nmeaFields = nmea[0].split(',');

    // Remove checksum
    nmeaFields[nmeaFields.length - 1] = nmeaFields[
      nmeaFields.length - 1
    ].substr(0, nmeaFields[nmeaFields.length - 1].length - 4);

    const messageType = nmeaFields[0].substr(3, 3);

    switch (messageType) {
      case 'MWV':
        this.NmeaMWV(nmeaFields);
        break;
      case 'XDR':
        this.NmeaXDR(nmeaFields);
        break;
      case 'GGA':
        this.NmeaGGA(nmeaFields);
        break;
    }
  }

  // NMEA Handlers
  NmeaMWV(MwvString: string[]) {
    if (MwvString[5] !== 'A') return;

    let unit = '';
    switch (MwvString[4]) {
      case 'K':
        unit = 'km/h';
        break;
      case 'M':
        unit = 'm/s';
        break;
      case 'N':
        unit = 'knots';
        break;
    }

    const desc = MwvString[2] === 'T' ? 'true' : 'relative';

    if (MwvString[2] === 'T') {
      this.storeWindPeriod(MwvString[1], 'dirTru');
      this.storeWindPeriod(MwvString[3], 'speedTru');
    } else {
      this.storeWindPeriod(MwvString[1], 'dirRel');
      this.storeWindPeriod(MwvString[3], 'speedRel');
    }

    this.saveDataItem(1, 'MWV', 'Wind speed', MwvString[3], unit, desc);
    this.saveDataItem(1, 'MWV', 'Wind direction', MwvString[1], '°', desc);

    // Trigger wind rose update
    const windRoseOrient = localStorage.getItem('windRoseOrient') || 'true';
    if (windRoseOrient === desc) {
      this.newWindData = true;
    }
  }

  NmeaXDR(XdrString: string[]) {
    for (let i = 0; i < XdrString.length - 2; i += 4) {
      let type = '';
      let unit = XdrString[i + 3];

      switch (XdrString[i + 1]) {
        case 'P':
          type = 'Pressure';
          break;
        case 'A':
          type = 'Current';
          break;
        case 'V':
          type = 'Voltage';
          break;
        case 'Y':
          type = 'Precipitation';
          unit = 'mm';
          break;
        case 'Z':
          type = 'Solar';
          unit = 'W/M²';
          break;
        case 'H':
          type = 'Humidity';
          if (XdrString[i + 3] === 'P') {
            this.DpHum = true;
            unit = '%';
          }
          break;
        case 'C':
          type = 'Temperature';
          if (XdrString[i + 3] === 'C') {
            this.DpTemp = true;
            unit = '°C';
          }
          break;
      }

      this.saveDataItem(
        1,
        'XDR',
        type,
        XdrString[i + 2],
        unit,
        XdrString[i + 4]
      );

      if (this.QqEnabled && XdrString[i + 1] === 'P') {
        this.handleQq(+XdrString[i + 2]);
      }

      if (
        this.DpEnabled &&
        this.DpHum &&
        this.DpTemp &&
        (XdrString[i + 1] === 'H' || XdrString[i + 1] === 'C')
      ) {
        this.handleDewPoint();
      }
    }
  }

  NmeaGGA(GgaString: string[]) {
    const gpsData = [
      { field: 1, type: 'UTC of position', unit: '', desc: 'UTC' },
      { field: 2, type: 'latitude', unit: GgaString[3], desc: 'LAT' },
      { field: 4, type: 'longitude', unit: GgaString[5], desc: 'LON' },
      { field: 6, type: 'GPS quality', unit: '', desc: 'Quality' },
      { field: 7, type: 'Satellites', unit: '', desc: 'NUM' },
      { field: 8, type: 'HOR dilution', unit: '', desc: 'DIL' },
      { field: 9, type: 'GPS height', unit: GgaString[10], desc: 'GEOID' },
      { field: 11, type: 'Satellites', unit: GgaString[12], desc: 'GEOIDAL' },
      { field: 13, type: 'last update', unit: 'sec', desc: 'UPD' },
      { field: 14, type: 'Diff ref station', unit: '', desc: 'DIFF' },
    ];

    gpsData.forEach((item) => {
      if (GgaString[item.field]) {
        this.saveDataItem(
          0,
          'GGA',
          item.type,
          GgaString[item.field],
          item.unit,
          item.desc
        );
      }
    });

    // Trigger GPS data update
    this.newGpsData = true;
  }

  // Data Storage Methods
  saveDataItem(
    ItemDisabled: number,
    NMEA_ID: string,
    Type: string,
    Data: any,
    Unit: string,
    Description: string
  ) {
    const dataItemCNT = this.searchDataItemFull(
      NMEA_ID,
      Type,
      Unit,
      Description
    );

    if (!this.dataItems[dataItemCNT]) {
      let defaultShow = ItemDisabled;
      const defOff = this.searchFunction(
        this.defaultEnable,
        NMEA_ID,
        Type,
        Unit,
        Description
      );

      if (this.defaultEnable[defOff]) {
        defaultShow = this.defaultEnable[defOff].EnShow;
      }

      let EnLogging = 1;
      const defLog = this.searchFunction(
        this.defaultLogging,
        NMEA_ID,
        Type,
        Unit,
        Description
      );

      if (this.defaultLogging[defLog]) {
        EnLogging = this.defaultLogging[defLog].EnLogging;
      }

      if (this.loggingActive) {
        EnLogging = 0;
      }

      this.dataItems[dataItemCNT] = {
        Index: this.dataItems.length,
        EnShow: defaultShow,
        EnLogging: EnLogging,
        NMEA: NMEA_ID,
        Type: Type,
        Data: Data,
        Unit: Unit,
        Desc: Description,
        LogVal: 0,
      };
    } else {
      Object.assign(this.dataItems[dataItemCNT], {
        NMEA: NMEA_ID,
        Type: Type,
        Data: Data,
        Unit: Unit,
        Desc: Description,
      });
    }

    this.dataItemsAvailable = true;
    if (this.graphDataItem === dataItemCNT) {
      this.newGraphData = true;
    }
  }

  // Search Methods
  searchDataItemFull(
    SearchForNMEA: string,
    SearchForType: string,
    SearchForUnit: string,
    SearchForDesc: string
  ): number {
    return this.searchFunction(
      this.dataItems,
      SearchForNMEA,
      SearchForType,
      SearchForUnit,
      SearchForDesc
    );
  }

  searchFunction(
    DataArray: any[],
    SearchForNMEA: string,
    SearchForType: string,
    SearchForUnit: string,
    SearchForDesc: string
  ): number {
    for (let i = 0; i < DataArray.length; i++) {
      if (DataArray[i].NMEA === SearchForNMEA) {
        if (!SearchForType || DataArray[i].Type === SearchForType) {
          if (!SearchForUnit || DataArray[i].Unit === SearchForUnit) {
            if (DataArray[i].Desc === SearchForDesc) {
              return i;
            }
          }
        }
      }
    }
    return DataArray.length;
  }

  // NMEA Validation
  isNmeaValid(data: string): boolean {
    const nmea = data.split('\n')[0];

    if (nmea[0] !== '$' || nmea[6] !== ',' || nmea[nmea.length - 4] !== '*') {
      return false;
    }

    let checksum = 0;
    for (let i = 1; i < nmea.length && nmea[i] !== '*'; i++) {
      checksum ^= nmea.charCodeAt(i);
    }

    const providedChecksum = parseInt(nmea.substr(nmea.length - 3, 2), 16);
    return checksum === providedChecksum;
  }

  // BLE Connection methods
  async isConnected(): Promise<boolean> {
    return this.connectionStateSubject.value.isConnected;
  }

  async getCurrentDevice(): Promise<BluetoothDevice | null> {
    try {
      const deviceStr = await this.getPreference('DeviceObj');
      return deviceStr ? JSON.parse(deviceStr) : null;
    } catch {
      return null;
    }
  }

  async listPairedDevices(): Promise<BleDevice[]> {
    try {
      // BLE doesn't have a "paired devices" concept like classic Bluetooth
      // Return empty array as BLE discovery is done differently
      return [];
    } catch (error) {
      console.error('Error listing devices:', error);
      return [];
    }
  }

  async scanUnpairedDevices(): Promise<BleDevice[]> {
    try {
      await BleClient.requestLEScan(
        {
          // You can specify service UUIDs here if you know them
          // services: [this.SENSOR_DATA_SERVICE_UUID]
        },
        (result) => {
          console.log('Device found:', result);
        }
      );

      // Scan for 10 seconds
      await new Promise((resolve) => setTimeout(resolve, 10000));

      await BleClient.stopLEScan();

      // Note: The actual discovered devices are handled in the callback above
      // You'll need to collect them in an array during scanning
      return [];
    } catch (error) {
      console.error('Error scanning for devices:', error);
      return [];
    }
  }

  /**
   * Connect with automatic retry (up to maxRetries attempts, 1.5s apart).
   * Also registers a disconnect listener so the app reconnects on surprise drops.
   */
  async connect(
    device: BluetoothDevice,
    maxRetries: number = 3
  ): Promise<void> {
    let lastError: any;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `Connecting to BLE device (attempt ${attempt}/${maxRetries}):`,
          device.deviceId
        );

        await BleClient.connect(device.deviceId, (deviceId) => {
          // Unexpected disconnect callback
          console.warn('Device disconnected unexpectedly:', deviceId);
          this.ngZone.run(() => {
            this.connectionStateSubject.next({
              isConnected: false,
              currentDevice: null,
            });
            this.connectedDevice = undefined;
          });
        });

        // Store the connected device
        this.connectedDevice = { deviceId: device.deviceId, name: device.name };

        console.log('Connected successfully on attempt', attempt);

        // Save device info
        await this.setPreference('DeviceObj', JSON.stringify(device));

        // Update connection state
        this.connectionStateSubject.next({
          isConnected: true,
          currentDevice: device,
        });

        // Setup data subscription (MTU + priority requests happen inside)
        this.setupBleDataSubscription();

        this.navCtrl.navigateRoot('/live-data/dashboard');

        return; // Success — exit retry loop
      } catch (error) {
        lastError = error;
        console.warn(`Connection attempt ${attempt} failed:`, error);
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
    }
    console.error(
      'BLE Connection failed after',
      maxRetries,
      'attempts:',
      lastError
    );
    throw new Error(
      'Failed to connect to device after ' + maxRetries + ' attempts'
    );
  }

  async disconnect(): Promise<void> {
    try {
      const currentState = this.connectionStateSubject.value;

      if (!currentState.isConnected) {
        if (this.connectedDevice) {
          BleClient.disconnect(this.connectedDevice.deviceId);
        }
        //return;
      }

      // Stop notifications if they're active
      if (this.connectedDevice) {
        try {
          await BleClient.stopNotifications(
            this.connectedDevice.deviceId,
            this.SENSOR_DATA_SERVICE_UUID,
            this.SENSOR_DATA_CHARACTERISTIC_UUID
          );
        } catch (error) {
          console.warn('Error stopping notifications:', error);
        }

        // Disconnect from device
        await BleClient.disconnect(this.connectedDevice.deviceId);
        this.connectedDevice = undefined;
      }

      // Clear device info
      await this.removePreference('DeviceObj');

      // Reset state
      this.clearBuffer();
      this.dataBuffer = '';
      this.connectionStateSubject.next({
        isConnected: false,
        currentDevice: null,
      });

      if (this.isDemoActive) {
        this.isDemoActive = false;
      }
    } catch (error) {
      console.error('BLE Disconnection error:', error);
      throw new Error('Failed to disconnect device');
    }
  }

  // Wind Period Storage
  storeWindPeriod(value: any, desc: string) {
    switch (desc) {
      case 'dirRel':
        this.mwv10MinDirRel.push(parseInt(value));
        if (this.mwv10MinDirRel.length > 600) {
          this.mwv10MinDirRel.shift();
        }
        break;
      case 'dirTru':
        this.mwv10MinDirTru.push(parseInt(value));
        if (this.mwv10MinDirTru.length > 600) {
          this.mwv10MinDirTru.shift();
        }
        break;
      case 'speedRel':
        this.mwv10MinSpeedRel.push(parseFloat(value));
        if (this.mwv10MinSpeedRel.length > 600) {
          this.mwv10MinSpeedRel.shift();
        }
        break;
      case 'speedTru':
        this.mwv10MinSpeedTru.push(parseFloat(value));
        if (this.mwv10MinSpeedTru.length > 600) {
          this.mwv10MinSpeedTru.shift();
        }
        break;
    }
  }

  // Terminal Data Handling
  terminalData(data: string) {
    const dataStrings = data.split('\n');
    for (let i = 0; i < dataStrings.length - 1; i++) {
      this.allData[this.allData.length] =
        this.getTimeStamp() + ':  ' + dataStrings[i];
      this.dataUpdatedSubject.next();
    }

    if (this.allDataCounter > 17) {
      this.allData.shift();
    } else {
      this.allDataCounter++;
    }
  }

  // QNH QFE Calculations
  handleQq(press: number) {
    if (!this.QqGpsHeight) {
      if (this.QfeHeight > 100000) {
        this.QfeHeight = 100000;
      } else if (this.QfeHeight < -100000) {
        this.QfeHeight = -100000;
      }

      const QFE = press * Math.exp(this.QfeHeight / 29.27 / 288.15);

      if (this.QnhHeight > 100000) {
        this.QnhHeight = 100000;
      } else if (this.QnhHeight < -100000) {
        this.QnhHeight = -100000;
      }

      const QNH =
        (QFE * 1000 +
          (0.022857 + (9.6e-5 + 6e-9 * this.QnhHeight) * (QFE * 1000)) *
            this.QnhHeight) /
        1000;

      this.saveDataItem(
        1,
        'CAL',
        'QFE',
        (QFE * 1000).toFixed(2),
        'hPa',
        'Calculated'
      );
      this.saveDataItem(
        1,
        'CAL',
        'QNH',
        (QNH * 1000).toFixed(2),
        'hPa',
        'Calculated'
      );
    }
  }

  // Dew Point Calculations
  handleDewPoint() {
    const Hum =
      this.dataItems[this.searchDataItemFull('XDR', 'Humidity', '%', 'RH')];
    const Temp =
      this.dataItems[
        this.searchDataItemFull('XDR', 'Temperature', '°C', 'TEMP')
      ];

    if (Hum != null && Temp != null) {
      const DewPoint =
        (237.7 *
          this.calculateDewPointAlpha(
            parseFloat(Hum.Data),
            parseFloat(Temp.Data)
          )) /
        (17.27 -
          this.calculateDewPointAlpha(
            parseFloat(Hum.Data),
            parseFloat(Temp.Data)
          ));

      this.saveDataItem(
        1,
        'CAL',
        'Dew point',
        DewPoint.toFixed(2),
        '°C',
        'Calculated'
      );
    }
  }

  calculateDewPointAlpha(Hum: number, Temp: number): number {
    return (17.27 * Temp) / (237.7 + Temp) + this.natLog[Math.floor(Hum)];
  }

  // Demo Data Generation
  demoMwv(
    speedOffset: number,
    dirOffset: number,
    trueOrRelative: string
  ): string {
    const randomNum = Math.floor(Math.random() * 60);
    speedOffset = speedOffset + randomNum / 10;
    dirOffset = dirOffset + Math.floor(Math.random() * 13);
    return this.calcNmeaChecksum(
      `$IIMWV,${dirOffset},${trueOrRelative},${speedOffset},N,A*`
    );
  }

  demoXdr(temp: number, hum: number, press: number): string {
    temp = temp + Math.floor(Math.random() * 10) / 10;
    hum += Math.floor(Math.random() * 2);
    press = (press + Math.floor(Math.random() * 10)) / 1000;
    return this.calcNmeaChecksum(
      `$IIXDR,C,${temp},C,TEMP,P,${press},B,PRESS,H,${hum},P,RH*`
    );
  }

  calcNmeaChecksum(data: string): string {
    let checksum = 0;
    for (let i = 1; i < data.length && data[i] !== '*'; i++) {
      checksum ^= data.charCodeAt(i);
    }
    return data + checksum.toString(16).toUpperCase() + '\r\n';
  }

  // Time and Date Functions
  getTimeStamp(): string {
    return moment.default().format('LTS');
  }

  getDateStamp(): string {
    return moment.default().format('L') + ' ' + moment.default().format('LTS');
  }

  // Logging Functions
  async startLogging() {
    this.loggingActive = true;
    this.loggingActiveSubject.next(true);
    const dateStart = this.getDateStamp();
    await this.sqliteService.insertRecord(
      dateStart,
      'maps',
      this.isDemoActive ? 'DEMO' : this.device
    );
  }

  /**
   * Stop logging and return whether picture was already taken during the session.
   * The caller (LoggingPage) is responsible for the camera — Capacitor Camera
   * must be invoked from a Component with an active iOS UIViewController, not
   * from a service which has no view context.
   */
  async stopLogging(): Promise<boolean> {
    // Stop the logging
    this.loggingActive = false;
    this.loggingActiveSubject.next(false);
    this.recIsVisible = false;

    // Reset recording time
    this.recHours = 0;
    this.recMinutes = 0;
    this.recSeconds = 0;

    // Save the end time in the database
    const dateEnd = this.getDateStamp();
    const lastRecordId = await this.sqliteService.selectLastIDRecord();
    await this.sqliteService.updateDateEnd(lastRecordId, dateEnd);

    const alreadyHasPicture = this.insertPicture;
    this.insertPicture = false;

    // Return true if picture was already captured during the session,
    // false if the caller should prompt the user and open the camera.
    return alreadyHasPicture;
  }

  async stopLoggingWithoutPic() {
    this.loggingActive = false;
    this.loggingActiveSubject.next(false);
    const dateEnd = this.getDateStamp();
    const lastRecordId = await this.sqliteService.selectLastIDRecord();
    await this.sqliteService.updateDateEnd(lastRecordId, dateEnd);
    Toast.show({
      text: 'Logging stopped',
      duration: 'long',
      position: 'center',
    });
    this.insertPicture = false;
  }

  async changeShow(item: any) {
    try {
      // Get current show preferences
      const showPrefString = await this.getPreference('EnShow');
      let showPrefs = showPrefString ? JSON.parse(showPrefString) : [];

      // Find if item exists in preferences
      const index = showPrefs.findIndex(
        (pref: any) =>
          pref.NMEA === item.NMEA &&
          pref.Type === item.Type &&
          pref.Unit === item.Unit &&
          pref.Desc === item.Desc
      );

      // Update or add the item
      if (index !== -1) {
        showPrefs[index].EnShow = item.EnShow;
      } else {
        showPrefs.push({
          EnShow: item.EnShow,
          NMEA: item.NMEA,
          Type: item.Type,
          Unit: item.Unit,
          Desc: item.Desc,
        });
      }

      // Save updated preferences
      await this.setPreference('EnShow', JSON.stringify(showPrefs));
    } catch (error) {
      console.error('Error changing show state:', error);
    }
  }

  async changeLog(item: any) {
    if (item.EnLogging === 1) {
      item.EnLogging = 0;
    } else {
      item.EnLogging = 1;
    }

    // Find the index in defaultLogging array
    const index = this.defaultLogging.findIndex(
      (e) =>
        e.NMEA === item.NMEA &&
        e.Type === item.Type &&
        e.Unit === item.Unit &&
        e.Desc === item.Desc
    );

    if (index !== -1) {
      this.defaultLogging[index].EnLogging = item.EnLogging;
    } else {
      this.defaultLogging.push({
        EnLogging: item.EnLogging,
        NMEA: item.NMEA,
        Type: item.Type,
        Unit: item.Unit,
        Desc: item.Desc,
      });
    }

    // Save to preferences
    await this.setPreference('EnLog', JSON.stringify(this.defaultLogging));
  }

  // Get theme
  async getTheme(): Promise<string> {
    const colorSetting = await this.getPreference('color');
    const colorNum = Number(colorSetting || '2');

    switch (colorNum) {
      case 0:
        return 'obsblack';
      case 1:
        return 'obsgrey';
      default:
        return 'primary'; // obsblue in the new theme
    }
  }

  // Camera Functions
  async takePicture(): Promise<void> {
    try {
      const image = await Camera.getPhoto({
        quality: 50,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        width: 1280,
        height: 640,
      });

      if (!image.base64String) return;

      const lastRecordId = await this.sqliteService.selectLastIDRecord();
      const base64Image = `data:image/jpeg;base64,${image.base64String}`;

      await Promise.all([
        this.sqliteService.insertPicture(base64Image, lastRecordId),
        this.saveImageToFilesystem(image.base64String),
      ]);

      this.insertPicture = true;
    } catch (error) {
      console.error('Camera error:', error);
    }
  }

  async saveImageToFilesystem(base64: string) {
    try {
      const lastPictureId = await this.sqliteService.selectLastIDPicture();
      const fileName = `${lastPictureId}.png`;
      const blob = this.b64toBlob(base64, 'image/png');

      await Filesystem.writeFile({
        path: fileName,
        data: blob,
        directory: Directory.Data,
      });
    } catch (error) {
      console.error('Error saving image:', error);
    }
  }
  // Cleanup Method
  private cleanup() {
    // Clear subscriptions
    this.destroy$.next();
    this.destroy$.complete();

    if (this.bluetoothSubscription) {
      this.bluetoothSubscription.unsubscribe();
    }

    // Clear timers
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
    }

    if (this.demoTimer) {
      clearInterval(this.demoTimer);
    }

    // Clear subjects
    this.dataItemsSubject.complete();
    this.loggingActiveSubject.complete();
    this.batteryStatusSubject.complete();
    this.connectionStateSubject.complete();
    // Clear arrays and state
    this.clearBuffer();
    this.windData = {
      dirRel: [],
      dirTru: [],
      speedRel: [],
      speedTru: [],
    };
  }

  async addPicture(id: number): Promise<boolean> {
    try {
      const image = await Camera.getPhoto({
        quality: 50,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        width: 1280,
        height: 640,
      });

      if (image.base64String) {
        const base64Image = `data:image/jpeg;base64,${image.base64String}`;
        await this.sqliteService.insertPicture(base64Image, id);
        this.insertPicture = true;

        const lastPictureId = await this.sqliteService.selectLastIDPicture();
        await this.writePhoto(image.base64String, `${lastPictureId}.png`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error adding picture:', error);
      return false;
    }
  }

  async writePhoto(base64: string, fileName: string) {
    try {
      const blob = this.b64toBlob(base64, 'image/png');
      await Filesystem.writeFile({
        path: fileName,
        data: blob,
        directory: Directory.Data,
      });
    } catch (error) {
      console.error('Error writing photo:', error);
    }
  }

  private b64toBlob(b64Data: string, contentType: string): Blob {
    const byteCharacters = atob(b64Data);
    const byteArrays = [];
    const sliceSize = 512;

    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize);
      const byteNumbers = new Array(slice.length);

      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }

      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }

    return new Blob(byteArrays, { type: contentType });
  }

  async initCalcSettings() {
    // QNH QFE settings
    const qqEnabled = await this.getPreference('QqEnabled');
    this.QqEnabled = qqEnabled === 'true';

    const qqHeightSet = await this.getPreference('QqHeightSet');
    this.QqGpsHeight = qqHeightSet === 'true';

    const qfeHeight = await this.getPreference('QfeHeight');
    this.QfeHeight = qfeHeight ? Number(qfeHeight) : 0;

    const qnhHeight = await this.getPreference('QnhHeight');
    this.QnhHeight = qnhHeight ? Number(qnhHeight) : 0;

    // Dew point
    const dpEnabled = await this.getPreference('DpEnabled');
    this.DpEnabled = dpEnabled === 'true';
  }

  /**
   * Explicitly stop demo mode (called directly from ConfigurationPage).
   */
  async stopDemo(): Promise<void> {
    if (!this.isDemoActive) return;
    this.isDemoActive = false;
    if (this.demoTimer) {
      clearInterval(this.demoTimer);
      this.demoTimer = undefined;
    }
    this.clearBuffer();
    await this.setPreference('demoMode', 'false');
    await Toast.show({
      text: 'Demo mode deactivated',
      duration: 'short',
      position: 'bottom',
    });
  }

  async toggleDemoMode() {
    this.isDemoActive = !this.isDemoActive;

    if (this.isDemoActive) {
      // Clear any existing data
      this.clearBuffer();

      // Start the demo
      this.startDemo();

      // Save the preference
      await this.setPreference('demoMode', 'true');

      // Show toast notification
      await Toast.show({
        text: 'Demo mode activated',
        duration: 'short',
        position: 'bottom',
      });
    } else {
      // Stop the demo
      if (this.demoTimer) {
        clearInterval(this.demoTimer);
        this.demoTimer = undefined;
      }

      // Clear demo data
      this.clearBuffer();

      // Save the preference
      await this.setPreference('demoMode', 'false');

      // Show toast notification
      await Toast.show({
        text: 'Demo mode deactivated',
        duration: 'short',
        position: 'bottom',
      });
    }
  }

  async checkLocationPermission(): Promise<boolean> {
    if (Capacitor.getPlatform() === 'web') return true;

    try {
      if (Capacitor.getPlatform() === 'android') {
        const result = await this.androidPermissions.checkPermission(
          this.androidPermissions.PERMISSION.ACCESS_FINE_LOCATION
        );
        return result.hasPermission;
      }
      return true;
    } catch (error) {
      console.error('Location check error:', error);
      return false;
    }
  }

  async requestLocationPermission(): Promise<boolean> {
    if (Capacitor.getPlatform() === 'web') return true;

    try {
      if (Capacitor.getPlatform() === 'android') {
        const result = await this.androidPermissions.requestPermission(
          this.androidPermissions.PERMISSION.ACCESS_FINE_LOCATION
        );
        return result.hasPermission;
      }
      return true;
    } catch (error) {
      console.error('Location request error:', error);
      return false;
    }
  }

  // BLE Permission checking
  async checkBluetoothPermissions(): Promise<boolean> {
    if (Capacitor.getPlatform() === 'web') return true;

    try {
      if (Capacitor.getPlatform() === 'android') {
        const sdkVersion = (await Device.getInfo()).androidSDKVersion ?? '0';

        if (parseInt(String(sdkVersion)) >= 31) {
          const connectResult = await this.androidPermissions.checkPermission(
            this.androidPermissions.PERMISSION.BLUETOOTH_CONNECT
          );
          const scanResult = await this.androidPermissions.checkPermission(
            this.androidPermissions.PERMISSION.BLUETOOTH_SCAN
          );

          if (!connectResult.hasPermission || !scanResult.hasPermission) {
            return false;
          }
        }

        // Also check location permission as it's required for BLE scanning
        return await this.checkLocationPermission();
      }

      return true;
    } catch (error) {
      console.error('Bluetooth check error:', error);
      return false;
    }
  }

  async requestBluetoothPermissions(): Promise<boolean> {
    if (Capacitor.getPlatform() === 'web') return true;

    try {
      if (Capacitor.getPlatform() === 'android') {
        const sdkVersion = (await Device.getInfo()).androidSDKVersion ?? '0';

        if (parseInt(String(sdkVersion)) >= 31) {
          // Request new Bluetooth permissions for Android 12+
          const connectResult = await this.androidPermissions.requestPermission(
            this.androidPermissions.PERMISSION.BLUETOOTH_CONNECT
          );
          const scanResult = await this.androidPermissions.requestPermission(
            this.androidPermissions.PERMISSION.BLUETOOTH_SCAN
          );

          if (!connectResult.hasPermission || !scanResult.hasPermission) {
            return false;
          }
        }

        // Also request location permission as it's required for BLE scanning
        return await this.requestLocationPermission();
      }

      return true;
    } catch (error) {
      console.error('Bluetooth request error:', error);
      return false;
    }
  }

  ensureDataFlow() {
    // This method ensures data continues to flow even when navigating between pages

    // If demo mode is active, make sure it's properly running
    if (this.isDemoActive && !this.demoTimer) {
      this.startDemo();
    }

    // If not in demo mode, ensure Bluetooth subscription is active
    else if (!this.isDemoActive && !this.bluetoothSubscription) {
      this.setupBleDataSubscription();
    }

    // Trigger a data updated event to refresh any listening components
    this.dataUpdatedSubject.next();
  }

  // Save calculation settings to preferences storage
  async saveCalcSettings() {
    // QNH QFE settings
    await this.setPreference('QqEnabled', this.QqEnabled.toString());
    await this.setPreference('QqHeightSet', this.QqGpsHeight.toString());
    await this.setPreference('QfeHeight', this.QfeHeight.toString());
    await this.setPreference('QnhHeight', this.QnhHeight.toString());

    // Dew point
    await this.setPreference('DpEnabled', this.DpEnabled.toString());
  }

  // Buffer Management
  clearBuffer() {
    this.dataItems = [];
    this.dataItemsAvailable = false;
    this.newGpsData = false;
    this.statsReceived = false;
    this.battCharging = false;
    this.battCapacity = '';
  }

  // Preference Management
  async setPreference(key: string, value: string) {
    await Preferences.set({ key, value });
  }

  async getPreference(key: string): Promise<string | null> {
    const { value } = await Preferences.get({ key });
    return value;
  }

  async removePreference(key: string) {
    await Preferences.remove({ key });
  }

  // ── Unit Preferences ────────────────────────────────────────────────────────

  /**
   * Active unit map — keyed by unit group label (e.g. 'Wind Speed': 'knots').
   * Read by BluetoothService display helpers and pipe transforms.
   */
  public activeUnitMap: Record<string, string> = {};

  /**
   * Called by ChangeUnitsPage whenever the user changes a unit.
   * Persists the full map and stores it in memory for immediate use.
   */
  applyUnitPreferences(unitMap: Record<string, string>): void {
    this.activeUnitMap = { ...unitMap };
    // Persist as a single JSON blob for fast cold-start restore.
    this.setPreference('activeUnitMap', JSON.stringify(unitMap)).catch((e) =>
      console.warn('Failed to persist unit preferences:', e)
    );
  }

  /** Restore unit preferences on service init — call once from initializeService(). */
  private async restoreUnitPreferences(): Promise<void> {
    const raw = await this.getPreference('activeUnitMap');
    if (raw) {
      try {
        this.activeUnitMap = JSON.parse(raw);
      } catch {
        this.activeUnitMap = {};
      }
    }
  }
}

// for ios

// <key>NSBluetoothAlwaysUsageDescription</key>
// <string>This app needs Bluetooth access to connect to MET-LINK devices</string>
// <key>NSBluetoothPeripheralUsageDescription</key>
// <string>This app needs Bluetooth access to connect to MET-LINK devices</string>
// <key>NSLocationWhenInUseUsageDescription</key>
// <string>Location permission is required for Bluetooth scanning on iOS</string>
