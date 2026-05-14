import { Component, inject, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  IonApp,
  IonSplitPane,
  IonMenu,
  IonContent,
  IonList,
  IonMenuToggle,
  IonItem,
  IonIcon,
  IonLabel,
  IonRouterOutlet,
  IonRouterLink,
  IonHeader,
  IonToolbar,
  IonTitle,
} from '@ionic/angular/standalone';
import { Platform } from '@ionic/angular';
import {
  constructOutline,
  cloudOutline,
  recordingOutline,
  informationCircleOutline,
} from 'ionicons/icons';
import { Capacitor } from '@capacitor/core';
import { GlobalService } from './services/global.service';
import { BluetoothService } from './services/bluedata.service';
import { SqliteService } from './services/sqlite.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
    IonApp,
    IonSplitPane,
    IonMenu,
    IonContent,
    IonList,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonMenuToggle,
    IonItem,
    IonIcon,
    IonLabel,
    IonRouterLink,
    IonRouterOutlet,
  ],
})
export class AppComponent implements OnInit {
  private globalService = inject(GlobalService);
  private platform = inject(Platform);
  private sqliteService = inject(SqliteService);

  public appPages = [
    { title: 'Devices', url: '/devices', icon: 'construct-outline' },
    { title: 'Live data', url: '/live-data', icon: 'cloud-outline' },
    { title: 'View records', url: '/view-record', icon: 'recording-outline' },
    { title: 'About', url: '/about', icon: 'information-circle-outline' },
  ];

  constructor(private bluetoothService: BluetoothService) {
    addIcons({
      constructOutline,
      cloudOutline,
      recordingOutline,
      informationCircleOutline,
    });
  }

  /** Reactive theme colour name — drives side-menu toolbar colour. */
  readonly theme = () => this.globalService.theme();

  async ngOnInit(): Promise<void> {
    await this.platform.ready();
    // Restore persisted theme on startup.
    this.globalService.initTheme();

    // SQLite is native-only (Android & iOS).
    // On web the SqliteService gracefully no-ops every call.
    if (Capacitor.isNativePlatform()) {
      await this.sqliteService.createDatabase();
    }
  }
}
