import {
  Component,
  OnInit,
  OnDestroy,
  NgZone,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import {
  ModalController,
  IonHeader,
  IonButton,
  IonToolbar,
  IonButtons,
  IonTitle,
  IonIcon,
  IonBadge,
  IonLabel,
  IonContent,
  IonGrid,
  IonCard,
  IonItem,
  IonRow,
  IonCol,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonMenuButton,
} from '@ionic/angular/standalone';
import { Chart } from 'chart.js/auto';
import { addIcons } from 'ionicons';
import { Toast } from '@capacitor/toast';

import {
  menuOutline,
  ellipsisVertical,
  batteryFull,
  batteryCharging,
  camera,
  arrowForwardOutline,
  phonePortraitOutline,
} from 'ionicons/icons';
import { BluetoothService } from 'src/app/services/bluedata.service';
import { LayoutModalComponent } from 'src/app/components/layout-modal.component';
import { WindRoseSettingsComponent } from 'src/app/components/wind-rose-settings.component';
import { ColorScheme } from 'src/app/interfaces/color-scheme.interface';
// import {  } from '@ionic/angular/standalone';
import { GlobalService } from 'src/app/services/global.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  imports: [
    IonCardContent,
    IonCardTitle,
    IonCardHeader,
    IonCol,
    IonRow,
    IonItem,
    IonCard,
    IonGrid,
    IonContent,
    IonLabel,
    IonBadge,
    IonIcon,
    IonTitle,
    IonButtons,
    IonToolbar,
    IonButton,
    IonHeader,
    CommonModule,
    RouterModule,
    IonMenuButton,
  ],
})
export class DashboardPage implements OnInit, OnDestroy {
  public graphicalType: string = 'rose';
  public layoutData: any[] = [];
  public pageLayout: number = 0;
  get theme(): string {
    return this.globalService.theme();
  }
  public themeLight: string = 'light';
  public windRoseOrientHeader: string = 'True';
  public graphHeader: string = 'No data available';
  selectedColor: number = 2;
  private myChart: Chart | null = null;
  private graphUpdateInterval: any;
  private oldWindDir: number = 0;
  private graphDataChanged: boolean = false;

  public windDirection: number = 0;
  public windSpeed: string = '0';
  public windValid: boolean = false;
  public windPeriod: string = 'instant';
  public windUnit: string = 'm/s';
  colorScheme: ColorScheme[] = [];
  isActive = true;
  constructor(
    public bluetoothService: BluetoothService,
    private modalController: ModalController,
    private router: Router,
    public globalService: GlobalService,

    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {
    addIcons({
      menuOutline,
      ellipsisVertical,
      batteryFull,
      batteryCharging,
      camera,
      arrowForwardOutline,
      phonePortraitOutline,
    });
    this.colorScheme = this.globalService.colorScheme;
    this.initPageLayout();
  }

  async ngOnInit() {
    await this.loadLayoutData();
    await this.initializeSelectedColor();
    await this.loadWindRoseSettings();
    this.initGraphical();
  }

  ngOnDestroy() {
    if (this.graphUpdateInterval) {
      clearInterval(this.graphUpdateInterval);
    }
    if (this.myChart) {
      this.myChart.destroy();
    }
  }

  private async loadWindRoseSettings() {
    // Load wind rose settings at init
    const windRosePeriod =
      (await this.bluetoothService.getPreference('windRosePeriod')) || '0';
    const windRoseUnit =
      (await this.bluetoothService.getPreference('windRoseUnit')) || '0';

    this.windUnit = this.getWindUnitString(windRoseUnit);
    this.windPeriod = this.getWindPeriodString(windRosePeriod);
    this.cdr.markForCheck();
  }

  private async loadLayoutData() {
    for (let i = 0; i < this.layoutData.length; i++) {
      try {
        const layout = await this.bluetoothService.getPreference(`layout${i}`);
        if (layout) {
          this.layoutData[i] = JSON.parse(layout);
        } else {
          this.layoutData[i] = {
            NMEA: '',
            Type: '',
            Data: 'no data',
            Unit: '',
            Desc: 'Click to change data',
          };
        }
      } catch (error) {
        console.error(`Error loading layout data for index ${i}:`, error);
        this.layoutData[i] = {
          NMEA: '',
          Type: '',
          Data: 'no data',
          Unit: '',
          Desc: 'Click to change data',
        };
      }
    }

    // Load page layout preference
    const pageLayoutPref = await this.bluetoothService.getPreference(
      'pagelayout'
    );
    this.pageLayout = pageLayoutPref ? Number(pageLayoutPref) : 0;

    // Load graphical type
    const graphicalTypePref = await this.bluetoothService.getPreference(
      'graphicalType'
    );
    this.graphicalType = graphicalTypePref || 'rose';
    this.cdr.markForCheck();
  }

  private initGraphical() {
    this.graphUpdateInterval = setInterval(() => {
      // Run inside NgZone so Angular's Default change detection picks up all updates
      this.ngZone.run(() => {
        if (this.isActive) {
          if (this.graphicalType === 'graph') {
            this.updateGraph();
          } else if (this.graphicalType === 'rose') {
            this.updateWindRose();
          }
          this.refreshLayoutData();
        }
        // Always ensure data flow continues
        this.bluetoothService.ensureDataFlow();
      });
    }, 500);
  }

  updateGraph() {
    if (!this.bluetoothService.newGraphData || !this.myChart) return;

    console.log('Updating graph data');

    if (this.bluetoothService.graphDataChanged) {
      const item =
        this.bluetoothService.dataItems[this.bluetoothService.graphDataItem];
      if (item) {
        this.graphHeader = `${item.Type} (${item.Desc})`;
      } else {
        this.graphHeader = 'No data available';
      }

      this.bluetoothService.graphDataChanged = false;

      // Reset chart data
      this.myChart.data.datasets[0].data = Array(20).fill(0);
      this.myChart.update();
    }

    this.bluetoothService.newGraphData = false;

    if (
      this.myChart &&
      this.bluetoothService.dataItems[this.bluetoothService.graphDataItem]
    ) {
      const value =
        parseFloat(
          this.bluetoothService.dataItems[this.bluetoothService.graphDataItem]
            .Data
        ) || 0;

      // Push new data point
      const data = [...this.myChart.data.datasets[0].data.slice(1), value];
      this.myChart.data.datasets[0].data = data;

      // Update chart
      this.myChart.update('none'); // Use 'none' to disable animations for performance
    }
  }
  ionViewDidLeave() {
    // Important: Don't clear all intervals, just pause the UI updates
    // if (this.graphUpdateInterval) {
    //   clearInterval(this.graphUpdateInterval);
    // }

    // Instead, keep the interval but set a flag
    this.isActive = false;
  }

  ionViewDidEnter() {
    // Make sure both graph and windrose are properly initialized
    this.isActive = true;

    // Initialize the appropriate visualization based on the current type
    setTimeout(async () => {
      if (this.graphicalType === 'graph') {
        // Always reinitialize chart when entering the view
        if (this.myChart) {
          this.myChart.destroy();
          this.myChart = null;
        }
        this.initializeChart();
      } else if (this.graphicalType === 'rose') {
        // Update unit and period before initial windrose draw
        const windRosePeriod =
          (await this.bluetoothService.getPreference('windRosePeriod')) || '0';
        const windRoseUnit =
          (await this.bluetoothService.getPreference('windRoseUnit')) || '0';

        this.windUnit = this.getWindUnitString(windRoseUnit);
        this.windPeriod = this.getWindPeriodString(windRosePeriod);

        // Force an initial windrose draw if needed
        this.drawRose(0, '0', 0, false, this.windPeriod, this.windUnit);
      }
    }, 150);
  }

  async toggleDemo() {
    await this.bluetoothService.toggleDemoMode();

    // Update UI to reflect demo mode status
    if (this.bluetoothService.isDemoActive) {
      await Toast.show({
        text: 'Demo mode activated',
        duration: 'short',
        position: 'bottom',
      });
    }
  }

  private initializeChart() {
    const canvas = document.getElementById('Graph') as HTMLCanvasElement;
    if (!canvas) {
      console.error('Graph canvas element not found');
      return;
    }

    // Make sure to set the canvas dimensions properly
    canvas.width = canvas.offsetWidth || 500;
    canvas.height = canvas.offsetHeight || 300;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Could not get 2d context from canvas');
      return;
    }

    // Destroy existing chart if it exists
    if (this.myChart) {
      this.myChart.destroy();
    }

    console.log('Initializing chart...');

    // Get current theme colors - use getComputedStyle to be theme-aware
    const fontColor =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--ion-text-color')
        .trim() || 'black';

    const gridColor =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--ion-color-medium')
        .trim() || 'rgba(0,0,0,0.1)';

    // Configure Chart.js
    this.myChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: Array(20)
          .fill('')
          .map((_, i) => `-${19 - i}s`),
        datasets: [
          {
            label: 'Data',
            data: Array(20).fill(0),
            borderColor: 'black', // Keeping black for line visibility
            backgroundColor: 'rgba(0, 0, 0, 0.1)',
            borderWidth: 3, // Thicker line
            tension: 0.2, // Smoother curve
            fill: false, // No area fill
            pointRadius: 5, // Large dots
            pointBackgroundColor: 'black', // Black dots
            pointBorderColor: 'black',
            pointHoverRadius: 7, // Larger on hover
            pointHoverBackgroundColor: 'black',
            pointHoverBorderColor: 'white',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 100, // Very short animations for smooth updates without freezing
        },
        plugins: {
          legend: {
            display: false, // Hide legend
          },
          tooltip: {
            enabled: true,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            titleFont: {
              size: 14,
              weight: 'bold',
            },
            bodyFont: {
              size: 13,
            },
            padding: 10,
            displayColors: false,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            border: {
              color: fontColor,
              width: 1,
            },
            grid: {
              color: 'rgba(0, 0, 0, 0.1)', // Light grid lines work on both light/dark themes
              lineWidth: 1,
            },
            ticks: {
              color: fontColor,
              font: {
                size: 12,
                weight: 'bold',
              },
              padding: 5,
              maxTicksLimit: 8, // Limit the number of ticks
            },
            title: {
              display: true,
              text: 'Value',
              color: fontColor,
              font: {
                size: 14,
                weight: 'bold',
              },
              padding: {
                top: 10,
                bottom: 10,
              },
            },
          },
          x: {
            border: {
              color: fontColor,
              width: 1,
            },
            grid: {
              color: 'rgba(0, 0, 0, 0.1)', // Light grid lines work on both light/dark themes
              lineWidth: 1,
              display: true,
            },
            ticks: {
              color: fontColor,
              font: {
                size: 12,
                weight: 'bold',
              },
              padding: 5,
              // Show only every 4th tick for cleaner look
              callback: function (val, index) {
                return index % 4 === 0
                  ? this.getLabelForValue(val as number)
                  : '';
              },
            },
            title: {
              display: true,
              text: 'Time (s)',
              color: fontColor,
              font: {
                size: 14,
                weight: 'bold',
              },
              padding: {
                top: 10,
                bottom: 10,
              },
            },
          },
        },
        // Elements configuration for consistent styling
        elements: {
          line: {
            tension: 0.2, // slight curve
            borderWidth: 3,
            borderColor: 'black', // Keep black for visibility
          },
          point: {
            radius: 5,
            hoverRadius: 7,
            backgroundColor: 'black', // Keep black for visibility
            borderColor: 'black',
            borderWidth: 1,
          },
        },
      },
    });

    // Set flag to indicate graph is initialized
    this.graphDataChanged = true;
    this.bluetoothService.newGraphData = true;
  }

  private async initializeSelectedColor() {
    const color = await this.bluetoothService.getPreference('color');
    this.selectedColor = Number(color || '2');
  }

  // Add method to update selected color
  async updateSelectedColor(color: number) {
    this.selectedColor = color;
    await this.bluetoothService.setPreference('color', color.toString());
    // Redraw wind rose if needed
    if (this.graphicalType === 'rose') {
      this.updateWindRose();
    }
  }

  // Helper methods for wind unit and period display
  private getWindUnitString(windRoseUnit: string): string {
    switch (windRoseUnit) {
      case '0':
        return 'm / s';
      case '1':
        return 'km / h';
      case '2':
        return 'knots';
      default:
        return 'm / s';
    }
  }

  private getWindPeriodString(windRosePeriod: string): string {
    switch (windRosePeriod) {
      case '0':
        return 'instant';
      case '1':
        return '< 2 min';
      case '2':
        return '< 10 min';
      default:
        return 'instant';
    }
  }

  async updateWindRose() {
    if (!this.bluetoothService.newWindData) return;

    console.log('update rose');
    this.bluetoothService.newWindData = false;

    let windSpeed = 0;
    let windDirection = 0;
    let valid = false;

    const windRosePeriod =
      (await this.bluetoothService.getPreference('windRosePeriod')) || '0';
    const windRoseOrient =
      (await this.bluetoothService.getPreference('windRoseOrient')) || 'true';
    const windRoseUnit =
      (await this.bluetoothService.getPreference('windRoseUnit')) || '0';

    // Update the wind period and unit strings
    this.windPeriod = this.getWindPeriodString(windRosePeriod);
    this.windUnit = this.getWindUnitString(windRoseUnit);

    if (windRoseOrient === 'true') {
      this.windRoseOrientHeader = 'True';
    } else {
      this.windRoseOrientHeader = 'Relative';
    }

    switch (windRosePeriod) {
      case '0': // instant
        // Search without hardcoded unit — sensor may broadcast m/s, km/h, or knots
        const speedIndex = this.bluetoothService.searchDataItemFull(
          'MWV',
          'Wind speed',
          '',
          windRoseOrient === 'true' ? 'true' : 'relative'
        );
        const dirIndex = this.bluetoothService.searchDataItemFull(
          'MWV',
          'Wind direction',
          '',
          windRoseOrient === 'true' ? 'true' : 'relative'
        );

        if (this.bluetoothService.dataItems[speedIndex] != null) {
          windSpeed = parseFloat(
            this.bluetoothService.dataItems[speedIndex].Data
          );
          windDirection = parseInt(
            this.bluetoothService.dataItems[dirIndex]?.Data || '0'
          );
          valid = true;
        }
        break;

      case '1': // 2 min average
        if (windRoseOrient === 'relative') {
          if (this.bluetoothService.mwv10MinDirRel.length >= 120) {
            const offset = this.bluetoothService.mwv10MinDirRel.length - 120;
            for (let i = 0; i < 120; i++) {
              windDirection +=
                +this.bluetoothService.mwv10MinDirRel[offset + i];
              windSpeed += +this.bluetoothService.mwv10MinSpeedRel[offset + i];
            }
            windDirection = windDirection / 120;
            windSpeed = windSpeed / 120;
            valid = true;
          }
        } else {
          if (this.bluetoothService.mwv10MinDirTru.length >= 120) {
            const offset = this.bluetoothService.mwv10MinDirTru.length - 120;
            for (let i = 0; i < 120; i++) {
              windDirection +=
                +this.bluetoothService.mwv10MinDirTru[offset + i];
              windSpeed += +this.bluetoothService.mwv10MinSpeedTru[offset + i];
            }
            windDirection = windDirection / 120;
            windSpeed = windSpeed / 120;
            valid = true;
          }
        }
        break;

      case '2': // 10 min average
        if (windRoseOrient === 'relative') {
          if (this.bluetoothService.mwv10MinDirRel.length >= 600) {
            for (let i = 0; i < 600; i++) {
              windDirection += +this.bluetoothService.mwv10MinDirRel[i];
              windSpeed += +this.bluetoothService.mwv10MinSpeedRel[i];
            }
            windDirection = windDirection / 600;
            windSpeed = windSpeed / 600;
            valid = true;
          }
        } else {
          if (this.bluetoothService.mwv10MinDirTru.length >= 600) {
            const offset = this.bluetoothService.mwv10MinDirTru.length - 600;
            for (let i = 0; i < 600; i++) {
              windDirection +=
                +this.bluetoothService.mwv10MinDirTru[offset + i];
              windSpeed += +this.bluetoothService.mwv10MinSpeedTru[offset + i];
            }
            windDirection = windDirection / 600;
            windSpeed = windSpeed / 600;
            valid = true;
          }
        }
        break;
    }

    // Convert units if needed
    switch (windRoseUnit) {
      case '0': // m/s
        windSpeed = windSpeed * 0.514444;
        break;
      case '1': // kmh
        windSpeed = windSpeed * 1.852;
        break;
      case '2': // knots
        // Already in knots
        break;
    }

    if (isNaN(windSpeed) && windRoseOrient === 'true') {
      this.windRoseOrientHeader =
        'CAUTION: No true windspeed available due GPS signal!';
      valid = false;
    }

    // Pass the windPeriod and windUnit to drawRose
    this.drawRose(
      windDirection,
      windSpeed.toFixed(2),
      0,
      valid,
      this.windPeriod,
      this.windUnit
    );
  }

  private refreshLayoutData() {
    for (let i = 0; i < this.layoutData.length; i++) {
      if (this.layoutData[i] && this.layoutData[i].NMEA) {
        const index = this.bluetoothService.searchDataItemFull(
          this.layoutData[i].NMEA,
          this.layoutData[i].Type,
          '',
          this.layoutData[i].Desc
        );

        if (this.bluetoothService.dataItems[index] != null) {
          // Update with latest data while preserving the structure
          this.layoutData[i] = {
            ...this.layoutData[i],
            Data: this.bluetoothService.dataItems[index].Data,
            Unit: this.bluetoothService.dataItems[index].Unit,
          };
        } else {
          this.layoutData[i].Data = '---';
        }
      }
    }
  }

  async selectLayoutData(index: number) {
    if (!this.bluetoothService.dataItems[0]) {
      await Toast.show({
        text: 'No data available',
        duration: 'short',
        position: 'center',
      });
      return;
    }

    const modal = await this.modalController.create({
      component: LayoutModalComponent,
      componentProps: {
        layout: index,
      },
    });

    // Handle modal dismissal and update the layout data
    modal.onDidDismiss().then(async (result) => {
      await this.bluetoothService.setPreference('modalActive', '0');

      if (result.data && result.data.selectedItem) {
        // Update the layout data with the selected item
        this.layoutData[index] = result.data.selectedItem;
      } else {
        // If no item was selected, load from storage
        const layoutData = await this.bluetoothService.getPreference(
          `layout${index}`
        );
        if (layoutData) {
          this.layoutData[index] = JSON.parse(layoutData);
        } else {
          this.layoutData[index] = {
            NMEA: '',
            Type: '',
            Data: '--- ',
            Unit: '',
            Desc: 'Click to change data',
          };
        }
      }
    });

    await this.bluetoothService.setPreference('modalActive', '1');
    await modal.present();
  }

  async selectWindRose() {
    if (!this.bluetoothService.dataItems[0]) {
      await Toast.show({
        text: 'No data available',
        duration: 'short',
        position: 'center',
      });
      return;
    }

    const modal = await this.modalController.create({
      component: WindRoseSettingsComponent,
    });

    modal.onDidDismiss().then(async () => {
      // Update preference state
      await this.bluetoothService.setPreference('modalActive', '0');

      // Get updated wind rose settings
      const windRoseUnit =
        (await this.bluetoothService.getPreference('windRoseUnit')) || '0';
      const windRosePeriod =
        (await this.bluetoothService.getPreference('windRosePeriod')) || '0';

      // Update unit and period
      this.windUnit = this.getWindUnitString(windRoseUnit);
      this.windPeriod = this.getWindPeriodString(windRosePeriod);

      // Get the updated graphical type preference
      const graphicalType = await this.bluetoothService.getPreference(
        'graphicalType'
      );

      // Check if graph type changed
      const typeChanged = this.graphicalType !== graphicalType;
      this.graphicalType = graphicalType || 'rose';

      // If we're switching to graph, destroy existing chart and create a new one
      if (this.graphicalType === 'graph') {
        // If the chart exists, destroy it first
        if (this.myChart) {
          this.myChart.destroy();
          this.myChart = null;
        }

        // Wait for the DOM to update with the new canvas
        setTimeout(() => {
          this.initializeChart();
        }, 150);
      }
      // If switching to rose, make sure to properly initialize it
      else if (this.graphicalType === 'rose' && typeChanged) {
        setTimeout(() => {
          this.drawRose(0, '0', 0, false, this.windPeriod, this.windUnit);
        }, 150);
      }
    });

    await this.bluetoothService.setPreference('modalActive', '1');
    await modal.present();
  }

  private initPageLayout() {
    // Initialize 8 empty layout data slots
    for (let i = 0; i < 8; i++) {
      this.layoutData.push({
        NMEA: '',
        Type: '',
        Data: 'no data',
        Unit: '',
        Desc: '',
      });
    }
  }

  stopLogging() {
    this.bluetoothService.stopLogging();
  }

  async goToConfig() {
    this.globalService.goToConfig();
  }

  // Wind Rose Drawing Methods
  private drawRose(
    windDirection: number,
    windSpeed: string,
    offset: number,
    valid: boolean,
    period: string = 'instant',
    unit: string = 'm / s'
  ) {
    const canvas = document.getElementById('Windrose') as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const roseRadius = 250;
    const smallCircle = 5;
    const midleCircle = 10;
    const largeCircle = 20;
    const spikesLength = 9;
    const middleCircleRadius = 80;

    // Draw circles
    this.drawCircle(
      roseRadius,
      smallCircle,
      this.colorScheme[this.selectedColor].shadow0,
      this.colorScheme[this.selectedColor].shadow0
    );
    this.drawCircle(
      roseRadius - smallCircle,
      smallCircle,
      this.colorScheme[this.selectedColor].shadow1,
      this.colorScheme[this.selectedColor].shadow1
    );
    this.drawCircle(
      roseRadius - smallCircle - smallCircle,
      smallCircle,
      this.colorScheme[this.selectedColor].shadow2,
      this.colorScheme[this.selectedColor].shadow2
    );
    this.drawCircle(
      roseRadius - smallCircle - smallCircle - smallCircle,
      20,
      this.colorScheme[this.selectedColor].out0,
      this.colorScheme[this.selectedColor].out0
    );
    this.drawCircle(
      roseRadius - smallCircle - smallCircle - smallCircle - smallCircle,
      20,
      this.colorScheme[this.selectedColor].out1,
      this.colorScheme[this.selectedColor].out1
    );

    // Draw spikes
    this.drawSpikes(
      this.colorScheme[this.selectedColor].spike,
      0.02,
      roseRadius - smallCircle - smallCircle - smallCircle - smallCircle,
      spikesLength,
      offset
    );

    this.drawCircle(
      roseRadius -
        smallCircle -
        smallCircle -
        smallCircle -
        smallCircle -
        smallCircle -
        midleCircle,
      largeCircle,
      this.colorScheme[this.selectedColor].in0,
      this.colorScheme[this.selectedColor].out2
    );
    this.drawLaserBiem(
      roseRadius -
        smallCircle -
        smallCircle -
        smallCircle -
        smallCircle -
        smallCircle -
        midleCircle -
        largeCircle / 2,
      this.oldWindDir,
      windDirection,
      offset,
      this.colorScheme[this.selectedColor].biem
    );
    this.roseTriangles(
      0,
      middleCircleRadius,
      offset,
      this.colorScheme[this.selectedColor].tria0,
      this.colorScheme[this.selectedColor].tria1
    );

    this.drawCircle(
      middleCircleRadius,
      10,
      this.colorScheme[this.selectedColor].in1,
      this.colorScheme[this.selectedColor].in1
    );

    // Draw numbers
    this.drawNumbers(
      roseRadius -
        smallCircle -
        smallCircle -
        smallCircle -
        smallCircle -
        smallCircle -
        midleCircle,
      this.colorScheme[this.selectedColor].num,
      largeCircle,
      offset
    );

    // Triangle windspeed indicator
    this.drawTria(
      windDirection,
      roseRadius - smallCircle - smallCircle - smallCircle - smallCircle,
      this.colorScheme[this.selectedColor].ind0,
      this.colorScheme[this.selectedColor].ind1
    );

    // Pass period and unit to writeInfo
    this.writeInfo(
      windSpeed,
      offset,
      this.colorScheme[this.selectedColor].num,
      valid,
      period,
      unit
    );

    // Update for next round
    this.oldWindDir = windDirection;
  }

  private drawCircle(
    radius: number,
    lineWidth: number,
    fillColor: string,
    lineColor: string
  ) {
    const canvas = document.getElementById('Windrose') as HTMLCanvasElement;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    context.beginPath();
    context.arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
    context.fillStyle = fillColor;
    context.fill();
    context.lineWidth = lineWidth;
    context.strokeStyle = lineColor;
    context.stroke();
  }

  private drawSpikes(
    lineColor: string,
    lineWidth: number,
    radius: number,
    lineLength: number,
    offset: number
  ) {
    const canvas = document.getElementById('Windrose') as HTMLCanvasElement;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    let startPoint = -lineWidth / 2 + (Math.PI / 180) * offset;
    let endPoint = startPoint + lineWidth;

    for (let i = 0; i < 36; i++) {
      context.beginPath();
      context.arc(centerX, centerY, radius, startPoint, endPoint, false);
      context.fillStyle = lineColor;
      context.fill();
      context.lineWidth = lineLength;
      context.strokeStyle = lineColor;
      context.stroke();

      startPoint += Math.PI / 18;
      endPoint = startPoint + lineWidth;
    }
  }

  private drawNumbers(
    radius: number,
    color: string,
    fontSize: number,
    offset: number
  ) {
    const canvas = document.getElementById('Windrose') as HTMLCanvasElement;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    let angleText;
    let ang;
    let num;
    let textRotated = false;

    context.save();
    context.translate(canvas.height / 2, canvas.width / 2);
    context.font = radius * 0.15 + 'px arial';
    context.textBaseline = 'middle';
    context.textAlign = 'center';
    context.fillStyle = color;
    context.font = fontSize * 0.7 + 'px Arial';
    context.rotate((Math.PI / 180) * offset);

    for (num = 0; num < 12; num++) {
      ang = (num * Math.PI) / 6;
      context.rotate(ang);
      context.translate(0, -radius * 1);

      // Write the poles
      if (num == 0 || num == 3 || num == 6 || num == 9) {
        context.font = '35px Arial';
        context.translate(0, radius / 4);
        context.rotate(-ang);

        context.rotate((-Math.PI / 180) * offset);
        switch (num) {
          case 0:
            context.fillText('N', 0, 0);
            break;
          case 3:
            context.fillText('E', 0, 0);
            break;
          case 6:
            context.fillText('S', 0, 0);
            break;
          case 9:
            context.fillText('W', 0, 0);
            break;
        }
        context.rotate((Math.PI / 180) * offset);

        context.rotate(ang);
        context.font = fontSize * 0.7 + 'px Arial';
        context.translate(0, -radius / 4);
      }

      // Handle text rotation for better readability
      let rotateCondition1;
      if (Math.PI * 0.5 - (Math.PI / 180) * offset < 0) {
        rotateCondition1 =
          Math.PI * 0.5 - (Math.PI / 180) * offset + Math.PI * 2;
      } else {
        rotateCondition1 = Math.PI * 0.5 - (Math.PI / 180) * offset;
      }

      let rotateCondition2;
      if (Math.PI * 1.5 - (Math.PI / 180) * offset < 0) {
        rotateCondition2 =
          Math.PI * 1.5 - (Math.PI / 180) * offset + Math.PI * 2;
      } else {
        rotateCondition2 = Math.PI * 1.5 - (Math.PI / 180) * offset;
      }

      let needAngleCorr = false;
      if (rotateCondition1 > rotateCondition2) {
        needAngleCorr = true;
      }

      if (needAngleCorr) {
        if (ang > rotateCondition1 || ang < rotateCondition2) {
          textRotated = true;
          context.rotate(Math.PI);
        }
      } else if (ang > rotateCondition1 && ang < rotateCondition2) {
        textRotated = true;
        context.rotate(Math.PI);
      }

      angleText = num * 30;
      context.fillText(angleText.toString(), 0, 0);

      if (textRotated) {
        textRotated = false;
        context.rotate(-Math.PI);
      }

      context.translate(0, radius * 1);
      context.rotate(-ang);
    }

    context.restore();
  }

  private writeInfo(
    value: string,
    offset: number,
    color: string,
    valid: boolean,
    period: string,
    unit: string
  ) {
    const canvas = document.getElementById('Windrose') as HTMLCanvasElement;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const fontSize = 60;
    const textDistance = fontSize / 1.25;

    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((-Math.PI / 180) * offset);
    context.fillStyle = color;
    context.translate(0, -textDistance);
    context.font = '20px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    // Use the passed-in period
    context.fillText(period, 0, 0);

    context.translate(0, textDistance);
    context.font = fontSize + 'px Arial';
    if (valid) {
      context.fillText(value, 0, 0);
    } else {
      context.fillText('---', 0, 0);
    }

    context.translate(0, textDistance);
    context.font = '20px Arial';
    // Use the passed-in unit
    context.fillText(unit, 0, 0);

    context.restore();
  }

  private drawTriangle(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    triangleWidth: number,
    triangleHeight: number,
    fillStyle: string
  ) {
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + triangleWidth / 2, y + triangleHeight);
    context.lineTo(x - triangleWidth / 2, y + triangleHeight);
    context.closePath();
    context.fillStyle = fillStyle;
    context.fill();
  }

  private drawTria(
    degrees: number,
    radius: number,
    color0: string,
    color1: string
  ) {
    const canvas = document.getElementById('Windrose') as HTMLCanvasElement;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const ang = (Math.PI / 180) * degrees;
    const offsetAngle = 59;
    const triangleWidth = 40;
    const triangleHeight = 12;

    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);

    // Set position
    context.rotate(ang);

    context.translate(0, -(radius + triangleHeight * 2));
    context.rotate((Math.PI / 180) * offsetAngle);
    this.drawTriangle(context, 0, 0, triangleWidth, triangleHeight, color0);
    context.rotate((-Math.PI / 180) * offsetAngle);
    context.rotate((-Math.PI / 180) * offsetAngle);
    this.drawTriangle(context, 0, 0, triangleWidth, triangleHeight, color1);

    context.restore();
  }

  private roseTriangles(
    degrees: number,
    radius: number,
    offset: number,
    color0: string,
    color1: string
  ) {
    const canvas = document.getElementById('Windrose') as HTMLCanvasElement;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const scaleVar = radius / 80;
    const ang = (Math.PI / 180) * degrees;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const offsetAngle = 121;

    const smallTriangleWidth = 40 * scaleVar;
    const smallTriangleHeight = 12 * scaleVar;

    const triangleWidth = 160 * scaleVar;
    const triangleHeight = 48 * scaleVar;

    context.save();
    context.translate(centerX, centerY);

    // Set offset
    context.rotate((Math.PI / 180) * offset);
    context.rotate(ang);

    for (let i = 0; i < 4; i++) {
      context.rotate((Math.PI / 2) * i);

      context.translate(0, -triangleHeight);
      context.rotate((Math.PI / 180) * offsetAngle);
      this.drawTriangle(context, 0, 0, triangleWidth, triangleHeight, color0);
      context.rotate((-Math.PI / 180) * offsetAngle);
      context.rotate((-Math.PI / 180) * offsetAngle);
      this.drawTriangle(context, 0, 0, triangleWidth, triangleHeight, color1);
      context.rotate((Math.PI / 180) * offsetAngle);

      context.translate(0, triangleHeight);
      context.rotate(Math.PI / 4);
      context.translate(0, -triangleHeight * 1.8);

      context.rotate((Math.PI / 180) * offsetAngle);
      this.drawTriangle(
        context,
        0,
        0,
        smallTriangleWidth,
        smallTriangleHeight,
        color0
      );
      context.rotate((-Math.PI / 180) * offsetAngle);
      context.rotate((-Math.PI / 180) * offsetAngle);
      this.drawTriangle(
        context,
        0,
        0,
        smallTriangleWidth,
        smallTriangleHeight,
        color1
      );
      context.rotate((Math.PI / 180) * offsetAngle);

      context.translate(0, triangleHeight * 1.8);
      context.rotate(-Math.PI / 4);
      context.translate(0, -triangleHeight);
      context.translate(-0, triangleHeight);
    }

    context.restore();
  }

  private drawLaserBiem(
    radius: number,
    start: number,
    stop: number,
    offset: number,
    color: string
  ) {
    const canvas = document.getElementById('Windrose') as HTMLCanvasElement;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const startOfBiem =
      start * (Math.PI / 180) - Math.PI / 2 + (Math.PI / 180) * offset;
    const stopOfBiem =
      stop * (Math.PI / 180) - Math.PI / 2 + (Math.PI / 180) * offset;

    context.beginPath();

    if (stop - start < 0) {
      if (stop - start + 360 < 180) {
        context.arc(
          centerX,
          centerY,
          radius / 2,
          startOfBiem,
          stopOfBiem,
          false
        );
      } else {
        context.arc(
          centerX,
          centerY,
          radius / 2,
          stopOfBiem,
          startOfBiem,
          false
        );
      }
    } else {
      if (stop - start < 180) {
        context.arc(
          centerX,
          centerY,
          radius / 2,
          startOfBiem,
          stopOfBiem,
          false
        );
      } else {
        context.arc(
          centerX,
          centerY,
          radius / 2,
          stopOfBiem,
          startOfBiem,
          false
        );
      }
    }

    context.lineWidth = radius;
    context.strokeStyle = color;
    context.stroke();
  }
}
