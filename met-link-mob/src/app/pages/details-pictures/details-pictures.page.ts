import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { ActivatedRoute } from '@angular/router';
import { SqliteService } from 'src/app/services/sqlite.service';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';


@Component({
  selector: 'app-details-pictures',
  templateUrl: './details-pictures.page.html',
  styleUrls: ['./details-pictures.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class DetailsPicturesPage implements OnInit {

  selectedItem: any;
  empty: any;
  id: any;
  photo: any;
  private record: any;
  origi: any;

  constructor(
    private route: ActivatedRoute,
    private sqliteProvider: SqliteService,
    private modalController: ModalController
  ) {
    addIcons({ close });
    console.log("Detail picture modal opened");

    // Get parameters from modal or navigation
    this.route.queryParams.subscribe(params => {
      this.origi = params['origi'];

      if (this.origi === '1') {
        console.log("Photo Mode");
        this.photo = params['photo'];
        console.log(this.photo);
      } else {
        console.log("Map Mode");
        this.record = params['record'];
        this.photo = this.record;
        console.log(this.record);
      }
    });
  }
  ngOnInit(): void {
  }

  close() {
    this.modalController.dismiss();
  }
}
