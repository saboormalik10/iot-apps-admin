import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, NavController } from '@ionic/angular';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { Directories } from '../../pipes/directories.pipe';
import { addIcons } from 'ionicons';
import { checkmark, folder, arrowBack } from 'ionicons/icons';

@Component({
  selector: 'app-dir-browser',
  templateUrl: './dir-browser.page.html',
  styleUrls: ['./dir-browser.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, Directories],
})
export class DirBrowserPage implements OnInit {
  public rootDirectory!: string;
  public saveDirectory!: string;
  public theme: any;
  public currDirectory: any[] = [];
  public currentDirectoryName: string = '';
  public customLocation: boolean = false;

  constructor(private navCtrl: NavController) {
    addIcons({ checkmark, folder, arrowBack });
    this.initializeDirectories();
  }

  ngOnInit() {
    console.log('DirBrowserPage Loaded');
  }

  async initializeDirectories() {
    const rootResult = await Preferences.get({ key: 'rootDir' });
    const saveResult = await Preferences.get({ key: 'saveDir' });
    this.rootDirectory = rootResult.value || Directory.Data;
    this.saveDirectory = saveResult.value || '';

    if (!this.rootDirectory) {
      this.rootDirectory = Directory.Data;
      await Preferences.set({ key: 'rootDir', value: this.rootDirectory });

      this.currentDirectoryName = 'MET-LINK';
    }

    if (this.saveDirectory) {
      const tempDir = this.saveDirectory.split('/');
      if (tempDir.length > 0) {
        this.currentDirectoryName = tempDir[tempDir.length - 1];
      }
    } else {
      this.customLocation = false;
    }

    console.log('Custom Location? ' + this.customLocation);
    console.log(
      'Root Directory: ' +
        this.rootDirectory +
        ', Save Directory: ' +
        this.saveDirectory
    );

    await this.listFiles();
  }

  async listFiles() {
    try {
      const result = await Filesystem.readdir({
        directory: Directory.Data, // Uses Capacitor's default data directory
        path: this.saveDirectory || '', // Root directory or subfolder
      });

      this.currDirectory = result.files.map((file) => ({
        name: file.name,
        isDirectory: false, // Capacitor does not provide directory info by default
      }));

      console.log('Current Directory Contents:', this.currDirectory);
    } catch (error) {
      console.error('Error listing directory:', error);
    }
  }

  goToPrevious() {
    console.log('Going to previous folder');

    if (this.saveDirectory.length > 0) {
      let tempDir = this.saveDirectory.split('/');
      tempDir.pop(); // Remove the last directory
      this.saveDirectory = tempDir.join('/');
      this.currentDirectoryName = tempDir.length
        ? tempDir[tempDir.length - 1]
        : '';
    } else {
      this.currentDirectoryName = '';
      this.saveDirectory = '';
      this.customLocation = false;
    }

    this.listFiles();
  }

  async cardTapped(data: any) {
    console.log('Tapped on:', data.name);

    if (data.name === 'appFolder') {
      this.rootDirectory = Directory.Data; // App's internal storage
      this.saveDirectory = '';
      this.customLocation = true;
      await Preferences.set({ key: 'typeOfMem', value: 'MET-LINK' });

      this.currentDirectoryName = 'MET-LINK';
    } else if (data.name === 'phoneFolder') {
      this.rootDirectory = Directory.External; // External storage (Android)
      this.saveDirectory = '';
      this.customLocation = true;
      await Preferences.set({ key: 'typeOfMem', value: 'phone' });

      this.currentDirectoryName = 'phone';
    } else {
      this.saveDirectory = this.saveDirectory
        ? `${this.saveDirectory}/${data.name}`
        : data.name;
      this.currentDirectoryName = data.name;
    }

    console.log(
      'Navigating to:',
      this.rootDirectory + '/' + this.saveDirectory
    );
    await this.listFiles();
  }

  async selectDir() {
    console.log('Selected Root:', this.rootDirectory);
    console.log('Selected Save:', this.saveDirectory);

    await Preferences.set({ key: 'rootDir', value: this.rootDirectory });
    await Preferences.set({ key: 'saveDir', value: this.saveDirectory });

    // Pop back to the page that launched the dir browser
    this.navCtrl.back();
  }
}
