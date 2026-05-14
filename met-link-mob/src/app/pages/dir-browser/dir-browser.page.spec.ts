import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DirBrowserPage } from './dir-browser.page';

describe('DirBrowserPage', () => {
  let component: DirBrowserPage;
  let fixture: ComponentFixture<DirBrowserPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(DirBrowserPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
