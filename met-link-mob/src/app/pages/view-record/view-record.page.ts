import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  IonList,
  IonCard,
  IonItem,
  IonLabel,
  IonMenuButton,
  IonSpinner,
  ActionSheetController,
  AlertController,
} from '@ionic/angular/standalone';
import { SqliteService } from '../../services/sqlite.service';
import { addIcons } from 'ionicons';
import {
  menuOutline,
  ellipsisVertical,
  trashOutline,
  shareOutline,
  downloadOutline,
  createOutline,
  mailOutline,
} from 'ionicons/icons';
import { ModalController } from '@ionic/angular/standalone';
import moment from 'moment';
import { BluetoothService } from 'src/app/services/bluedata.service';
import { GlobalService } from 'src/app/services/global.service';
import { ExportService } from '../../services/export.service';

@Component({
  selector: 'app-view-record',
  templateUrl: './view-record.page.html',
  styleUrls: ['./view-record.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonIcon,
    IonList,
    IonCard,
    IonItem,
    IonLabel,
    IonMenuButton,
    IonSpinner,
  ],
})
export class ViewRecordPage implements OnInit {
  // ── Signals ──────────────────────────────────────────────────────────────────
  readonly records = signal<any[]>([]);
  readonly isLoading = signal(false);

  readonly recordsCount = computed(() => this.records().length);
  readonly hasRecords = computed(() => this.records().length > 0);

  // ── Services ─────────────────────────────────────────────────────────────────
  private readonly globalService = inject(GlobalService);
  private readonly sqliteService = inject(SqliteService);
  private readonly bluetoothService = inject(BluetoothService);
  private readonly exportService = inject(ExportService);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertController = inject(AlertController);
  private readonly router = inject(Router);

  // ── Derived ──────────────────────────────────────────────────────────────────
  get theme(): string {
    return this.globalService.theme();
  }

  constructor() {
    addIcons({
      menuOutline,
      ellipsisVertical,
      trashOutline,
      shareOutline,
      downloadOutline,
      createOutline,
      mailOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    // Nothing needed here — data is loaded fresh in ionViewDidEnter.
  }

  ionViewDidEnter(): void {
    this.loadRecords();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Data loading
  // ─────────────────────────────────────────────────────────────────────────────

  private async loadRecords(): Promise<void> {
    this.isLoading.set(true);
    try {
      const data = await this.sqliteService.selectAllRecord();
      this.records.set(data ?? []);
    } catch (error) {
      console.error('[ViewRecordPage] loadRecords failed:', error);
      await this.globalService.showToast('Failed to load records.');
    } finally {
      this.isLoading.set(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Navigation
  // ─────────────────────────────────────────────────────────────────────────────

  cardTapped(record: any): void {
    this.router.navigate(['/details-log'], { state: { record } });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────────────────────

  async presentActionSheet(record: any): Promise<void> {
    const sheet = await this.actionSheetController.create({
      header: 'Record Options',
      buttons: [
        {
          text: 'Delete',
          role: 'destructive',
          icon: 'trash-outline',
          handler: () => this.confirmAndDelete(record.id_record),
        },
        {
          text: 'Export & Share',
          icon: 'share-outline',
          handler: () => this.exportService.exportAndShare(record),
        },
        {
          text: 'Save to Files',
          icon: 'download-outline',
          handler: () => this.saveLocally(record),
        },
        {
          text: 'Send Email',
          icon: 'mail-outline',
          handler: () => this.exportService.sendEmail(record),
        },
        {
          text: 'Edit Comment',
          icon: 'create-outline',
          handler: () => this.editComment(record),
        },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async confirmAndDelete(id: number): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Delete Record',
      message: 'This action cannot be undone. Continue?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            try {
              await this.sqliteService.deleteRecord(id);
              // Update signal in-place — no full reload needed.
              this.records.update((list) =>
                list.filter((r) => r.id_record !== id)
              );
              await this.globalService.showToast('Record deleted.');
            } catch {
              await this.globalService.showToast('Could not delete record.');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  private async saveLocally(record: any): Promise<void> {
    const subDir = (await this.bluetoothService.getPreference('saveDir')) ?? '';
    await this.exportService.saveToLocal(record, subDir);
  }

  private async editComment(record: any): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Edit Comment',
      inputs: [
        {
          name: 'comment',
          type: 'textarea',
          placeholder: 'Enter a comment…',
          value: record.comment ?? '',
        },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: async (data) => {
            try {
              await this.sqliteService.updateComment(
                record.id_record,
                data.comment
              );
              // Keep the signal consistent without a round-trip to SQLite.
              this.records.update((list) =>
                list.map((r) =>
                  r.id_record === record.id_record
                    ? { ...r, comment: data.comment }
                    : r
                )
              );
              await this.globalService.showToast('Comment saved.');
            } catch {
              await this.globalService.showToast('Could not save comment.');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /** Format a timestamp string for display (locale-aware). */
  formatDate(date: string): string {
    return `${moment(date).format('L')} ${moment(date).format('LTS')}`;
  }

  goToConfig(): void {
    this.globalService.goToConfig();
  }
}
