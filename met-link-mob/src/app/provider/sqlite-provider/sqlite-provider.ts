import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
// import { SQLite } from '@awesome-cordova-plugins/sqlite/ngx';

import 'rxjs/add/operator/map';

@Injectable()
export class SqliteProvider {
  data: any;
  public storage: any;

  constructor(private http: HttpClient, public platform: Platform) {
    this.data = null;
    // this.storage = new SQLite();
  }

  createDatabase() { // Here we create all the tables which their fields if the database doesn't exist
    (<any>window).sqlitePlugin.openDatabase(
      { name: 'db.storage', location: 'default' },
      function (db: { executeSql: (arg0: string) => void }) {
        db.executeSql(
          'CREATE TABLE IF NOT EXISTS record (id_record INTEGER PRIMARY KEY AUTOINCREMENT, dateStart TEXT, dateEnd TEXT, comments TEXT, url_maps TEXT, deviceName TEXT)'
        );
        db.executeSql(
          'CREATE TABLE IF NOT EXISTS measure (id_measure INTEGER PRIMARY KEY AUTOINCREMENT, dataSentence TEXT, timeStamp TEXT, id_record INTEGER)'
        );
        db.executeSql(
          'CREATE TABLE IF NOT EXISTS picture (id_picture INTEGER PRIMARY KEY AUTOINCREMENT, data_picture TEXT, id_record INTEGER)'
        );
        console.log('creation ok');
      },
      function (error: any) {
        console.log('Open database ERROR: ' + JSON.stringify(error));
      }
    );
  }

  deleteDatabase() { // Allow us to delete the database with all the tables and the datas
    (<any>window).sqlitePlugin.openDatabase(
      { name: 'db.storage', location: 'default' },
      function (db: { executeSql: (arg0: string) => void }) {
        db.executeSql('DROP TABLE picture');
        db.executeSql('DROP TABLE measure');
        db.executeSql('DROP TABLE record');
        console.log('delete ok');
      },
      function (error: any) {
        console.log('Delete database ERROR: ' + JSON.stringify(error));
      }
    );
  }

  deleteRecord(
    id_record: any // Allow us to delete one record, we have to pass the record's number we want to delete
  ) {
    (<any>window).sqlitePlugin.openDatabase(
      { name: 'db.storage', location: 'default' },
      function (db: { executeSql: (arg0: string, arg1: any[]) => void }) {
        db.executeSql('DELETE FROM picture WHERE id_record=?', [id_record]);
        db.executeSql('DELETE FROM measure WHERE id_record=?', [id_record]);
        db.executeSql('DELETE FROM record WHERE id_record=?', [id_record]);
        console.log('delete row  ok');
      },
      function (error: any) {
        console.log('Delete row ERROR: ' + JSON.stringify(error));
      }
    );
  }

  insertRecord(
    dateStart: string,
    url_maps: string,
    deviceName: string // Allow us to insert a record we have to pass on argument the longitude and latitude the date of the begining of the record, the url of the map, to be able to display a map, and the device's name of the sensor
  ) {
    console.log('insertR ' + dateStart + ' - ' + url_maps + ' - ' + deviceName);
    (<any>window).sqlitePlugin.openDatabase(
      { name: 'db.storage', location: 'default' },
      function (db: {
        executeSql: (
          arg0: string,
          arg1: any[],
          arg2: (resultSet: any) => void,
          arg3: (error: any) => void
        ) => void;
      }) {
        db.executeSql(
          'INSERT OR REPLACE INTO record(dateStart, url_maps, deviceName) VALUES (?,?,?)',
          [dateStart, url_maps, deviceName],
          function (resultSet: { insertId: string; rowsAffected: string }) {
            console.log('resultSet.insertId: ' + resultSet.insertId);
            console.log('resultSet.rowsAffected: ' + resultSet.rowsAffected);
          },
          function (error: { message: string }) {
            console.error('INSERT RECORD: ' + error.message);
          }
        );
      },
      function (error: any) {
        console.error('INSERT RECORD ERROR: ' + JSON.stringify(error));
      }
    );
  }

  insertMeasure(
    dataSentence: string,
    timeStamp: string,
    id_record: string // Allow us to insert some measure for one record, we have to insert the range, the turbidity and the temperature, we have also add the longitude and latitude, to be able to follow the path followed by the sensor during the record
  ) {
    console.log('insertM ' + dataSentence + ' idRecord: ' + id_record);
    (<any>window).sqlitePlugin.openDatabase(
      { name: 'db.storage', location: 'default' },
      function (db: {
        executeSql: (
          arg0: string,
          arg1: any[],
          arg2: (resultSet: any) => void,
          arg3: (error: any) => void
        ) => void;
      }) {
        db.executeSql(
          'INSERT OR REPLACE INTO measure(dataSentence, timeStamp, id_record) VALUES (?,?,?) ',
          [dataSentence, timeStamp, id_record],
          function (resultSet: any) {},
          function (error: { message: string }) {
            console.error('INSERT MEASURE error: ' + error.message);
          }
        );
      },
      function (error: any) {
        console.error('INSERT MEASURE ERROR: ' + JSON.stringify(error));
      }
    );
  }

  insertPicture(
    base64Image: string,
    IdRecord: number | null // Allow us to insert a picture for an idea record choose
  ) {
    (<any>window).sqlitePlugin.openDatabase(
      { name: 'db.storage', location: 'default' },
      function (db: {
        executeSql: (
          arg0: string,
          arg1: any[],
          arg2: (resultSet: any) => void,
          arg3: (error: any) => void
        ) => void;
      }) {
        console.log('last id record:');
        console.log(IdRecord);
        if (IdRecord === null) {
          IdRecord = 0;
        }
        db.executeSql(
          'INSERT OR REPLACE INTO picture(data_picture, id_record) VALUES (?,?)',
          [base64Image, IdRecord],
          function (resultSet: { insertId: string; rowsAffected: string }) {
            console.log('resultSet.insertId: ' + resultSet.insertId);
            console.log('resultSet.rowsAffected: ' + resultSet.rowsAffected);
          },
          (error: { err: any }) => {
            console.log('INSERT PICTURE-> ' + JSON.stringify(error.err));
          }
        );
      },
      function (error: any) {
        console.log('INSERT PICTURE ERROR: ' + JSON.stringify(error));
      }
    );
  }

  selectLastIDRecord() { //Allow us to select the last id record inserted
    return new Promise((resolve) => {
      (<any>window).sqlitePlugin.openDatabase(
        { name: 'db.storage', location: 'default' },
        function (db: {
          executeSql: (
            arg0: string,
            arg1: never[],
            arg2: (data: any) => void,
            arg3: (error: any) => void
          ) => void;
        }) {
          db.executeSql(
            'SELECT MAX(id_record) FROM record',
            [],
            function (data: {
              rows: {
                item: (arg0: number) => {
                  (): any;
                  new (): any;
                  [x: string]: unknown;
                };
              };
            }) {
              resolve(data.rows.item(0)['MAX(id_record)']);
            },
            function (error: { message: string }) {
              console.log('SELECT LASTID RECORD error: ' + error.message);
            }
          );
        },
        function (error: any) {
          console.log('SELECT LASTID RECORD ERROR: ' + JSON.stringify(error));
        }
      );
    });
  }

  selectLastIDPicture() { // Allow us to select the last id picture inserted
    return new Promise((resolve) => {
      (<any>window).sqlitePlugin.openDatabase(
        { name: 'db.storage', location: 'default' },
        function (db: {
          executeSql: (
            arg0: string,
            arg1: never[],
            arg2: (data: any) => void,
            arg3: (error: any) => void
          ) => void;
        }) {
          db.executeSql(
            'SELECT MAX(id_picture) FROM picture',
            [],
            function (data: {
              rows: {
                item: (arg0: number) => {
                  (): any;
                  new (): any;
                  [x: string]: unknown;
                };
              };
            }) {
              resolve(data.rows.item(0)['MAX(id_picture)']);
            },
            function (error: { message: string }) {
              console.log('SELECT LASTID picture error: ' + error.message);
            }
          );
        },
        function (error: any) {
          console.log('SELECT LASTID picture ERROR: ' + JSON.stringify(error));
        }
      );
    });
  }

  selectAllRecord() { // Allow us to select all the record inserted into the database
    return new Promise((resolve) => {
      (<any>window).sqlitePlugin.openDatabase(
        { name: 'db.storage', location: 'default' },
        function (db: {
          executeSql: (
            arg0: string,
            arg1: never[],
            arg2: (data: any) => void,
            arg3: (error: any) => void
          ) => void;
        }) {
          db.executeSql(
            'SELECT * FROM record ORDER BY id_record DESC',
            [],
            function (data: {
              rows: {
                length: number;
                item: (arg0: number) => {
                  (): any;
                  new (): any;
                  id_record: any;
                  dateStart: any;
                  url_maps: any;
                  comments: any;
                  deviceName: any;
                };
              };
            }) {
              var records = [];
              if (data.rows.length > 0) {
                for (var i = 0; i < data.rows.length; i++) {
                  records.push({
                    id_record: data.rows.item(i).id_record,
                    dateStart: data.rows.item(i).dateStart,
                    url_maps: data.rows.item(i).url_maps,
                    comment: data.rows.item(i).comments,
                    deviceName: data.rows.item(i).deviceName,
                  });
                }
              }
              resolve(records);
            },
            function (error: { message: string }) {
              console.log('SELECT ALL RECORD error: ' + error.message);
            }
          );
        },
        function (error: any) {
          console.log('SELECT ALL RECORD ERROR: ' + JSON.stringify(error));
        }
      );
    });
  }

  selectMeasure(
    id_record: any // Allow us to select all the measure for one id record
  ) {
    return new Promise((resolve) => {
      (<any>window).sqlitePlugin.openDatabase(
        { name: 'db.storage', location: 'default' },
        function (db: {
          executeSql: (
            arg0: string,
            arg1: any[],
            arg2: (data: any) => void,
            arg3: (error: any) => void
          ) => void;
        }) {
          db.executeSql(
            'SELECT * FROM measure WHERE id_record=?',
            [id_record],
            function (data: {
              rows: {
                length: number;
                item: (arg0: number) => {
                  (): any;
                  new (): any;
                  id_measure: any;
                  dataSentence: any;
                  timeStamp: any;
                  id_record: any;
                };
              };
            }) {
              var measures = [];
              if (data.rows.length > 0) {
                for (var i = 0; i < data.rows.length; i++) {
                  measures.push({
                    id_measure: data.rows.item(i).id_measure,
                    dataSentence: data.rows.item(i).dataSentence,
                    timeStamp: data.rows.item(i).timeStamp,
                    id_record: data.rows.item(i).id_record,
                  });
                }
              }
              resolve(measures);
            },
            function (error: { message: string }) {
              console.log('SELECT MEASURE error: ' + error.message);
            }
          );
        },
        function (error: any) {
          console.log('SELECT MEASURE ERROR: ' + JSON.stringify(error));
        }
      );
    });
  }

  selectPictureFromIDRecord(
    id_record: any // Allow us to select all the pictures for aan id record
  ) {
    return new Promise((resolve) => {
      (<any>window).sqlitePlugin.openDatabase(
        { name: 'db.storage', location: 'default' },
        function (db: {
          executeSql: (
            arg0: string,
            arg1: any[],
            arg2: (data: any) => void,
            arg3: (error: any) => void
          ) => void;
        }) {
          db.executeSql(
            'SELECT data_picture FROM picture WHERE id_record=?',
            [id_record],
            function (data: {
              rows: {
                length: number;
                item: (arg0: number) => {
                  (): any;
                  new (): any;
                  data_picture: any;
                };
              };
            }) {
              var photo = [];
              console.log(data);
              if (data.rows.length > 0) {
                for (var i = 0; i < data.rows.length; i++) {
                  photo.push({
                    base64: data.rows.item(i).data_picture,
                  });
                }
              }
              resolve(photo);
            },
            function (error: { message: string }) {
              console.log('SELECT PictureFromIdRecord error: ' + error.message);
            }
          );
        },
        function (error: any) {
          console.log(
            'SELECT PictureFromIdRecord ERROR: ' + JSON.stringify(error)
          );
        }
      );
    });
  }

  selectIdpictureFromIDRecord(id_record: any) {
    return new Promise((resolve) => {
      (<any>window).sqlitePlugin.openDatabase(
        { name: 'db.storage', location: 'default' },
        function (db: {
          executeSql: (
            arg0: string,
            arg1: any[],
            arg2: (data: any) => void,
            arg3: (error: any) => void
          ) => void;
        }) {
          db.executeSql(
            'SELECT id_picture FROM picture WHERE id_record=?',
            [id_record],
            function (data: {
              rows: {
                length: number;
                item: (arg0: number) => {
                  (): any;
                  new (): any;
                  id_picture: any;
                };
              };
            }) {
              var photo = [];
              console.log(data);
              if (data.rows.length > 0) {
                for (var i = 0; i < data.rows.length; i++) {
                  photo.push({
                    id_picture: data.rows.item(i).id_picture,
                  });
                }
              }
              resolve(photo);
            },
            function (error: { message: string }) {
              console.log(
                'SELECT IdpictureFromIdRecord error: ' + error.message
              );
            }
          );
        },
        function (error: any) {
          console.log(
            'SELECT IdpictureFromIdRecord ERROR: ' + JSON.stringify(error)
          );
        }
      );
    });
  }

  selectCommentFromIdRecord(id_record: any) {
    console.log('select comment from id record');
    return new Promise((resolve) => {
      (<any>window).sqlitePlugin.openDatabase(
        { name: 'db.storage', location: 'default' },
        function (db: {
          executeSql: (
            arg0: string,
            arg1: any[],
            arg2: (data: any) => void,
            arg3: (error: any) => void
          ) => void;
        }) {
          db.executeSql(
            'SELECT comment FROM record WHERE id_record=?',
            [id_record],
            function (data: { comment: any }) {
              var comment = data.comment;
              alert('obj com');
              alert(data);
              resolve(comment);
            },
            function (error: { message: string }) {
              console.log('SELECT ALL RECORD error: ' + error.message);
            }
          );
        },
        function (error: any) {
          console.log('SELECT ALL RECORD ERROR: ' + JSON.stringify(error));
        }
      );
    });
  }

  selectPicture() {
    return new Promise((resolve) => {
      (<any>window).sqlitePlugin.openDatabase(
        { name: 'db.storage', iosDatabaseLocation: 'Library' },
        function (db: {
          executeSql: (
            arg0: string,
            arg1: never[],
            arg2: (data: any) => void,
            arg3: (error: any) => void
          ) => void;
        }) {
          db.executeSql(
            'SELECT * FROM PICTURE',
            [],
            function (data: unknown) {
              resolve(data);
            },
            function (error: { message: string }) {
              console.log('SELECT PICTURE error: ' + error.message);
            }
          );
        },
        function (error: any) {
          console.log('SELECT PICTURE ERROR: ' + JSON.stringify(error));
        }
      );
    });
  }

  updateComment(idRecord: any, comment: any) {
    console.log('insert comment');
    console.log(idRecord);
    console.log(comment);
    (<any>window).sqlitePlugin.openDatabase(
      { name: 'db.storage', location: 'default' },
      function (db: {
        executeSql: (
          arg0: string,
          arg1: any[],
          arg2: (resultSet: any) => void,
          arg3: (error: any) => void
        ) => void;
      }) {
        db.executeSql(
          'UPDATE record SET comments=? WHERE id_record=?',
          [comment, idRecord],
          function (resultSet: any) {},
          function (error: { message: string }) {
            console.log('INSERT MEASURE error: ' + error.message);
          }
        );
      },
      function (error: any) {
        console.log('INSERT MEASURE ERROR: ' + JSON.stringify(error));
      }
    );
  }

  updateDateEnd(
    idRecord: any,
    dateEnd: string //Update the date of the end of the record
  ) {
    console.log('insert comment');
    console.log(idRecord);
    console.log(dateEnd);
    (<any>window).sqlitePlugin.openDatabase(
      { name: 'db.storage', location: 'default' },
      function (db: {
        executeSql: (
          arg0: string,
          arg1: any[],
          arg2: (resultSet: any) => void,
          arg3: (error: any) => void
        ) => void;
      }) {
        db.executeSql(
          'UPDATE record SET dateEnd=? WHERE id_record=?',
          [dateEnd, idRecord],
          function (resultSet: any) {},
          function (error: { message: string }) {
            console.log('UPDATE DATEend error: ' + error.message);
          }
        );
      },
      function (error: any) {
        console.log('UPDATE DATEend error: ' + JSON.stringify(error));
      }
    );
  }
}
