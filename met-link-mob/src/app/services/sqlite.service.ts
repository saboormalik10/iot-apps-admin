import { Injectable } from '@angular/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import { Platform } from '@ionic/angular/standalone';
import { Capacitor } from '@capacitor/core';

// ─── Schema version: bump this number when you change the schema ──────────────
const DB_NAME = 'db.storage';
const DB_VERSION = 1;

@Injectable({
  providedIn: 'root',
})
export class SqliteService {
  private sqlite: SQLiteConnection;
  private db!: SQLiteDBConnection;

  /**
   * Single promise that resolves when the database is ready.
   * Every public method awaits this before touching `this.db`.
   */
  private readyPromise: Promise<void>;
  private resolveReady!: () => void;

  constructor(private platform: Platform) {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);

    // Readiness gate — resolved by createDatabase() on native platforms only.
    // On web this promise is resolved immediately (no-op: DB is never opened).
    this.readyPromise = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });

    // On native, init as soon as the platform is ready.
    // On web we skip entirely — SQLite is not available in the browser.
    this.platform.ready().then(async () => {
      if (Capacitor.isNativePlatform()) {
        await this.createDatabase();
      } else {
        // Resolve immediately so callers don't block forever on web.
        this.resolveReady();
      }
    });
  }

  // ─── Readiness gate ─────────────────────────────────────────────────────────

  /** Await this in every public method before accessing `this.db`. */
  private waitForReady(): Promise<void> {
    return this.readyPromise;
  }

  // ─── Web guard ───────────────────────────────────────────────────────────────

  /** Returns true when running on a native device with SQLite available. */
  get isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  // ─── Schema creation ────────────────────────────────────────────────────────

  /**
   * Creates the SQLite connection and ensures all tables exist.
   * Safe to call multiple times — it's idempotent.
   */
  async createDatabase(): Promise<void> {
    // Native-only: skip on web.
    if (!this.isNative) {
      this.resolveReady();
      return;
    }
    // Guard: if already open, do nothing.
    if (this.db) return;

    try {
      const db = await this.sqlite.createConnection(
        DB_NAME,
        false, // encrypted
        'no-encryption',
        DB_VERSION,
        false // readonly
      );

      await db.open();

      // All tables use IF NOT EXISTS so this is safe to replay on upgrade.
      await db.execute(`
        CREATE TABLE IF NOT EXISTS record (
          id_record   INTEGER PRIMARY KEY AUTOINCREMENT,
          dateStart   TEXT,
          dateEnd     TEXT,
          comments    TEXT,
          url_maps    TEXT,
          deviceName  TEXT
        );
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS measure (
          id_measure    INTEGER PRIMARY KEY AUTOINCREMENT,
          dataSentence  TEXT,
          timeStamp     TEXT,
          id_record     INTEGER
        );
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS picture (
          id_picture    INTEGER PRIMARY KEY AUTOINCREMENT,
          data_picture  TEXT,
          id_record     INTEGER
        );
      `);

      this.db = db;
      this.resolveReady(); // ← unblocks every pending public-method call
      console.log('[SqliteService] Database ready on', Capacitor.getPlatform());
    } catch (error) {
      console.error('[SqliteService] createDatabase failed:', error);
      // Do NOT resolve the promise — callers will wait (and eventually timeout in UI)
    }
  }

  // ─── Write operations ───────────────────────────────────────────────────────

  async insertRecord(
    dateStart: string,
    url_maps: string,
    deviceName: string
  ): Promise<number> {
    await this.waitForReady();
    try {
      const result = await this.db.run(
        'INSERT INTO record(dateStart, url_maps, deviceName) VALUES (?,?,?)',
        [dateStart, url_maps, deviceName]
      );
      return result.changes?.lastId ?? 0;
    } catch (error) {
      console.error('[SqliteService] insertRecord failed:', error);
      throw error;
    }
  }

  async insertMeasure(
    dataSentence: string,
    timeStamp: string,
    id_record: number
  ): Promise<void> {
    await this.waitForReady();
    try {
      await this.db.run(
        'INSERT INTO measure(dataSentence, timeStamp, id_record) VALUES (?,?,?)',
        [dataSentence, timeStamp, id_record]
      );
    } catch (error) {
      console.error('[SqliteService] insertMeasure failed:', error);
    }
  }

  async insertPicture(base64Image: string, idRecord: number): Promise<void> {
    await this.waitForReady();
    if (!idRecord) idRecord = 0;
    try {
      await this.db.run(
        'INSERT INTO picture(data_picture, id_record) VALUES (?,?)',
        [base64Image, idRecord]
      );
    } catch (error) {
      console.error('[SqliteService] insertPicture failed:', error);
    }
  }

  async updateComment(idRecord: number, comment: string): Promise<void> {
    await this.waitForReady();
    try {
      await this.db.run('UPDATE record SET comments=? WHERE id_record=?', [
        comment,
        idRecord,
      ]);
    } catch (error) {
      console.error('[SqliteService] updateComment failed:', error);
    }
  }

  async updateDateEnd(idRecord: number, dateEnd: string): Promise<void> {
    await this.waitForReady();
    try {
      await this.db.run('UPDATE record SET dateEnd=? WHERE id_record=?', [
        dateEnd,
        idRecord,
      ]);
    } catch (error) {
      console.error('[SqliteService] updateDateEnd failed:', error);
    }
  }

  async deleteRecord(id_record: number): Promise<void> {
    await this.waitForReady();
    try {
      await this.db.run('DELETE FROM picture WHERE id_record=?', [id_record]);
      await this.db.run('DELETE FROM measure WHERE id_record=?', [id_record]);
      await this.db.run('DELETE FROM record WHERE id_record=?', [id_record]);
    } catch (error) {
      console.error('[SqliteService] deleteRecord failed:', error);
      throw error;
    }
  }

  async deleteDatabase(): Promise<void> {
    await this.waitForReady();
    for (const stmt of [
      'DROP TABLE IF EXISTS picture',
      'DROP TABLE IF EXISTS measure',
      'DROP TABLE IF EXISTS record',
    ]) {
      await this.db.execute(stmt);
    }
  }

  // ─── Read operations ────────────────────────────────────────────────────────

  async selectAllRecord(): Promise<any[]> {
    await this.waitForReady();
    try {
      const result = await this.db.query(
        'SELECT * FROM record ORDER BY id_record DESC'
      );
      return (result.values ?? []).map((row) => ({
        id_record: row.id_record,
        dateStart: row.dateStart,
        url_maps: row.url_maps,
        comment: row.comments,
        deviceName: row.deviceName,
      }));
    } catch (error) {
      console.error('[SqliteService] selectAllRecord failed:', error);
      return [];
    }
  }

  async selectMeasure(id_record: number): Promise<any[]> {
    await this.waitForReady();
    try {
      const result = await this.db.query(
        'SELECT * FROM measure WHERE id_record=? ORDER BY id_measure ASC',
        [id_record]
      );
      return (result.values ?? []).map((row: any) => ({
        id_measure: row.id_measure,
        dataSentence: row.dataSentence,
        timeStamp: row.timeStamp,
        id_record: row.id_record,
      }));
    } catch (error) {
      console.error('[SqliteService] selectMeasure failed:', error);
      throw error;
    }
  }

  async selectPictureFromIDRecord(id_record: number): Promise<any[]> {
    await this.waitForReady();
    try {
      const result = await this.db.query(
        'SELECT data_picture FROM picture WHERE id_record=?',
        [id_record]
      );
      return (result.values ?? []).map((row: any) => ({
        base64: row.data_picture,
      }));
    } catch (error) {
      console.error('[SqliteService] selectPictureFromIDRecord failed:', error);
      throw error;
    }
  }

  async selectIdpictureFromIDRecord(id_record: number): Promise<any[]> {
    await this.waitForReady();
    try {
      const result = await this.db.query(
        'SELECT id_picture FROM picture WHERE id_record=?',
        [id_record]
      );
      return (result.values ?? []).map((row: any) => ({
        id_picture: row.id_picture,
      }));
    } catch (error) {
      console.error(
        '[SqliteService] selectIdpictureFromIDRecord failed:',
        error
      );
      throw error;
    }
  }

  async selectCommentFromIdRecord(id_record: number): Promise<string> {
    await this.waitForReady();
    try {
      const result = await this.db.query(
        'SELECT comments FROM record WHERE id_record=?',
        [id_record]
      );
      return result.values?.[0]?.comments ?? '';
    } catch (error) {
      console.error('[SqliteService] selectCommentFromIdRecord failed:', error);
      return '';
    }
  }

  async selectLastIDRecord(): Promise<number> {
    await this.waitForReady();
    try {
      const result = await this.db.query(
        'SELECT MAX(id_record) as maxId FROM record'
      );
      return result.values?.[0]?.maxId ?? 0;
    } catch (error) {
      console.error('[SqliteService] selectLastIDRecord failed:', error);
      throw error;
    }
  }

  async selectLastIDPicture(): Promise<number> {
    await this.waitForReady();
    try {
      const result = await this.db.query(
        'SELECT MAX(id_picture) as maxId FROM picture'
      );
      return result.values?.[0]?.maxId ?? 0;
    } catch (error) {
      console.error('[SqliteService] selectLastIDPicture failed:', error);
      throw error;
    }
  }

  async selectPicture(): Promise<any> {
    await this.waitForReady();
    try {
      return await this.db.query('SELECT * FROM picture');
    } catch (error) {
      console.error('[SqliteService] selectPicture failed:', error);
      throw error;
    }
  }

  // ─── Status ─────────────────────────────────────────────────────────────────

  isReady(): boolean {
    return !!this.db;
  }

  async getConnection(): Promise<SQLiteDBConnection> {
    await this.waitForReady();
    return this.db;
  }
}
