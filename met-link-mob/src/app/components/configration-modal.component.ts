import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalController, AlertController, Platform } from '@ionic/angular';
import { Router } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  listOutline,
  appsOutline,
  colorPaletteOutline,
  calculatorOutline,
  desktopOutline,
  arrowForwardOutline,
  arrowDownOutline,
  starOutline,
  mailOutline,
  downloadOutline,
  playOutline,
  play,
  tvOutline,
  documentOutline,
  checkmarkOutline,
  closeOutline,
} from 'ionicons/icons';
import { BluetoothService } from '../services/bluedata.service';
import { GlobalService } from '../services/global.service';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Toast } from '@capacitor/toast';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { AppLauncher } from '@capacitor/app-launcher';
import { TerminalModalComponent } from './terminal-modal.component';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonItem,
  IonLabel,
  IonIcon,
  IonList,
  IonRow,
  IonToggle,
  IonRadio,
  IonRadioGroup,
  IonInput,
  IonModal,
} from '@ionic/angular/standalone';
import { IonicModule } from '@ionic/angular';

@Component({
  selector: 'app-configuration-modal',
  template: `
    <ion-header>
      <ion-toolbar [color]="theme">
        <ion-title>Configuration</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">Close</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-item [color]="themeLight" (click)="toggleSection('showData')">
        <ion-label>Show data</ion-label>
        <ion-icon [name]="'list-outline'" slot="end"></ion-icon>
      </ion-item>

      <ion-list
        *ngIf="sections.showData && bluetoothService.dataItems.length >= 2"
      >
        <ion-item *ngFor="let data of bluetoothService.dataItems">
          <ion-label>
            <ion-row>{{ data.Type }}</ion-row>
            <ion-row
              ><i>{{ data.Desc }}</i></ion-row
            >
          </ion-label>
          <ion-toggle
            slot="end"
            [color]="theme"
            [checked]="data.EnShow === 1"
            (ionChange)="toggleData(data)"
          >
          </ion-toggle>
        </ion-item>
      </ion-list>
      <ion-label
        *ngIf="sections.showData && bluetoothService.dataItems.length < 2"
        >no data available</ion-label
      >

      <ion-item [color]="themeLight" (click)="toggleSection('layout')">
        <ion-label>Layout</ion-label>
        <ion-icon name="apps-outline" slot="end"></ion-icon>
      </ion-item>

      <ion-list *ngIf="sections.layout">
        <ion-radio-group [(ngModel)]="layout" (ionChange)="updateLayout()">
          <ion-item>
            <ion-label>{{ graphType }} up</ion-label>
            <ion-radio [color]="theme" [value]="0" slot="end"></ion-radio>
          </ion-item>
          <ion-item>
            <ion-label>{{ graphType }} down</ion-label>
            <ion-radio [color]="theme" [value]="1" slot="end"></ion-radio>
          </ion-item>
          <ion-item>
            <ion-label>no {{ graphType }}</ion-label>
            <ion-radio [color]="theme" [value]="2" slot="end"></ion-radio>
          </ion-item>
        </ion-radio-group>
      </ion-list>

      <ion-item [color]="themeLight" (click)="toggleSection('theme')">
        <ion-label>Select theme</ion-label>
        <ion-icon name="color-palette-outline" slot="end"></ion-icon>
      </ion-item>

      <ion-list *ngIf="sections.theme">
        <ion-radio-group
          [(ngModel)]="selectedColor"
          (ionChange)="updateTheme()"
        >
          <ion-item>
            <ion-label>Black</ion-label>
            <ion-radio [color]="theme" [value]="0" slot="end"></ion-radio>
          </ion-item>
          <ion-item>
            <ion-label>Grey</ion-label>
            <ion-radio [color]="theme" [value]="1" slot="end"></ion-radio>
          </ion-item>
          <ion-item>
            <ion-label>Observator blue</ion-label>
            <ion-radio [color]="theme" [value]="2" slot="end"></ion-radio>
          </ion-item>
        </ion-radio-group>
      </ion-list>

      <ion-item [color]="themeLight" (click)="toggleSection('calculate')">
        <ion-label>Calculate</ion-label>
        <ion-icon name="calculator-outline" slot="end"></ion-icon>
      </ion-item>

      <ion-list *ngIf="sections.calculate">
        <ion-item>
          <ion-label>Enable QNH QFE</ion-label>
          <ion-toggle
            slot="end"
            [(ngModel)]="bluetoothService.QqEnabled"
            [color]="theme"
          >
          </ion-toggle>
        </ion-item>

        <ion-item *ngIf="bluetoothService.QqEnabled">
          <ion-input
            label="Barometer height above runway (m)"
            labelPlacement="floating"
            [(ngModel)]="bluetoothService.QfeHeight"
            type="number"
            (ionChange)="updateQfeHeight()"
          >
          </ion-input>
        </ion-item>

        <ion-item *ngIf="bluetoothService.QqEnabled">
          <ion-input
            label="Runway elevation above sea level (m)"
            labelPlacement="floating"
            [(ngModel)]="bluetoothService.QnhHeight"
            type="number"
            (ionChange)="updateQnhHeight()"
          >
          </ion-input>
        </ion-item>

        <ion-item>
          <ion-label>Enable Dew point</ion-label>
          <ion-toggle
            slot="end"
            [(ngModel)]="bluetoothService.DpEnabled"
            [color]="theme"
          >
          </ion-toggle>
        </ion-item>
      </ion-list>

      <ion-item [color]="themeLight" (click)="goToDirBrowser()">
        <ion-label>Change save location</ion-label>
        <ion-icon name="document-outline" slot="end"></ion-icon>
      </ion-item>

      <ion-item [color]="themeLight" (click)="goToTerminal()">
        <ion-label>Start terminal</ion-label>
        <ion-icon name="tv-outline" slot="end"></ion-icon>
      </ion-item>

      <ion-item [color]="themeLight" (click)="toggleSection('more')">
        <ion-label>More...</ion-label>
        <ion-icon
          [name]="
            sections.more ? 'arrow-down-outline' : 'arrow-forward-outline'
          "
          slot="end"
        >
        </ion-icon>
      </ion-item>

      <ion-list *ngIf="sections.more">
        <ion-item (click)="rateApp()">
          <ion-label>Rate this app</ion-label>
          <ion-icon name="star-outline" slot="end"></ion-icon>
        </ion-item>

        <ion-item (click)="sendFeedback()">
          <ion-label>Send feedback</ion-label>
          <ion-icon name="mail-outline" slot="end"></ion-icon>
        </ion-item>

        <ion-item (click)="getManual()">
          <ion-label>Download product manual</ion-label>
          <ion-icon name="download-outline" slot="end"></ion-icon>
        </ion-item>

        <ion-item (click)="getSpecs()">
          <ion-label>Download product specification</ion-label>
          <ion-icon name="download-outline" slot="end"></ion-icon>
        </ion-item>

        <ion-item (click)="toggleDemo()">
          <ion-label>
            {{
              bluetoothService.isDemoActive
                ? 'Disconnect DEMO'
                : 'Connect to DEMO'
            }}
          </ion-label>
          <ion-icon
            [name]="bluetoothService.isDemoActive ? 'play' : 'play-outline'"
            slot="end"
          >
          </ion-icon>
        </ion-item>
      </ion-list>
    </ion-content>
  `,
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    // IonicModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonItem,
    IonLabel,
    IonIcon,
    IonList,
    IonRow,
    IonToggle,
    IonRadio,
    IonRadioGroup,
    IonInput,
  ],
  providers: [ModalController, AlertController],
})
export class ConfigurationModalComponent implements OnInit {
  get theme(): string {
    return this.globalService.theme();
  }

  themeLight: string = 'light';
  sections = {
    showData: false,
    layout: false,
    theme: false,
    calculate: false,
    more: false,
  };

  layout: number = 0;
  selectedColor: number = 2;
  graphType: string = 'Wind rose';
  private fromPage: number = 0;
  private layoutChanged: boolean = false;
  private colorChanged: boolean = false;
  private demoMode: boolean = false;
  private terminalStarted: boolean = false;

  constructor(
    public bluetoothService: BluetoothService,
    private modalController: ModalController,
    private router: Router,
    private alertController: AlertController,
    private platform: Platform,
    private globalService: GlobalService
  ) {
    addIcons({
      listOutline,
      appsOutline,
      colorPaletteOutline,
      calculatorOutline,
      desktopOutline,
      arrowForwardOutline,
      arrowDownOutline,
      starOutline,
      mailOutline,
      downloadOutline,
      playOutline,
      play,
      tvOutline,
      documentOutline,
      checkmarkOutline,
      closeOutline,
    });
  }

  async ngOnInit() {
    await this.loadSettings();
    // Get the theme from the GlobalService
    // theme and themeLight are now reactive Signal getters — no assignment needed
  }

  async loadSettings() {
    const graphicalType = await this.bluetoothService.getPreference(
      'graphicalType'
    );
    this.graphType = graphicalType === 'rose' ? 'Wind rose' : 'Graph';

    const layout = await this.bluetoothService.getPreference('pagelayout');
    this.layout = Number(layout || '0');

    const color = await this.bluetoothService.getPreference('color');
    this.selectedColor = Number(color || '2');

    // Ensure calculation settings are loaded
    await this.bluetoothService.initCalcSettings();
  }

  toggleSection(section: keyof typeof this.sections) {
    this.sections[section] = !this.sections[section];
  }
  async updateQfeHeight() {
    await this.bluetoothService.setPreference(
      'QfeHeight',
      this.bluetoothService.QfeHeight.toString()
    );
  }

  async updateQnhHeight() {
    await this.bluetoothService.setPreference(
      'QnhHeight',
      this.bluetoothService.QnhHeight.toString()
    );
  }

  async toggleData(data: any) {
    // Toggle the EnShow property between 0 and 1 (compatible with original code)
    data.EnShow = data.EnShow === 1 ? 0 : 1;
    await this.bluetoothService.changeShow(data);
  }

  async updateLayout() {
    this.layoutChanged = true;
    await this.bluetoothService.setPreference(
      'pagelayout',
      this.layout.toString()
    );
  }

  async updateTheme() {
    this.colorChanged = true;
    await this.bluetoothService.setPreference(
      'color',
      this.selectedColor.toString()
    );
    // Update the global theme Signal — all pages update automatically.
    await this.globalService.setThemeByColorIndex(this.selectedColor);
  }

  async goToTerminal() {
    this.terminalStarted = true;
    this.dismiss();
    // await this.router.navigate(['/terminal']);
  }

  async goToDirBrowser() {
    // Implement directory browser navigation
    // In the modern app, you might want to use Capacitor File System APIs
    try {
      const dirResult = await Filesystem.readdir({
        path: '',
        directory: Directory.Documents,
      });

      // Show directory selection alert or navigate to a directory browser page
      this.showDirSelector(dirResult.files.map((f) => f.name));
    } catch (error) {
      console.error('Error accessing filesystem:', error);
      this.showToast('Error accessing filesystem');
    }
  }

  async showDirSelector(directories: string[]) {
    const alert = await this.alertController.create({
      header: 'Select Directory',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Confirm',
          role: 'confirm',
        },
      ],
      inputs: directories.map((dir) => ({
        type: 'radio',
        label: dir,
        value: dir,
      })),
    });

    await alert.present();
    const result = await alert.onDidDismiss();

    if (result.role === 'confirm' && result.data?.values) {
      await this.bluetoothService.setPreference('saveDir', result.data.values);
      this.showToast(`Directory changed to: ${result.data.values}`);
    }
  }

  async toggleDemo() {
    this.demoMode = true;
    this.bluetoothService.isDemoActive = !this.bluetoothService.isDemoActive;

    if (this.bluetoothService.isDemoActive) {
      await this.bluetoothService.startDemo();
    } else {
      await this.bluetoothService.clearBuffer();
    }
  }

  async rateApp() {
    // Use App Launcher to open the app store
    const canOpenStore = await AppLauncher.canOpenUrl({
      url: 'market://details?id=obs.metlink',
    });

    if (canOpenStore.value) {
      await AppLauncher.openUrl({ url: 'market://details?id=obs.metlink' });
    } else {
      // Fallback to browser for App Store
      await Browser.open({
        url: 'https://play.google.com/store/apps/details?id=obs.metlink',
      });
    }
  }

  async sendFeedback() {
    // Check if email app is available
    const canOpenMail = await AppLauncher.canOpenUrl({
      url: 'mailto:info.au@observator.com',
    });

    if (canOpenMail.value) {
      await AppLauncher.openUrl({
        url: 'mailto:info.au@observator.com?subject=MET-LINK app feedback',
      });
    } else {
      this.showToast('Email app not available');
    }
  }

  async getManual() {
    await Browser.open({
      url: 'http://download.observator.com/files/User%20manuals/MET-Link/MET-LINK%20Manual.pdf',
      presentationStyle: 'popover',
    });
  }

  async getSpecs() {
    await Browser.open({
      url: 'http://download.observator.com/files/User%20manuals/MET-Link/MET-LINK%20Spec.pdf',
      presentationStyle: 'popover',
    });
  }

  async showToast(message: string) {
    await Toast.show({
      text: message,
      duration: 'short',
      position: 'center',
    });
  }
  async dismiss() {
    // Save calculation settings before dismissing
    await this.bluetoothService.saveCalcSettings();

    // Handle navigation based on states
    if (this.layoutChanged || this.colorChanged || this.demoMode) {
      if (this.fromPage === 1 || this.demoMode) {
        // Reload the dashboard if coming from there
        this.router.navigateByUrl('/live-data/dashboard', { replaceUrl: true });
      } else if (this.fromPage === 0) {
        // Go to devices page
        this.router.navigateByUrl('/devices', { replaceUrl: true });
      }
    }

    await this.modalController.dismiss({
      layoutChanged: this.layoutChanged,
      colorChanged: this.colorChanged,
      demoMode: this.demoMode,
    });
  }

  // Method to set the page we're coming from
  setFromPage(page: number) {
    this.fromPage = page;
  }

  // Implement iOS backbutton handler if needed
  handleBackButton() {
    if (this.platform.is('ios')) {
      this.platform.backButton.subscribeWithPriority(10, () => {
        this.dismiss();
      });
    }
  }

  ionViewWillLeave() {
    if (this.terminalStarted) {
      setTimeout(async () => {
        const isTablet = this.platform.width() >= 768;
        const modal = await this.modalController.create({
          component: TerminalModalComponent,
          // cssClass: isTablet ? 'fullscreen-modal' : 'terminal-modal',
          presentingElement: await this.modalController.getTop(),
          backdropDismiss: true,
          showBackdrop: true,
          // initialBreakpoint: 1.0, // Start at full height
          // breakpoints: [0, 0.5, 0.75, 1.0], // Allow different heights
          // These settings ensure full-screen on tablets
          // canDismiss: true,
          // componentProps: {
          //   fullscreen: true,
          // },
        });

        await modal.present();
      }, 100);
      // Terminal was started, don't do navigation
    } else {
      // Make sure calculations are saved
      this.bluetoothService.saveCalcSettings();
    }
  }
}

// Handle navigation based on
