import { bootstrapApplication } from '@angular/platform-browser';
import {
  RouteReuseStrategy,
  provideRouter,
  withPreloading,
  PreloadAllModules,
} from '@angular/router';
import {
  IonicRouteStrategy,
  provideIonicAngular,
} from '@ionic/angular/standalone';
import { provideHttpClient } from '@angular/common/http';
import { AndroidPermissions } from '@awesome-cordova-plugins/android-permissions/ngx';
import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';

// NOTE: jeep-sqlite (web SQLite WASM) is intentionally NOT loaded here.
// SQLite is only used on native platforms (Android, iOS). On web the app
// runs without SQLite persistence — all DB calls gracefully no-op.

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(),
    AndroidPermissions,
  ],
}).catch((err) => console.error(err));
