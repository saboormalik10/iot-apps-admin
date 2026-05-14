import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DetailsPicturesPage } from './details-pictures.page';

describe('DetailsPicturesPage', () => {
  let component: DetailsPicturesPage;
  let fixture: ComponentFixture<DetailsPicturesPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(DetailsPicturesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
