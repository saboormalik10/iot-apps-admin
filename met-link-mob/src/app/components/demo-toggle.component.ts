import { Component, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BluetoothService } from '../services/bluedata.service';
import { Toast } from '@capacitor/toast';

@Component({
  selector: 'app-demo-toggle',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>Demo Mode</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <p>
          Enable demo mode to see simulated data without an actual MET-LINK
          device.
        </p>
        <ion-item lines="none">
          <ion-toggle
            [color]="theme"
            [(ngModel)]="isDemoActive"
            (ionChange)="toggleDemoMode()"
          >
            {{ isDemoActive ? 'Demo mode is ON' : 'Demo mode is OFF' }}
          </ion-toggle>
        </ion-item>
      </ion-card-content>
    </ion-card>
  `,
})
export class DemoToggleComponent implements OnInit {
  isDemoActive = false;
  theme = 'primary';

  constructor(private bluetoothService: BluetoothService) {}

  async ngOnInit() {
    this.isDemoActive = this.bluetoothService.isDemoActive;
    this.theme = await this.bluetoothService.getTheme();
  }

  async toggleDemoMode() {
    this.bluetoothService.toggleDemoMode();
    await Toast.show({
      text: `Demo mode ${
        this.bluetoothService.isDemoActive ? 'activated' : ''
      } `,
      duration: 'short',
      position: 'bottom',
    });
  }
}
