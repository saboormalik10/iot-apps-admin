import { Injectable } from '@angular/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Toast } from '@capacitor/toast';
import { SqliteService } from './sqlite.service';
import { EmailComposer } from 'capacitor-email-composer';

@Injectable({
  providedIn: 'root',
})
export class ExportService {
  constructor(private sqliteService: SqliteService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /** Build a CSV string from all measurements of a record. */
  private async buildCsv(record: any): Promise<string> {
    const measures = await this.sqliteService.selectMeasure(record.id_record);

    if (!measures || measures.length === 0) {
      throw new Error('No measurement data found for this record.');
    }

    // Row 0 is the header sentence; rows 1-N are data rows.
    const header = `Timestamp,${measures[0].dataSentence},Comment:,${
      record.comment ?? ''
    }\n`;
    const rows = measures
      .slice(1)
      .map((m) => `${m.timeStamp},${m.dataSentence}`)
      .join('\n');

    return header + rows;
  }

  /**
   * Generate a filesystem-safe filename from the record's start timestamp.
   * e.g. "record_12_31_2024_09_30_00.csv"
   */
  private buildFileName(dateStart: string): string {
    const [datePart, timePart = ''] = dateStart.split(' ');
    const safeDate = datePart.replace(/\//g, '_');
    const safeTime = timePart.replace(/:/g, '_');
    return `record_${safeDate}${safeTime ? '_' + safeTime : ''}.csv`;
  }

  /** Encode a UTF-8 string to base64 safely — handles non-ASCII characters. */
  private safeBase64Encode(text: string): string {
    // TextEncoder → Uint8Array → binary string → btoa
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    let binary = '';
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary);
  }

  private async showToast(message: string): Promise<void> {
    await Toast.show({ text: message, duration: 'long', position: 'bottom' });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Export a record as CSV and open the system share sheet.
   * Works on both iOS and Android via Capacitor Share plugin.
   */
  async exportAndShare(record: any): Promise<void> {
    try {
      const fileName = this.buildFileName(record.dateStart);
      const csv = await this.buildCsv(record);

      // Write to cache — Share plugin needs a local URI.
      const { uri } = await Filesystem.writeFile({
        path: fileName,
        data: csv,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });

      await Share.share({
        title: 'MET-LINK Record',
        text: 'MET-LINK sensor log export',
        url: uri,
        dialogTitle: 'Share MET-LINK data',
      });
    } catch (error: any) {
      const msg = error?.message ?? String(error);
      console.error('[ExportService] exportAndShare failed:', msg);
      await this.showToast(`Could not export: ${msg}`);
    }
  }

  /**
   * Save the CSV to the user-visible Documents folder.
   *   iOS  → <App sandbox>/Documents/  (visible in Files.app)
   *   Android → /sdcard/Documents/ (accessible via Files app)
   */
  async saveToLocal(record: any, subDir: string = ''): Promise<void> {
    try {
      const fileName = this.buildFileName(record.dateStart);
      const csv = await this.buildCsv(record);
      const path = subDir ? `${subDir}/${fileName}` : fileName;

      await Filesystem.writeFile({
        path,
        data: csv,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true, // create subDir if needed
      });

      const { uri } = await Filesystem.getUri({
        directory: Directory.Documents,
        path,
      });

      console.log('[ExportService] File saved to:', uri);
      await this.showToast(`Saved: ${fileName}`);
    } catch (error: any) {
      const msg = error?.message ?? String(error);
      console.error('[ExportService] saveToLocal failed:', msg);
      await this.showToast(`Could not save file: ${msg}`);
    }
  }

  /**
   * Open the device email composer with the CSV attached and any logged images
   * as inline attachments. Falls back to system Share if no email account is set up.
   */
  async sendEmail(record: any): Promise<void> {
    try {
      const { hasAccount } = await EmailComposer.hasAccount();
      if (!hasAccount) {
        console.warn(
          '[ExportService] No email account configured — falling back to Share.'
        );
        return this.exportAndShare(record);
      }

      const fileName = this.buildFileName(record.dateStart);
      const csv = await this.buildCsv(record);
      const csvBase64 = this.safeBase64Encode(csv); // safe for non-ASCII sensor values

      const attachments: any[] = [
        { type: 'base64', path: csvBase64, name: fileName },
      ];

      // Attach any photos stored against this record.
      const pictures = await this.sqliteService.selectPictureFromIDRecord(
        record.id_record
      );
      for (let i = 0; i < (pictures?.length ?? 0); i++) {
        let imageData: string = pictures[i].base64 ?? '';
        if (!imageData) continue;

        // Strip the data-URI prefix if present ("data:image/jpeg;base64,…")
        const commaIdx = imageData.indexOf(',');
        if (commaIdx !== -1) imageData = imageData.slice(commaIdx + 1);

        attachments.push({
          type: 'base64',
          path: imageData,
          name: `photo_${record.id_record}_${i + 1}.jpg`,
        });
      }

      await EmailComposer.open({
        to: [],
        subject: 'MET-LINK — sensor log export',
        body: `
          <h3>MET-LINK Data Export</h3>
          <p>Please find the attached sensor log from your MET-LINK device.</p>
          <p><strong>Record start:</strong> ${record.dateStart}</p>
          <p><strong>Device:</strong> ${record.deviceName ?? 'N/A'}</p>
          ${
            pictures?.length
              ? `<p><strong>Photos attached:</strong> ${pictures.length}</p>`
              : ''
          }
        `.trim(),
        isHtml: true,
        attachments,
      });
    } catch (error: any) {
      const msg = error?.message ?? String(error);
      console.error('[ExportService] sendEmail failed:', msg);

      // Last-resort fallback: open the Share sheet so data is never lost.
      try {
        await this.exportAndShare(record);
      } catch {
        await this.showToast('Could not send email or share the file.');
      }
    }
  }
}
