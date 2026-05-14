import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ViewRecordPage } from './view-record.page';

describe('ViewRecordPage', () => {
  let component: ViewRecordPage;
  let fixture: ComponentFixture<ViewRecordPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ViewRecordPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
