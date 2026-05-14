import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  speedometerOutline,
  globeOutline,
  statsChartOutline,
  listOutline,
  newspaperOutline,
} from 'ionicons/icons';
@Component({
  selector: 'app-live-data',
  templateUrl: './live-data.page.html',
  styleUrls: ['./live-data.page.scss'],
  standalone: true,
  imports: [CommonModule, IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
})
export class LiveDataPage implements OnInit {
  constructor() {
    addIcons({
      speedometerOutline,
      newspaperOutline,
      globeOutline,
      statsChartOutline,
    });
  }

  ngOnInit() {}
}
