import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  IonList,
  IonItem,
  IonLabel,
  IonToggle,
  IonMenuButton,
  IonFooter,
  IonCard,
  IonCardContent,
  IonRow,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  menuOutline,
  batteryFull,
  batteryCharging,
  camera,
  arrowForwardCircle,
  statsChart,
  ellipsisVerticalOutline,
  phonePortraitOutline,
  pauseCircleOutline,
} from 'ionicons/icons';
import { FormsModule } from '@angular/forms';
import * as moment from 'moment';
import { SqliteService } from 'src/app/services/sqlite.service';
import { BluetoothService } from 'src/app/services/bluedata.service';
import { DataFilter } from 'src/app/pipes/data-filter.pipe';
import { GlobalService } from 'src/app/services/global.service';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Toast } from '@capacitor/toast';
import { Router } from '@angular/router';

@Component({
  selector: 'app-logging',
  templateUrl: './logging.page.html',
  styleUrls: ['./logging.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonIcon,
    IonList,
    IonItem,
    IonLabel,
    IonToggle,
    IonMenuButton,
    IonFooter,
    IonCard,
    IonCardContent,
    DataFilter,
    IonRow,
  ],
})
export class LoggingPage implements OnInit {
  dataItemsAvailable: boolean = false;
  logItemCnt: number = 0;
  get theme(): string {
    return this.globalService.theme();
  }
  themeL: string = 'light';
  public globalService = inject(GlobalService);

  constructor(
    private sqliteService: SqliteService,
    public bluetoothService: BluetoothService,
    private router: Router
  ) {
    addIcons({
      menuOutline,
      ellipsisVerticalOutline,
      batteryFull,
      batteryCharging,
      camera,
      arrowForwardCircle,
      statsChart,
      phonePortraitOutline,
      pauseCircleOutline,
    });
  }

  ngOnInit() {
    this.checkDataAvailability();
  }

  ionViewDidEnter() {
    this.checkDataAvailability();
  }

  ionViewDidLeave() {
    console.log('viewLeave logging');
    if (this.bluetoothService.loggingActive) {
      this.bluetoothService.stopLoggingWithoutPic();
    }
  }

  private checkDataAvailability() {
    this.dataItemsAvailable = this.bluetoothService.dataItems.length > 0;
    this.countLogItems();
  }

  private countLogItems() {
    if (!this.bluetoothService.dataItems) return;

    this.logItemCnt = this.bluetoothService.dataItems.filter(
      (item) => item.EnShow === 1 && item.EnLogging === 1
    ).length;
  }

  toggle(item: any) {
    if (item.EnLogging === 1) {
      item.EnLogging = 0;
    } else {
      item.EnLogging = 1;
    }
    this.bluetoothService.changeLog(item);
    this.countLogItems();
  }

  async startLogging() {
    console.log('start logging');

    // Start logging
    this.bluetoothService.loggingActive = true;
    const dateStart = this.createDatetime();

    try {
      // Store in database
      if (this.bluetoothService.isDemoActive) {
        await this.sqliteService.insertRecord(dateStart, 'maps', 'DEMO');
      } else {
        await this.sqliteService.insertRecord(
          dateStart,
          'maps',
          this.bluetoothService.device
        );
      }

      // Initialize first time logging flag
      this.bluetoothService.firstTimeLogging = true;
    } catch (error) {
      console.error('Error starting logging:', error);
    }
  }

  async stopLogging() {
    // Stop recording — returns true if a picture was already taken during the session
    const alreadyHasPicture = await this.bluetoothService.stopLogging();

    if (alreadyHasPicture) {
      await Toast.show({
        text: 'Logging stopped',
        duration: 'long',
        position: 'center',
      });
      this.router.navigate(['/view-record']);
      return;
    }

    // ── Camera ──────────────────────────────────────────────────────────────────
    // CameraSource.Prompt shows iOS's OWN native "Take Photo / Photo Library / Cancel"
    // sheet — no Ionic/JS overlay involved. This is the only approach that reliably
    // works in WKWebView. If the user taps Cancel the plugin throws a user-cancel
    // error which we catch and handle gracefully.
    try {
      const image = await Camera.getPhoto({
        quality: 50,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Prompt, // ← native OS picker, no JS dialog needed
        width: 1280,
        height: 640,
      });

      if (image.base64String) {
        const lastRecordId = await this.sqliteService.selectLastIDRecord();
        const base64Image = `data:image/jpeg;base64,${image.base64String}`;
        await this.sqliteService.insertPicture(base64Image, lastRecordId);
        await Toast.show({
          text: 'Logging stopped and picture saved',
          duration: 'long',
          position: 'center',
        });
      } else {
        await Toast.show({
          text: 'Logging stopped',
          duration: 'long',
          position: 'center',
        });
      }
    } catch (err: any) {
      // User cancelled the picker — treat as "no picture"
      const cancelled =
        typeof err?.message === 'string' &&
        (err.message.toLowerCase().includes('cancel') ||
          err.message.toLowerCase().includes('no image'));
      if (!cancelled) {
        console.error('Camera error in stopLogging:', err);
      }
      await Toast.show({
        text: 'Logging stopped',
        duration: 'long',
        position: 'center',
      });
    }

    this.router.navigate(['/view-record']);
  }

  /**
   * Mid-session camera button in the header toolbar.
   * Must be called from the page (not the service) so Capacitor has a valid
   * iOS UIViewController to present the camera picker on.
   */
  async takePictureMidSession() {
    try {
      const image = await Camera.getPhoto({
        quality: 50,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Prompt,
        width: 1280,
        height: 640,
      });

      if (image.base64String) {
        const lastRecordId = await this.sqliteService.selectLastIDRecord();
        const base64Image = `data:image/jpeg;base64,${image.base64String}`;
        await this.sqliteService.insertPicture(base64Image, lastRecordId);
        this.bluetoothService.insertPicture = true;
        await Toast.show({
          text: 'Picture saved',
          duration: 'short',
          position: 'center',
        });
      }
    } catch (err: any) {
      const cancelled =
        typeof err?.message === 'string' &&
        (err.message.toLowerCase().includes('cancel') ||
          err.message.toLowerCase().includes('no image'));
      if (!cancelled) {
        console.error('Mid-session camera error:', err);
      }
    }
  }

  async goToConfig() {
    this.globalService.goToConfig();
  }

  createDatetime(): string {
    return moment.default().format('L') + ' ' + moment.default().format('LTS');
  }
}
