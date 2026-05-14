export class Global {
  static DeviceTheme: string = "obsblue";
  static DeviceThemeLight: string = "obsblueL";

  static initTheme(): string {
    switch (localStorage.getItem('color')) {
      case '0':
        console.log("null");
        this.DeviceTheme = "obsblack";
        this.DeviceThemeLight = "obsblackL";
        break;
      case '1':
        console.log("een");
        this.DeviceTheme = "obsgrey";
        this.DeviceThemeLight = "obsgreyL";
        break;
      case '2':
        console.log("twee");
        this.DeviceTheme = "obsblue";
        this.DeviceThemeLight = "obsblueL";
        break;
    }
    return this.DeviceTheme;
  }
}
