import {
  Component,
  ViewChild,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  NgZone,
  AfterViewInit,
  HostListener,
} from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController } from '@ionic/angular';
import { BluetoothService } from 'src/app/services/bluedata.service';
import { GlobalService } from 'src/app/services/global.service';
import { addIcons } from 'ionicons';
import { menuOutline, play, pause, closeCircle } from 'ionicons/icons';
import { DataFilter } from 'src/app/pipes/data-filter.pipe';
import { Subscription, interval } from 'rxjs';

@Component({
  selector: 'app-terminal-modal',
  template: `
    <ion-header>
      <ion-toolbar [color]="theme">
        <ion-title>Terminal</ion-title>
        <ion-buttons slot="start">
          <ion-button (click)="dismiss()">
            <ion-icon name="close-circle"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-buttons slot="end">
          <ion-button *ngIf="bluetoothService.pauseData" (click)="pauseData()">
            <ion-icon name="play"></ion-icon>
            <ion-label>play</ion-label>
          </ion-button>
          <ion-button *ngIf="!bluetoothService.pauseData" (click)="pauseData()">
            <ion-icon name="pause"></ion-icon>
            <ion-label>pause</ion-label>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding h-100">
      <ion-grid class="d-f h-100">
        <ion-row class="f-g-1">
          <ion-col size="12">
            @for (data of bluetoothService.allData; track $index) {
            <div class="terminal-item ion-margin-vertical">
              {{ data }}
            </div>
            }
          </ion-col>
        </ion-row>
      </ion-grid>
    </ion-content>
  `,
  styles: [
    `
      ion-col {
        font-family: monospace;
        font-size: 12px !important;
        // &:nth-child(odd) {
        //   --background: rgba(0, 0, 0, 0.05);
        // }
      }
    `,
  ],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class TerminalModalComponent
  implements OnInit, OnDestroy, AfterViewInit
{
  @ViewChild(IonContent) content!: IonContent;

  get theme(): string {
    return this.globalService.theme();
  }

  private updateSubscription: Subscription | null = null;
  private dataLength: number = 0;
  private scrollToBottomRequired: boolean = true;
  public isTablet: boolean = false;

  constructor(
    public bluetoothService: BluetoothService,
    private globalService: GlobalService,
    private modalCtrl: ModalController,
    private changeDetector: ChangeDetectorRef,
    private zone: NgZone
  ) {
    addIcons({
      menuOutline,
      play,
      pause,
      closeCircle,
    });
    // theme is reactive via the get theme() getter — no assignment needed

    // this.checkIfTablet();
  }

  // @HostListener('window:resize')
  // checkIfTablet() {
  //   // Define tablet breakpoint (typically 768px)
  //   this.isTablet = window.innerWidth >= 768;
  // }

  ngOnInit() {
    // Enable terminal data collection
    this.bluetoothService.enableAllData = true;

    // Record initial data length
    this.dataLength = this.bluetoothService.allData.length;

    // Set up update mechanism
    this.setupUpdates();
  }

  ngAfterViewInit() {
    // Initial scroll to bottom after view is initialized
    setTimeout(() => {
      this.scrollToBottom(true);
    }, 300);
  }

  ngOnDestroy() {
    // Disable terminal data collection
    this.bluetoothService.enableAllData = false;

    // Clean up subscriptions
    this.cleanupSubscription();
  }

  setupUpdates() {
    this.cleanupSubscription();

    // Create a subscription for UI updates
    this.updateSubscription = interval(100).subscribe(() => {
      if (!this.bluetoothService.pauseData) {
        this.zone.run(() => {
          // Check if new data has been added
          // console.log(
          //   'bluetoothService.allData',
          //   this.bluetoothService.allData
          // );
          const currentLength = this.bluetoothService.allData.length;
          if (currentLength !== this.dataLength) {
            this.scrollToBottomRequired = true;
            this.dataLength = currentLength;
          }

          this.changeDetector.detectChanges();

          // Scroll to bottom if required
          if (this.scrollToBottomRequired) {
            this.scrollToBottom();
          }
        });
      }
    });
  }

  scrollToBottom(force: boolean = false) {
    if (this.content && (this.scrollToBottomRequired || force)) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        this.content
          .scrollToBottom(300)
          .then(() => {
            this.scrollToBottomRequired = false;
          })
          .catch(() => {
            // Silent catch
          });
      });
    }
  }

  cleanupSubscription() {
    if (this.updateSubscription) {
      this.updateSubscription.unsubscribe();
      this.updateSubscription = null;
    }
  }

  pauseData() {
    this.bluetoothService.pauseData = !this.bluetoothService.pauseData;
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }
}
