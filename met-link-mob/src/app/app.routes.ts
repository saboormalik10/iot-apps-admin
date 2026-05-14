import { Routes } from '@angular/router';
import { LiveDataPage } from './pages/live-data/live-data.page';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'devices',
    pathMatch: 'full',
  },
  {
    path: 'about',
    loadComponent: () =>
      import('./pages/about/about.page').then((m) => m.AboutPage),
  },
  {
    path: 'change-units',
    loadComponent: () =>
      import('./pages/change-units/change-units.page').then(
        (m) => m.ChangeUnitsPage
      ),
  },
  {
    path: 'configuration',
    loadComponent: () =>
      import('./pages/configuration/configuration.page').then(
        (m) => m.ConfigurationPage
      ),
  },
  {
    path: 'details-log',
    loadComponent: () =>
      import('./pages/details-log/details-log.page').then(
        (m) => m.DetailsLogPage
      ),
  },
  {
    path: 'details-pictures',
    loadComponent: () =>
      import('./pages/details-pictures/details-pictures.page').then(
        (m) => m.DetailsPicturesPage
      ),
  },
  {
    path: 'devices',
    loadComponent: () =>
      import('./pages/devices/devices.page').then((m) => m.DevicesPage),
  },
  {
    path: 'dir-browser',
    loadComponent: () =>
      import('./pages/dir-browser/dir-browser.page').then(
        (m) => m.DirBrowserPage
      ),
  },
  {
    path: 'live-data',
    component: LiveDataPage,
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/live-data/dashboard/dashboard.page').then(
            (m) => m.DashboardPage
          ),
      },
      {
        path: 'all-data',
        loadComponent: () =>
          import('./pages/live-data/all-data/all-data.page').then(
            (m) => m.AllDataPage
          ),
      },
      {
        path: 'location',
        loadComponent: () =>
          import('./pages/live-data/location/location.page').then(
            (m) => m.LocationPage
          ),
      },
      {
        path: 'logging',
        loadComponent: () =>
          import('./pages/live-data/logging/logging.page').then(
            (m) => m.LoggingPage
          ),
      },
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: 'view-record',
    loadComponent: () =>
      import('./pages/view-record/view-record.page').then(
        (m) => m.ViewRecordPage
      ),
  },
  {
    path: 'terminal',
    loadComponent: () => import('./pages/terminal/terminal.page').then( m => m.TerminalPage)
  },
];
