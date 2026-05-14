import { Component, OnInit } from '@angular/core';
import {
  ModalController,
  IonHeader,
  IonToolbar,
  IonButton,
  IonTitle,
  IonContent,
  IonItem,
  IonRadioGroup,
  IonRadio,
  IonCard,
  IonCardHeader,
  IonRow,
  IonFooter,
} from '@ionic/angular/standalone';
// import { IonicModule } from '@ionic/angular';
import { BluetoothService } from '../services/bluedata.service';
import { GlobalService } from '../services/global.service';
import { FormsModule } from '@angular/forms';

import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-wind-rose-settings',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonItem,
    IonRadioGroup,
    IonRadio,
    IonCard,
    IonCardHeader,
    IonRow,
    IonFooter,
    IonButton,
    FormsModule,
  ],
  template: `
    <ion-header>
      <ion-toolbar [color]="theme">
        <ion-title>Wind rose settings</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-card>
        <ion-radio-group [(ngModel)]="graphicalType" (ionChange)="saveChoice()">
          <ion-card-header> Choose graphical display </ion-card-header>
          <ion-item>
            <ion-radio [color]="theme" value="rose">Wind rose</ion-radio>
          </ion-item>
          <ion-item>
            <ion-radio [color]="theme" value="graph">Graph</ion-radio>
          </ion-item>
        </ion-radio-group>
      </ion-card>

      <ion-card *ngIf="graphicalType === 'graph'">
        <ion-card-header> Select graph data </ion-card-header>
        <ion-radio-group
          [(ngModel)]="selectedDataItem"
          (ionChange)="saveDataChoice()"
        >
          <ion-item *ngFor="let data of filteredData">
            <ion-radio [color]="theme" [value]="data.Index">
              <ion-row>{{ data.Type }}</ion-row>
              <ion-row
                ><i> {{ data.Desc }}</i></ion-row
              >
            </ion-radio>
          </ion-item>
        </ion-radio-group>
      </ion-card>

      <ion-card *ngIf="graphicalType === 'rose'">
        <ion-radio-group [(ngModel)]="windRoseOrient">
          <ion-card-header> Wind orientation </ion-card-header>
          <ion-item>
            <ion-radio [color]="theme" value="true">True</ion-radio>
          </ion-item>
          <ion-item>
            <ion-radio [color]="theme" value="relative">Relative</ion-radio>
          </ion-item>
        </ion-radio-group>

        <ion-radio-group [(ngModel)]="windRoseUnit">
          <ion-card-header> Wind speed unit </ion-card-header>
          <ion-item>
            <ion-radio [color]="theme" [value]="0">m / s</ion-radio>
          </ion-item>
          <ion-item>
            <ion-radio [color]="theme" [value]="1">km / h</ion-radio>
          </ion-item>
          <ion-item>
            <ion-radio [color]="theme" [value]="2">Knots</ion-radio>
          </ion-item>
        </ion-radio-group>

        <ion-radio-group [(ngModel)]="windRosePeriod">
          <ion-card-header> Average interval </ion-card-header>
          <ion-item>
            <ion-radio [color]="theme" [value]="0">Instant</ion-radio>
          </ion-item>
          <ion-item>
            <ion-radio [color]="theme" [value]="1">2 min</ion-radio>
          </ion-item>
          <ion-item>
            <ion-radio [color]="theme" [value]="2">10 min</ion-radio>
          </ion-item>
        </ion-radio-group>
      </ion-card>
    </ion-content>

    <ion-footer class="ion-no-border">
      <div class="ion-padding">
        <ion-button expand="block" [color]="theme" (click)="apply()">
          Apply
        </ion-button>
      </div>
    </ion-footer>
  `,
})
export class WindRoseSettingsComponent implements OnInit {
  graphicalType: string = 'rose';
  windRoseOrient: string = 'true';
  windRoseUnit: number = 0;
  windRosePeriod: number = 0;
  get theme(): string {
    return this.globalService.theme();
  }
  selectedDataItem: number = 0;
  filteredData: any[] = [];

  constructor(
    private modalCtrl: ModalController,
    private bluetoothService: BluetoothService,
    private globalService: GlobalService
  ) {}

  async ngOnInit() {
    await this.loadSettings();
  }

  async loadSettings() {
    try {
      // theme is reactive via the get theme() getter — no assignment needed

      // Get graphical type
      const graphicalType = await this.bluetoothService.getPreference(
        'graphicalType'
      );
      this.graphicalType = graphicalType || 'rose';

      // Get wind rose orientation
      const windRoseOrient = await this.bluetoothService.getPreference(
        'windRoseOrient'
      );
      this.windRoseOrient = windRoseOrient || 'true';

      // Get wind rose unit - ensure it's a number
      const windRoseUnit = await this.bluetoothService.getPreference(
        'windRoseUnit'
      );
      this.windRoseUnit = windRoseUnit ? Number(windRoseUnit) : 0;

      // Get wind rose period - ensure it's a number
      const windRosePeriod = await this.bluetoothService.getPreference(
        'windRosePeriod'
      );
      this.windRosePeriod = windRosePeriod ? Number(windRosePeriod) : 0;

      // Get selected data item for graph
      const graphItem = await this.bluetoothService.getPreference('graphItem');
      this.selectedDataItem = graphItem ? Number(graphItem) : 0;

      // Filter data for graph selection
      this.filteredData = this.bluetoothService.dataItems.filter((item) => {
        return item && item.Type && item.Type !== '';
      });
    } catch (error) {
      console.error('Error loading wind rose settings:', error);
    }
  }

  async saveChoice() {
    try {
      await this.bluetoothService.setPreference(
        'graphicalType',
        this.graphicalType
      );
    } catch (error) {
      console.error('Error saving graphical type:', error);
    }
  }

  async saveDataChoice() {
    try {
      await this.bluetoothService.setPreference(
        'graphItem',
        this.selectedDataItem.toString()
      );

      // Make sure these values are updated in the service
      this.bluetoothService.graphDataItem = this.selectedDataItem;
      this.bluetoothService.graphDataChanged = true;
      this.bluetoothService.newGraphData = true;

      console.log('Selected graph data item:', this.selectedDataItem);
    } catch (error) {
      console.error('Error saving data choice:', error);
    }
  }

  async apply() {
    try {
      // Save all settings
      await this.bluetoothService.setPreference(
        'windRoseOrient',
        this.windRoseOrient
      );
      await this.bluetoothService.setPreference(
        'windRoseUnit',
        this.windRoseUnit.toString()
      );
      await this.bluetoothService.setPreference(
        'windRosePeriod',
        this.windRosePeriod.toString()
      );

      // If in graph mode, make sure to signal graph data changed
      if (this.graphicalType === 'graph') {
        this.bluetoothService.graphDataChanged = true;
        this.bluetoothService.newGraphData = true;
      }

      // Dismiss the modal
      this.modalCtrl.dismiss({
        graphicalType: this.graphicalType,
        dataChanged: true,
      });
    } catch (error) {
      console.error('Error applying settings:', error);
    }
  }
}
