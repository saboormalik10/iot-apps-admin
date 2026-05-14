import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChangeUnitsPage } from './change-units.page';

describe('ChangeUnitsPage', () => {
  let component: ChangeUnitsPage;
  let fixture: ComponentFixture<ChangeUnitsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ChangeUnitsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
