import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AllDataPage } from './all-data.page';

describe('AllDataPage', () => {
  let component: AllDataPage;
  let fixture: ComponentFixture<AllDataPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AllDataPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
