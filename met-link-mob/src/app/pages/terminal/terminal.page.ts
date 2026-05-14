import {
  Component,
  ViewChild,
  ElementRef,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  NgZone,
} from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { BluetoothService } from 'src/app/services/bluedata.service';
import { GlobalService } from 'src/app/services/global.service';
import { addIcons } from 'ionicons';
import { menuOutline, play, pause } from 'ionicons/icons';
import { DataFilter } from 'src/app/pipes/data-filter.pipe';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-terminal',
  templateUrl: './terminal.page.html',
  styleUrls: ['./terminal.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, DataFilter],
})
export class TerminalPage implements OnInit, OnDestroy {
  @ViewChild(IonContent) content!: IonContent;

  get theme(): string {
    return this.globalService.theme();
  }

  private updateInterval: any;
  private dataSubscription: Subscription | null = null;

  constructor(
    public bluetoothService: BluetoothService,
    private globalService: GlobalService,
    private changeDetector: ChangeDetectorRef,
    private zone: NgZone
  ) {
    addIcons({
      menuOutline,
      play,
      pause,
    });
    // theme is reactive via the get theme() getter
  }

  ngOnInit() {
    // Enable all data collection mode
    this.bluetoothService.enableAllData = true;

    // Ensure data continues to flow (critical fix for the "update rose" issue)
    this.bluetoothService.ensureDataFlow();

    this.setupUpdateInterval();
    this.subscribeToDataUpdates();
  }

  ionViewWillEnter() {
    console.log('ionViewWillEnter TerminalPage');
    // IMPORTANT: This fixes the issue where data isn't collected when the terminal page is open
    this.bluetoothService.enableAllData = true;

    // Ensure data flow is active
    this.bluetoothService.ensureDataFlow();

    if (!this.updateInterval) {
      this.setupUpdateInterval();
    }

    if (!this.dataSubscription) {
      this.subscribeToDataUpdates();
    }
  }

  ionViewDidLeave() {
    console.log('ionViewDidLeave TerminalPage');
    this.bluetoothService.enableAllData = false;

    // Important: DO NOT reset pause state when leaving
    // this.bluetoothService.pauseData = false;

    this.cleanupInterval();
    this.unsubscribeFromDataUpdates();
  }

  ngOnDestroy() {
    this.bluetoothService.enableAllData = false;

    // Important: DO NOT reset pause state when destroying
    // this.bluetoothService.pauseData = false;

    this.cleanupInterval();
    this.unsubscribeFromDataUpdates();
  }

  subscribeToDataUpdates() {
    this.unsubscribeFromDataUpdates();

    this.dataSubscription = this.bluetoothService.dataUpdated$.subscribe(() => {
      this.zone.run(() => {
        this.changeDetector.detectChanges();
      });
    });
  }

  unsubscribeFromDataUpdates() {
    if (this.dataSubscription) {
      this.dataSubscription.unsubscribe();
      this.dataSubscription = null;
    }
  }

  setupUpdateInterval() {
    // Clear any existing interval first
    this.cleanupInterval();

    // Set up an interval that just handles UI updates
    this.updateInterval = setInterval(() => {
      if (!this.bluetoothService.pauseData) {
        // Run inside NgZone to ensure change detection triggers
        this.zone.run(() => {
          // Force the view to update
          this.changeDetector.detectChanges();

          // Scroll to bottom if we have content
          if (this.content) {
            setTimeout(() => {
              this.content.scrollToBottom(300).catch(() => {
                // Silently handle scroll errors
              });
            }, 0);
          }
        });
      }
    }, 100);
  }

  cleanupInterval() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  pauseData() {
    this.bluetoothService.pauseData = !this.bluetoothService.pauseData;
  }
}
