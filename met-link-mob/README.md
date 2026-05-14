# MET-LINK

An Ionic Angular mobile application with cross-platform capabilities for web, iOS, and Android platforms.

## Table of Contents

- [Environment Setup](#environment-setup)
- [Installation](#installation)
- [Running the Application](#running-the-application)
  - [Web](#web)
  - [Android](#android)
  - [iOS](#ios)
- [Plugins Used](#plugins-used)
- [Database Configuration](#database-configuration)
- [Additional Configuration](#additional-configuration)

## Environment Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- [npm](https://www.npmjs.com/) (v7 or higher)
- [Ionic CLI](https://ionicframework.com/docs/cli) (latest version)
- [Angular CLI](https://angular.io/cli) (v19)

### Setting up the Development Environment

1. Install Node.js and npm from [https://nodejs.org/](https://nodejs.org/)
2. Install Ionic CLI globally:
   ```bash
   npm install -g @ionic/cli
   ```
3. Install Angular CLI globally:
   ```bash
   npm install -g @angular/cli
   ```

## Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd met-link-mob
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Running the Application

### Web

To run the application in a web browser:

```bash
ionic serve
```

This will start a development server at `http://localhost:8100/`

### Android

#### Prerequisites

- [Android Studio](https://developer.android.com/studio)
- Android SDK
- Java Development Kit (JDK)

#### Setup

1. Make sure Android Studio is installed with Android SDK
2. Set up environment variables:
   - ANDROID_HOME pointing to your Android SDK location
   - JAVA_HOME pointing to your JDK installation

#### Building and Running

1. Add Android platform:

   ```bash
   ionic cap add android
   ```

2. Build the application:

   ```bash
   ionic cap build android
   ```

3. Open the project in Android Studio:

   ```bash
   ionic cap open android
   ```

4. Run the application on an emulator or connected device from Android Studio

For subsequent builds after making changes:

```bash
ionic cap sync android
```

### iOS

#### Prerequisites

- macOS
- Xcode (latest version)
- CocoaPods

#### Setup

1. Install Xcode from the Mac App Store
2. Install CocoaPods:
   ```bash
   sudo gem install cocoapods
   ```

#### Building and Running

1. Add iOS platform:

   ```bash
   ionic cap add ios
   ```

2. Build the application:

   ```bash
   ionic cap build ios
   ```

3. Open the project in Xcode:

   ```bash
   ionic cap open ios
   ```

4. Configure your signing identity in Xcode
5. Run the application on a simulator or connected device from Xcode

For subsequent builds after making changes:

```bash
ionic cap sync ios
```

## Plugins Used

This project uses the following Capacitor and Cordova plugins:

### Capacitor Core Plugins

- **@capacitor/app**: Application lifecycle management
- **@capacitor/browser**: Open URLs in the device browser
- **@capacitor/camera**: Camera access
- **@capacitor/filesystem**: File system access
- **@capacitor/geolocation**: Device location
- **@capacitor/haptics**: Haptic feedback
- **@capacitor/keyboard**: Keyboard management
- **@capacitor/preferences**: Secure storage
- **@capacitor/share**: Share content
- **@capacitor/splash-screen**: Splash screen management
- **@capacitor/status-bar**: Status bar customization
- **@capacitor/toast**: Toast notifications

### Community Plugins

- **@capacitor-community/sqlite**: SQLite database support
- **@awesome-cordova-plugins/bluetooth-serial**: Bluetooth serial communication
- **@capawesome/capacitor-android-edge-to-edge-support**: Android edge-to-edge display support

### Other Libraries

- **chart.js**: JavaScript charting library
- **moment**: Date manipulation
- **swiper**: Touch slider

## Database Configuration

The application uses SQLite for local database storage. The configuration is managed through the Capacitor config file:

```typescript
CapacitorSQLite: {
  iosDatabaseLocation: 'Library/CapacitorDatabase',
  iosIsEncryption: false,
  iosKeychainPrefix: 'MET-LINK',
  androidIsEncryption: false,
}
```

## Additional Configuration

### Android Edge-to-Edge Support

The application supports edge-to-edge display on Android with the following configuration:

```typescript
EdgeToEdge: {
  backgroundColor: '#ffffff',
}
```

### Splash Screen

The splash screen is configured with:

```typescript
SplashScreen: {
  launchShowDuration: 0,
  launchAutoHide: true,
  backgroundColor: '#ffffffff',
  androidSplashResourceName: 'splash',
  androidScaleType: 'CENTER_CROP',
  showSpinner: false,
  splashFullScreen: true,
  splashImmersive: true,
}
```

## Troubleshooting

If you encounter any issues with plugin compatibility or native builds, ensure you have synced your Capacitor project after any plugin installation:

```bash
ionic cap sync
```

For Android-specific issues, check the Android Studio logs when running the application.

For iOS-specific issues, check the Xcode logs when running the application.
