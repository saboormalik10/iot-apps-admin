import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LoggingPage } from './logging.page';

describe('LoggingPage', () => {
  let component: LoggingPage;
  let fixture: ComponentFixture<LoggingPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(LoggingPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
