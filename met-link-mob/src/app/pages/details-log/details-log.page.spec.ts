import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DetailsLogPage } from './details-log.page';

describe('DetailsLogPage', () => {
  let component: DetailsLogPage;
  let fixture: ComponentFixture<DetailsLogPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(DetailsLogPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
