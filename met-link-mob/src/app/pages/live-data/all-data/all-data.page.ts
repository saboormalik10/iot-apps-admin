import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BluetoothService } from 'src/app/services/bluedata.service';
import { GlobalService } from 'src/app/services/global.service';
import { addIcons } from 'ionicons';
import {
  menuOutline,
  batteryFull,
  batteryCharging,
  ellipsisVertical,
  arrowForwardOutline,
  camera,
  phonePortraitOutline,
} from 'ionicons/icons';
import { GroupByPipe } from '../../../pipes/group-by.pipe';
import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonButton,
  IonContent,
  IonList,
  IonItemGroup,
  IonItem,
  IonItemDivider,
  IonLabel,
  IonMenuButton,
  IonIcon,
  IonGrid,
  IonRow,
  IonCol,
  IonTitle,
  IonCard,
  IonCardContent,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-all-data',
  templateUrl: './all-data.page.html',
  styleUrls: ['./all-data.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    GroupByPipe,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonContent,
    IonList,
    IonItemGroup,
    IonItem,
    IonItemDivider,
    IonLabel,
    IonMenuButton,
    IonIcon,
    IonGrid,
    IonRow,
    IonCol,
    IonTitle,
    IonCard,
    IonCardContent,
  ],
})
export class AllDataPage implements OnInit, OnDestroy {
  get theme(): string {
    return this.globalService.theme();
  }
  public themeLight: string = 'light';
  private updateInterval: any;
  public filteredItems: any[] = [];
  public hasData: boolean = false;

  constructor(
    public bluetoothService: BluetoothService,
    public globalService: GlobalService
  ) {
    addIcons({
      menuOutline,
      batteryFull,
      batteryCharging,
      ellipsisVertical,
      arrowForwardOutline,
      camera,
      phonePortraitOutline,
    });
  }

  async ngOnInit() {
    // theme is reactive via the get theme() getter — no assignment needed
    this.startUpdate();
  }

  ngOnDestroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }

  private startUpdate() {
    this.updateInterval = setInterval(() => {
      this.hasData = this.bluetoothService.dataItems.length > 0;
      this.filterItems();
    }, 500);
  }

  filterItems() {
    this.filteredItems = this.bluetoothService.dataItems.filter(
      (item) => item.EnShow === 1 && item.Type !== ''
    );
  }

  stopLogging() {
    this.bluetoothService.stopLogging();
  }

  async goToConfig() {
    this.globalService.goToConfig();
  }
}
