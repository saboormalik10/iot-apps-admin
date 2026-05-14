import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewInit,
  inject,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  menuOutline,
  ellipsisVertical,
  batteryFull,
  batteryCharging,
  camera,
  arrowForwardOutline,
  phonePortraitOutline,
  warningOutline,
} from 'ionicons/icons';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { BluetoothService } from 'src/app/services/bluedata.service';
import { IonicModule, Platform } from '@ionic/angular';
import { GlobalService } from 'src/app/services/global.service';
import { environment } from 'src/environments/environment';

// Define interfaces to avoid 'any' types
interface LocationData {
  Type: string;
  Data: string | number;
  Unit: string;
}

// Declare Google Maps API
declare var google: any;

@Component({
  selector: 'app-location',
  templateUrl: './location.page.html',
  styleUrls: ['./location.page.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule, IonicModule],
})
export class LocationPage implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('map') mapElement!: ElementRef;
  public globalService = inject(GlobalService);

  get theme(): string {
    return this.globalService.theme();
  }
  themeLight: string = 'light';

  // Map properties
  map: any;
  mapInitialized: boolean = false;
  apiKey: string = '';
  radius: number = 1000;
  marker: any;
  polyline: any;
  latLng: any;

  // Location data
  latitude: number = 0;
  longitude: number = 0;
  latitudeData: LocationData = { Type: 'Latitude', Data: 'No data', Unit: 'N' };
  longitudeData: LocationData = {
    Type: 'Longitude',
    Data: 'No data',
    Unit: 'E',
  };
  heightData: LocationData = { Type: 'Height', Data: 'No data', Unit: 'm' };
  oldLatitudeData: string = '';
  oldLongitudeData: string = '';

  dataSource: string = 'Device GPS';
  mapLoadError: string = '';
  private locationUpdateInterval: number | null = null;
  private phoneGpsWatchId: string | null = null;

  constructor(
    public bluetoothService: BluetoothService,
    private platform: Platform,
    private ngZone: NgZone,
    private router: Router
  ) {
    addIcons({
      menuOutline,
      ellipsisVertical,
      batteryFull,
      batteryCharging,
      camera,
      arrowForwardOutline,
      phonePortraitOutline,
      warningOutline,
    });
  }

  async ngOnInit() {
    await this.initApiKey();
    await this.initLocation();
  }

  async ngAfterViewInit() {
    await this.loadGoogleMaps();
  }

  ngOnDestroy() {
    // Clean up resources
    if (this.locationUpdateInterval) {
      clearInterval(this.locationUpdateInterval);
      this.locationUpdateInterval = null;
    }

    if (this.phoneGpsWatchId) {
      Geolocation.clearWatch({ id: this.phoneGpsWatchId });
      this.phoneGpsWatchId = null;
    }

    // Clear map objects to prevent memory leaks
    if (this.map) {
      this.marker?.setMap(null);
      this.polyline?.setMap(null);
      this.marker = null;
      this.polyline = null;
      this.map = null;
    }
  }

  private initApiKey(): void {
    // Keys live in environment.ts so they are never scattered across component code.
    const platform = Capacitor.getPlatform();
    if (platform === 'android') {
      this.apiKey = environment.googleMapsApiKey.android;
    } else if (platform === 'ios') {
      this.apiKey = environment.googleMapsApiKey.ios;
    } else {
      this.apiKey = environment.googleMapsApiKey.web;
    }
  }

  private initLocation(): void {
    // Poll sensor data at 1 Hz. When the user switches to Phone GPS the BT
    // polling is deliberately skipped — only the watchPosition callback fires.
    this.locationUpdateInterval = window.setInterval(() => {
      if (this.dataSource === 'Device GPS') {
        this.updateDeviceLocation();
      }

      if (this.mapInitialized && this.map) {
        this.updateMap(this.latitude, this.longitude, this.heightData?.Data);
      }
    }, 1000);
  }

  async loadGoogleMaps() {
    try {
      await this.platform.ready();

      // Already loaded (e.g. navigating back to this page) — init immediately
      if (
        typeof (window as any)['google'] !== 'undefined' &&
        (window as any)['google']?.maps
      ) {
        this.mapLoadError = '';
        this.initMap();
        return;
      }

      // Script already injected but google not ready yet — wait for it
      if (document.getElementById('googleMaps')) {
        await this.waitForGoogleMapsScript();
        this.mapLoadError = '';
        this.initMap();
        return;
      }

      // First time: inject the script and wait for its onload event
      await this.injectAndWaitForMapsScript();
      this.mapLoadError = '';
      this.initMap();
    } catch (error: any) {
      console.error('Error loading Google Maps:', error);
      this.ngZone.run(() => {
        this.mapLoadError =
          'Map could not load. Please check your internet connection.';
      });
    }
  }

  /**
   * Inject the Maps SDK script and resolve ONLY when its onload fires.
   * NOTE: Do NOT include 'loading=async' — with that flag, Google does
   * additional async init so window.google.maps is NOT ready at onload time.
   */
  private injectAndWaitForMapsScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.id = 'googleMaps';
      // No 'loading=async' — standard sync load makes google.maps available at onload
      script.src = `https://maps.googleapis.com/maps/api/js?key=${this.apiKey}&libraries=geometry`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        // Give a short tick for Maps to finish internal setup, then resolve
        setTimeout(() => resolve(), 100);
      };
      script.onerror = () =>
        reject(new Error('Maps SDK script failed to load'));
      document.head.appendChild(script);
    });
  }

  /**
   * Script tag already exists (was injected previously but Maps not yet ready).
   * Poll briefly until window.google.maps resolves.
   */
  private waitForGoogleMapsScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const id = setInterval(() => {
        if (
          typeof (window as any)['google'] !== 'undefined' &&
          (window as any)['google']?.maps
        ) {
          clearInterval(id);
          resolve();
        } else if (Date.now() - startTime > 30000) {
          clearInterval(id);
          reject(new Error('Timed out waiting for Google Maps'));
        }
      }, 300);
    });
  }

  private initMap() {
    // Check if map element exists
    if (!this.mapElement) {
      console.error('Map element not found');
      return;
    }

    this.mapInitialized = true;
    this.radius = 1000;

    // Create map options
    const mapOptions = {
      center: { lat: 0, lng: 0 }, // Default center (will be updated)
      zoom: 13,
      mapTypeId: google.maps.MapTypeId.ROADMAP,
      navigationControl: false,
      mapTypeControl: false,
      scaleControl: false,
      draggable: true,
    };

    // Create the map
    this.map = new google.maps.Map(this.mapElement.nativeElement, mapOptions);

    // Create marker (will be positioned later)
    this.marker = new google.maps.Marker({
      map: this.map,
      animation: google.maps.Animation.DROP,
      position: { lat: 0, lng: 0 },
    });

    // Create polyline for tracking path
    this.polyline = new google.maps.Polyline({
      map: this.map,
      path: [],
      strokeColor: '#FF0000',
      strokeOpacity: 1.0,
      strokeWeight: 2,
    });

    // Initial position (use phone GPS as fallback)
    Geolocation.getCurrentPosition()
      .then((position) => {
        this.latitude = position.coords.latitude;
        this.longitude = position.coords.longitude;
        this.updateMap(this.latitude, this.longitude, position.coords.altitude);
      })
      .catch((error) => {
        console.error('Error getting initial position:', error);
      });
  }

  private updateDeviceLocation() {
    // Find GPS data from device
    const latIndex = this.bluetoothService.searchDataItemFull(
      'GGA',
      'latitude',
      '',
      'LAT'
    );
    const lonIndex = this.bluetoothService.searchDataItemFull(
      'GGA',
      'longitude',
      '',
      'LON'
    );
    const heightIndex = this.bluetoothService.searchDataItemFull(
      'GGA',
      'GPS height',
      '',
      'GEOID'
    );

    if (
      latIndex < this.bluetoothService.dataItems.length &&
      this.bluetoothService.dataItems[latIndex]
    ) {
      this.latitudeData = this.bluetoothService.dataItems[
        latIndex
      ] as LocationData;

      // Convert from NMEA format if needed
      if (this.latitudeData.Data) {
        const latDecimal = this.convertGpsFormat(
          this.latitudeData.Data.toString(),
          this.latitudeData.Unit || 'N'
        );
        this.latitude = latDecimal;
      }
    }

    if (
      lonIndex < this.bluetoothService.dataItems.length &&
      this.bluetoothService.dataItems[lonIndex]
    ) {
      this.longitudeData = this.bluetoothService.dataItems[
        lonIndex
      ] as LocationData;

      // Convert from NMEA format if needed
      if (this.longitudeData.Data) {
        const lonDecimal = this.convertGpsFormat(
          this.longitudeData.Data.toString(),
          this.longitudeData.Unit || 'E'
        );
        this.longitude = lonDecimal;
      }
    }

    if (
      heightIndex < this.bluetoothService.dataItems.length &&
      this.bluetoothService.dataItems[heightIndex]
    ) {
      this.heightData = this.bluetoothService.dataItems[
        heightIndex
      ] as LocationData;
    }
  }

  // Convert NMEA GPS format (DDMM.MMMM) to decimal degrees
  private convertGpsFormat(formatString: string, compasDir: string): number {
    if (!formatString) return 0;

    try {
      const value = parseFloat(formatString);
      const degrees = Math.floor(value / 100);
      let minutes = value - degrees * 100;
      let decimalDegrees = degrees + minutes / 60;

      // Adjust for direction (S or W are negative)
      if (compasDir === 'S' || compasDir === 'W') {
        decimalDegrees = -decimalDegrees;
      }

      decimalDegrees = Math.floor(decimalDegrees * 1000000) / 1000000;

      return decimalDegrees;
    } catch (error) {
      console.error('Error converting GPS format:', error);
      return 0;
    }
  }

  private updateMap(lat: number, lng: number, alt: any) {
    if (!this.map || !this.mapInitialized) return;

    // Skip update if invalid coordinates
    if (!lat || !lng || isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0))
      return;

    try {
      // Create LatLng object
      const newPosition = new google.maps.LatLng(lat, lng);

      // Update marker
      this.marker.setPosition(newPosition);

      // Center map if position changed significantly
      const currentCenter = this.map.getCenter();
      if (google.maps.geometry && google.maps.geometry.spherical) {
        const distance = google.maps.geometry.spherical.computeDistanceBetween(
          currentCenter,
          newPosition
        );

        if (distance > 100) {
          // Only recenter if moved more than 100m
          this.map.panTo(newPosition);
        }
      } else {
        // Fallback if geometry library not loaded
        this.map.panTo(newPosition);
      }

      // Add point to polyline path
      const path = this.polyline.getPath();
      path.push(newPosition);

      // Limit path length to prevent memory issues
      if (path.getLength() > 1000) {
        path.removeAt(0);
      }
    } catch (error) {
      console.error('Error updating map:', error);
    }
  }

  // Toggle between device GPS and phone GPS
  toggleDataSource() {
    if (this.dataSource === 'Device GPS') {
      this.dataSource = 'Phone GPS';
      this.subscribePhoneGps();
    } else {
      this.dataSource = 'Device GPS';
      // Stop phone GPS
      if (this.phoneGpsWatchId) {
        Geolocation.clearWatch({ id: this.phoneGpsWatchId });
        this.phoneGpsWatchId = null;
      }
    }
  }

  private async subscribePhoneGps(): Promise<void> {
    // iOS requires that we request permission explicitly before watchPosition;
    // on Android Geolocation silently uses the location permission we already
    // requested during BLE setup.
    if (Capacitor.getPlatform() === 'ios') {
      try {
        const status = await Geolocation.requestPermissions();
        if (status.location === 'denied') {
          await this.globalService.showToast(
            'Location permission denied — cannot use Phone GPS.'
          );
          this.dataSource = 'Device GPS';
          return;
        }
      } catch (e) {
        console.warn('Geolocation.requestPermissions failed:', e);
      }
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 3000,
    };

    try {
      this.phoneGpsWatchId = await Geolocation.watchPosition(
        options,
        (position) => {
          this.ngZone.run(() => {
            if (!position?.coords) return;

            this.latitude = position.coords.latitude;
            this.longitude = position.coords.longitude;

            this.latitudeData = {
              Type: 'Latitude',
              Data: position.coords.latitude.toFixed(6),
              Unit: 'N',
            };

            this.longitudeData = {
              Type: 'Longitude',
              Data: position.coords.longitude.toFixed(6),
              Unit: 'E',
            };

            this.heightData = {
              Type: 'Height',
              Data:
                position.coords.altitude != null
                  ? position.coords.altitude.toFixed(1)
                  : 'No data',
              Unit: 'm',
            };

            if (this.map && this.mapInitialized) {
              this.updateMap(
                position.coords.latitude,
                position.coords.longitude,
                position.coords.altitude
              );
            }

            if (this.bluetoothService) {
              this.bluetoothService.phoneLatitude = position.coords.latitude;
              this.bluetoothService.phoneLongitude = position.coords.longitude;
            }
          });
        }
      );
    } catch (error) {
      console.error('Error watching position:', error);
      this.dataSource = 'Device GPS';
    }
  }

  stopLogging() {
    this.bluetoothService.stopLogging();
  }

  async goToConfig() {
    this.globalService.goToConfig();
  }
}
