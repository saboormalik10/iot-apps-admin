import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Preferences } from '@capacitor/preferences';
import { Toast } from '@capacitor/toast';
import { IonicModule, NavController } from '@ionic/angular';

import { Share } from '@capacitor/share';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BluetoothService } from 'src/app/services/bluedata.service';
import { GlobalService } from 'src/app/services/global.service';

@Component({
  selector: 'app-configuration',
  templateUrl: './configuration.page.html',
  styleUrls: ['./configuration.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class ConfigurationPage {
  dispData = false;
  selColor = false;
  selLayout = false;
  layoutChanged = false;
  colorChanged = false;
  demoMode = false;
  menuItems = [false, false, false, false, false];
  testToggle = true;
  private selectedColor: any;
  private TerminalStarted = false;
  public GraphType!: string;
  colorRose: any;
  layout: any;
  fromDashboard: any;

  private globalService = inject(GlobalService);

  get theme(): string {
    return this.globalService.theme();
  }

  constructor(
    private navCtrl: NavController,
    private route: ActivatedRoute,
    public blueData: BluetoothService
  ) {
    this.fromDashboard = this.route.snapshot.queryParams['fromPage'] || 0;
    this.globalService.initTheme();

    Preferences.get({ key: 'graphicalType' }).then((res: any) => {
      this.GraphType = res.value === 'rose' ? 'Wind rose' : 'Graph';
    });

    Preferences.get({ key: 'color' }).then((res: any) => {
      this.colorRose = res.value ? Number(res.value) : 2;
      this.selectedColor = this.colorRose;
    });

    Preferences.get({ key: 'pagelayout' }).then((res: any) => {
      this.layout = res.value ? Number(res.value) : 0;
    });
  }

  testFunc() {
    console.log(this.testToggle);
  }

  ionViewDidLeave() {
    // Save QNH/QFE and DewPoint calculation settings
    this.blueData.saveCalcSettings();

    if (this.layoutChanged || this.colorChanged || this.demoMode) {
      if (this.fromDashboard == 1 || this.demoMode) {
        this.navCtrl.navigateRoot('/live-data/dashboard');
      } else {
        this.navCtrl.navigateRoot('/devices');
      }
    }
  }

  async rateApp() {
    const storeUrl = 'market://details?id=obs.metlink';
    await Browser.open({ url: storeUrl });
  }

  async sendFeedback() {
    await Share.share({
      title: 'MET-LINK app feedback',
      text: 'Please share your feedback about the MET-LINK app.',
      url: 'mailto:info.au@observator.com',
      dialogTitle: 'Send Feedback',
    });
  }

  toggle(item: any) {
    item.EnShow = item.EnShow === 1 ? 0 : 1;
    this.blueData.changeShow(item);
  }

  async selectClr(color: any) {
    this.colorChanged = true;
    await this.globalService.setThemeByColorIndex(Number(color));
  }

  async selectLo(layout: any) {
    this.layoutChanged = true;
    await Preferences.set({ key: 'pagelayout', value: String(layout) });
  }

  selectMenu(index: number) {
    this.menuItems = this.menuItems.map((_, i) =>
      i === index ? !this.menuItems[i] : false
    );
  }

  goToTerminal() {
    console.log('go to terminal');
    this.TerminalStarted = true;
    this.navCtrl.navigateForward('/terminal');

    this.demoMode = false;
  }

  goToDirBrowser() {
    console.log('go to dir browser');
    this.navCtrl.navigateForward('/dir-browser');
  }

  async getManual() {
    await Browser.open({
      url: 'http://download.observator.com/files/User%20manuals/MET-Link/MET-LINK%20Manual.pdf',
    });
  }

  async getSpecs() {
    await Browser.open({
      url: 'http://download.observator.com/files/User%20manuals/MET-Link/MET-LINK%20Spec.pdf',
    });
  }

  async startDemo() {
    console.log('toggle demo mode');
    if (this.blueData.isDemoActive) {
      this.blueData.stopDemo();
    } else {
      this.blueData.startDemo();
    }
    this.demoMode = this.blueData.isDemoActive;
  }
}
