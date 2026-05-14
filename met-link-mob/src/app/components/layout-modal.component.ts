import { Component, Input, OnInit } from '@angular/core';
import {
  ModalController,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonRadio,
  IonRadioGroup,
  IonItem,
  IonRow,
} from '@ionic/angular/standalone';
// import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BluetoothService } from '../services/bluedata.service';
import { GlobalService } from '../services/global.service';

@Component({
  selector: 'app-layout-modal',
  template: `
    <ion-header>
      <ion-toolbar [color]="theme">
        <ion-title>Select data item</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-radio-group>
        <ion-item *ngFor="let data of filteredData; let i = index">
          <ion-radio [value]="i" (click)="selectItem(i)">
            <ion-row>{{ data.Type }}</ion-row>
            <ion-row
              ><i> {{ data.Desc }}</i></ion-row
            >
          </ion-radio>
        </ion-item>
      </ion-radio-group>
    </ion-content>
  `,
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonRadio,
    IonRadioGroup,
    IonItem,
    IonRow,
    CommonModule,
    FormsModule,
  ],
})
export class LayoutModalComponent implements OnInit {
  @Input() layout!: number;

  filteredData: any[] = [];
  get theme(): string {
    return this.globalService.theme();
  }

  constructor(
    private modalCtrl: ModalController,
    private bluetoothService: BluetoothService,
    private globalService: GlobalService
  ) {}

  async ngOnInit() {
    // theme is reactive via the get theme() getter — no assignment needed

    // Filter available data items to only include those with data
    this.filteredData = this.bluetoothService.dataItems.filter((item) => {
      return item && item.Type && item.Type !== '';
    });
  }

  async selectItem(index: number) {
    try {
      // Store the selected item using the updated BluetoothService method
      const selectedItem = this.filteredData[index];
      await this.bluetoothService.setPreference(
        `layout${this.layout}`,
        JSON.stringify(selectedItem)
      );

      // Pass the selected item back to the dashboard
      this.modalCtrl.dismiss({
        selectedItem: selectedItem,
        layoutIndex: this.layout,
      });
    } catch (error) {
      console.error('Error saving layout selection:', error);
      this.modalCtrl.dismiss();
    }
  }
}
