import { Component, OnInit, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { Share } from '@capacitor/share';
import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { GlobalService } from '../../services/global.service';

@Component({
  selector: 'app-about',
  templateUrl: './about.page.html',
  styleUrls: ['./about.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class AboutPage implements OnInit {
  private readonly globalService = inject(GlobalService);

  /** Reactive theme colour — follows the user's selected theme everywhere. */
  readonly theme = () => this.globalService.theme();

  versionCode: string = '';
  versionName: string = '';
  bleModuleSerialNo: string = '';
  bleModuleFirmwareVersion: string = '';

  constructor() {}

  async getVersionInfo() {
    try {
      const info = await App.getInfo();
      this.versionCode = info.build;
      this.versionName = info.version;
    } catch {
      // App.getInfo() throws on web; ignore gracefully
    }
    const serialResult = await Preferences.get({ key: 'bleModuleSerialNo' });
    const fwResult = await Preferences.get({ key: 'bleModuleFirmwareVersion' });
    this.bleModuleSerialNo = serialResult.value ?? '';
    this.bleModuleFirmwareVersion = fwResult.value ?? '';
  }

  ngOnInit() {
    this.getVersionInfo();
  }

  goTo() {
    window.open('https://www.observator.com', '_blank');
  }

  async writeInfoMail() {
    const canShare = await Share.canShare();

    if (canShare) {
      await Share.share({
        title: 'Information needed from the ObserMetApp',
        text: 'Hello, I need more info about the ObserMetApp.',
        url: 'mailto:info.au@observator.com',
        dialogTitle: 'Send Email',
      });
    } else {
      // Fallback: Open mailto link directly in the browser
      window.location.href =
        'mailto:info.au@observator.com?subject=Information needed from the ObserMetApp';
    }
  }
}
