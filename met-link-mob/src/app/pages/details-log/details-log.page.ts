import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Platform, ModalController, NavController } from '@ionic/angular';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonInput,
  IonGrid,
  IonRow,
  IonCol,
  IonBackButton,
} from '@ionic/angular/standalone';
import { ActionSheetController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { BluetoothService } from 'src/app/services/bluedata.service';
import { SqliteService } from 'src/app/services/sqlite.service';
import { GlobalService } from 'src/app/services/global.service';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory, WriteFileResult } from '@capacitor/filesystem';
import moment from 'moment';
import { Toast } from '@capacitor/toast';
import { DetailsPicturesPage } from '../details-pictures/details-pictures.page';
import { Share } from '@capacitor/share';
import Swiper from 'swiper';
import Chart from 'chart.js/auto';
import { register } from 'swiper/element';
import { addIcons } from 'ionicons';
import { checkmarkDone, mail } from 'ionicons/icons';
import { ExportService } from '../../services/export.service';
register();

@Component({
  selector: 'app-details-log',
  templateUrl: './details-log.page.html',
  styleUrls: ['./details-log.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonIcon,
    IonItem,
    IonLabel,
    IonSelect,
    IonSelectOption,
    IonInput,
    IonGrid,
    IonRow,
    IonCol,
    IonBackButton,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  providers: [ModalController],
})
export class DetailsLogPage implements OnInit {
  private measure: any[] = [];
  public record: any;
  get theme(): string {
    return this.globalService.theme();
  }

  private myChart: any;
  private labels: any = [];
  private dataItems: any = [];
  public graphData: number = 0;
  private graphColors: any = [];
  public logItems: any = [];
  private logItemNums: any = [];
  private valuesToGraph: any = [];
  public photo: any[] = [];
  public comment: string = '';

  private pictures: any[] = [];
  private listId: any[] = [];
  private rootDir: string = Directory.Data; // Use Capacitor's Directory
  private subDir: string = '';
  private actionSheetController = inject(ActionSheetController);
  private router = inject(Router);

  private globalService = inject(GlobalService);

  constructor(
    private blueData: BluetoothService,
    private sqliteProvider: SqliteService,
    private platform: Platform,
    private modalController: ModalController,
    private route: ActivatedRoute,
    private navCtrl: NavController,
    private exportService: ExportService
  ) {
    // which types of data are allowed for the graphs?
    this.valuesToGraph = [
      'Wind speed',
      'Wind direction',
      'Pressure',
      'Current',
      'Voltage',
      'Humidity',
      'Temperature',
      'GPS height',
      'QFE',
      'QNH',
      'Dew point',
    ];

    this.globalService.initTheme();
    // theme is now a reactive Signal getter — no assignment needed

    addIcons({ checkmarkDone, mail });
    // Initialize empty arrays
    this.measure = [];
    this.labels = [];
    this.dataItems = [];
    this.graphColors = [];
    this.logItems = [];
    this.logItemNums = [];
    this.photo = [];
    this.pictures = [];
    this.listId = [];

    // Get subDir from Preferences (with localStorage fallback)
    Preferences.get({ key: 'saveDir' }).then(({ value }) => {
      this.subDir = value || localStorage.getItem('saveDir') || '';
    });
  }

  ngOnInit(): void {
    // Try router state first (new approach), then fall back to queryParams (old approach)
    const navState = this.router.getCurrentNavigation()?.extras?.state;
    if (navState?.['record']) {
      this.record = navState['record'];
      this.comment = this.record.comment || '';
      this.loadMeasure();
      this.getPhoto();
      return;
    }

    this.route.queryParams.subscribe((params) => {
      if (params && params['record']) {
        try {
          this.record = JSON.parse(params['record']);
          console.log('Record loaded:', this.record);
          this.comment = this.record.comment || '';
          this.loadMeasure();
          this.getPhoto();
        } catch (error) {
          console.error('Error parsing record:', error);
          this.showToast('Error loading record data');
        }
      } else {
        // Try window.history.state as fallback
        const historyRecord = window.history?.state?.record;
        if (historyRecord) {
          this.record = historyRecord;
          this.comment = this.record.comment || '';
          this.loadMeasure();
          this.getPhoto();
        } else {
          console.error('Error: record is not defined.');
          this.showToast('Error: No record data found');
        }
      }
    });
  }

  ionViewDidEnter() {
    console.log('ionViewDidEnter DetailsLogPage');
  }

  async loadMeasure() {
    console.log('loadMeasure');

    if (!this.record || !this.record.id_record) {
      console.error('Error: record is not defined or missing id_record.');
      return;
    }

    try {
      this.measure = await this.sqliteProvider.selectMeasure(
        this.record.id_record
      );
      console.log('Measures loaded:', this.measure);

      if (this.measure && this.measure.length > 0) {
        this.initGraphColors();
        this.initGraphs();
      } else {
        console.error('No measures found for record');
        this.showToast('No measurement data found');
      }
    } catch (error) {
      console.error('Error loading measures:', error);
      this.showToast('Error loading measurement data');
    }
  }

  initGraphs() {
    if (
      !this.measure ||
      this.measure.length < 2 ||
      !this.measure[0].dataSentence
    ) {
      console.error('Invalid measure data');
      return;
    }

    try {
      // Get header items from first measure
      const headerItems = this.measure[0].dataSentence.split(',');
      const extraInfo =
        this.measure.length > 1 && this.measure[1].dataSentence
          ? this.measure[1].dataSentence.split(',')
          : [];

      // Clear previous items
      this.logItems = [];
      this.logItemNums = [];

      for (let i = 0; i < headerItems.length; i++) {
        for (let k = 0; k < this.valuesToGraph.length; k++) {
          if (headerItems[i] === this.valuesToGraph[k]) {
            const unitInfo = extraInfo.length > i + 2 ? extraInfo[i + 2] : '';
            this.logItems.push(headerItems[i] + ' ' + unitInfo);
            this.logItemNums.push(i);
          }
        }
      }

      // Ensure we have data to display
      if (this.logItems.length > 0) {
        this.dataExtracter();
        setTimeout(() => this.graph(), 300); // Delay for canvas to be ready
      }
    } catch (error) {
      console.error('Error in initGraphs:', error);
    }
  }

  graph() {
    console.log('Creating graph');
    const canvas = <HTMLCanvasElement>document.getElementById('myChart');

    if (!canvas) {
      console.error('Canvas element not found');
      return;
    }

    try {
      // Simple Chart.js 3+ configuration
      const lineChartData = {
        labels: this.labels,
        datasets: this.logItems.map((item: any, i: number) => ({
          label: item,
          data: this.dataItems[i],
          backgroundColor: this.graphColors[i],
          borderColor: this.graphColors[i],
          fill: false,
          tension: 0.1,
          hidden: i !== 0,
        })),
      };

      if (this.myChart) {
        this.myChart.destroy();
      }

      this.myChart = new Chart(canvas, {
        type: 'line',
        data: lineChartData,
        options: {
          responsive: true,
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              mode: 'index',
              intersect: false,
            },
          },
        },
      });
    } catch (error) {
      console.error('Error creating chart:', error);
    }
  }

  dataExtracter() {
    console.log('extracting data for graph');

    if (!this.measure || this.measure.length < 2) {
      console.error('Not enough data for graph');
      return;
    }

    // Calculate how many points to show on graph
    const maxGraphFactor =
      this.measure.length >= 20 ? Math.round(this.measure.length / 20) : 1;

    // Initialize data arrays
    this.dataItems = [];
    this.labels = [];

    for (let i = 0; i < this.logItems.length; i++) {
      this.dataItems[i] = [];
    }

    let itemCnt = 0;
    for (
      let i = 0;
      i < this.measure.length - 1;
      i += maxGraphFactor, itemCnt++
    ) {
      if (!this.measure[i + 1] || !this.measure[i + 1].dataSentence) {
        continue;
      }

      const items = this.measure[i + 1].dataSentence.split(',');

      for (let k = 0; k < this.logItems.length; k++) {
        if (this.logItemNums[k] < items.length) {
          this.dataItems[k][itemCnt] = items[this.logItemNums[k]];
        }
      }

      this.labels[itemCnt] = i + 's';
    }
  }

  initGraphColors() {
    console.log('init graph colors');
    const colors = [
      'rgba(0,123,200,1)',
      'rgba(0,103,100,0.5)',
      'rgba(80,75,250,0.5)',
      'rgba(80,75,20,0.5)',
      'rgba(170,120,50,0.5)',
    ];

    this.graphColors = [];
    let colorCnt = 0;

    for (let i = 0; i < this.valuesToGraph.length; i++, colorCnt++) {
      if (colorCnt >= colors.length) {
        colorCnt = 0;
      }
      this.graphColors.push(colors[colorCnt]);
    }
  }

  selectData() {
    if (!this.myChart || !this.myChart.data || !this.myChart.data.datasets) {
      console.error('Chart not initialized');
      return;
    }

    for (let i = 0; i < this.logItems.length; i++) {
      if (this.myChart.data.datasets[i]) {
        this.myChart.data.datasets[i].hidden = true;
      }
    }

    if (this.myChart.data.datasets[this.graphData]) {
      this.myChart.data.datasets[this.graphData].hidden = false;
    }

    this.myChart.update();
  }

  async getPhoto() {
    try {
      this.photo = await this.sqliteProvider.selectPictureFromIDRecord(
        this.record.id_record
      );
      console.log('Photos loaded:', this.photo);
    } catch (error) {
      console.error('Error loading photos:', error);
    }
  }

  async phototapped(event: any) {
    console.log('phototapped');
    try {
      const modal = await this.modalController.create({
        component: DetailsPicturesPage,
        componentProps: {
          photo: this.photo,
          origi: 1,
        },
      });
      await modal.present();
    } catch (error) {
      console.error('Error showing photo modal:', error);
    }
  }

  saveComment() {
    if (!this.record || !this.record.id_record) {
      console.error('No record ID to save comment');
      return;
    }

    try {
      this.sqliteProvider.updateComment(this.record.id_record, this.comment);
      this.record.comment = this.comment;
      this.showToast('Comment saved');
    } catch (error) {
      console.error('Error saving comment:', error);
      this.showToast('Error saving comment');
    }
  }

  async presentActionSheet() {
    const actionSheet = await this.actionSheetController.create({
      header: 'Options',
      buttons: [
        {
          text: 'Delete',
          role: 'destructive',
          icon: 'trash',
          handler: () => {
            this.deleteRecord(this.record.id_record);
          },
        },
        {
          text: 'Export and Share',
          icon: 'share',
          handler: () => {
            this.exportRecord(this.record);
          },
        },
        // {
        //   text: 'Save to Local Folder',
        //   icon: 'download',
        //   handler: () => {
        //     this.writeFile(this.record);
        //   },
        // },
        {
          text: 'Send Email',
          icon: 'mail',
          handler: () => {
            this.sendEmail(this.record);
          },
        },
        {
          text: 'Cancel',
          role: 'cancel',
        },
      ],
    });
    await actionSheet.present();
  }

  deleteRecord(id_record: any) {
    if (confirm('Are you sure you want to delete this logging?')) {
      console.log('Deleting record:', id_record);
      this.sqliteProvider.deleteRecord(id_record);
      this.navCtrl.navigateBack('/view-record');
    } else {
      console.log('Deletion cancelled');
    }
  }

  createDatetime(date: any) {
    return moment(date).format('L') + ' ' + moment(date).format('LTS');
  }

  async exportRecord(record: any) {
    await this.exportService.exportAndShare(record);
  }

  // New method to share files using Capacitor's Share API
  async shareFile(fileResult: WriteFileResult, fileName: string) {
    try {
      await Share.share({
        title: 'MET-LINK Record',
        text: 'Exported data from MET-LINK app',
        url: fileResult.uri,
        dialogTitle: 'Share MET-LINK data',
      });
    } catch (error) {
      console.error('Error sharing file:', error);
      this.showToast('Error sharing file');
    }
  }

  // Update writeFile to use Capacitor
  async writeFile(record: any) {
    await this.exportService.saveToLocal(record, this.subDir);
  }

  async sendEmail(record: any) {
    await this.exportService.sendEmail(record);
  }

  // Helper method to show toasts
  async showToast(message: string) {
    await Toast.show({
      text: message,
      duration: 'long',
      position: 'center',
    });
  }

  // Helper method for debugging data
  testFunction(data: string | any[]) {
    for (let i = 0; i < data.length; i++) {
      console.log(JSON.stringify(data[i]));
    }
  }
}
