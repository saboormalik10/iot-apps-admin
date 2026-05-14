import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LiveDataPage } from './live-data.page';

describe('LiveDataPage', () => {
  let component: LiveDataPage;
  let fixture: ComponentFixture<LiveDataPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(LiveDataPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
