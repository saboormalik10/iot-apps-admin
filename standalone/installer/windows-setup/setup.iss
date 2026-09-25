; Observator Weather Station - Windows setup program.
;
; The client asked for an .exe installer (23 Sep 2026), while the product itself
; stays a web portal: "the installer can be an exe. However, for user to accept the
; application, it should be using a web browser".
;
; This is a thin wizard around the same scripts the zip ships: it asks where to put
; the program and the data, who the first administrator is and how the sensor
; connects, unpacks everything, then runs scripts\install.ps1 - which does the real
; work (services, database, firewall, backups) and asks for the administrator's
; password in its own window, so no password is ever passed on a command line or
; written to disk.
;
; It can also install unattended, for a site that deploys it centrally:
;
;   observator-weather-<version>-setup.exe /VERYSILENT /SUPPRESSMSGBOXES ^
;     /AdminEmail=tech@site.local /AdminPassword=<password> ^
;     [/DataDir=D:\ObservatorData] [/WebPort=3201] [/StreamPort=4000] ^
;     [/StreamMode=connect /ConverterHost=192.168.1.50]
;
; A password on a command line can be read by other programs on the PC while it
; runs, so prefer the wizard, which asks for it in its own window. Even unattended,
; the password reaches install.ps1 through the environment, not its command line.
;
; Built by installer/build-release.mjs --exe (Inno Setup 6; ISCC, optionally
; through Wine). ASCII only, like the PowerShell scripts.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef SourceDir
  #error SourceDir must be defined: the staged release folder
#endif
#ifndef OutputDir
  #define OutputDir "."
#endif

[Setup]
AppId={{8F3B5C2E-9A47-4C1D-93A6-0B7E2D5A16C4}
AppName=Observator Weather Station
AppVersion={#AppVersion}
AppVerName=Observator Weather Station {#AppVersion}
AppPublisher=Observator Instruments
DefaultDirName=C:\Observator
DefaultGroupName=Observator Weather Station
DisableProgramGroupPage=yes
DisableWelcomePage=no
OutputDir={#OutputDir}
OutputBaseFilename=observator-weather-{#AppVersion}-setup
Compression=lzma2/normal
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; Everything it does needs administrator rights: services, firewall, program files.
PrivilegesRequired=admin
WizardStyle=modern
UninstallDisplayName=Observator Weather Station
UninstallDisplayIcon={app}\runtime\node\node.exe
; The data folder is never removed by uninstalling - see uninstall.ps1.
CreateUninstallRegKey=yes
MinVersion=10.0

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"

[Files]
; The staged release, minus any setup program built earlier.
Source: "{#SourceDir}\*"; DestDir: "{app}"; Excludes: "*-setup.exe"; \
  Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\Weather station portal"; Filename: "http://localhost:{code:GetWebPort}"
Name: "{group}\Is everything working (status)"; Filename: "{app}\status.cmd"
Name: "{group}\Back up now"; Filename: "{app}\backup-now.cmd"
Name: "{group}\Set a user's password"; Filename: "{app}\reset-password.cmd"
Name: "{group}\Guides"; Filename: "{app}\docs"
Name: "{group}\Uninstall"; Filename: "{uninstallexe}"

[UninstallRun]
; Stop and remove the services, firewall rules and the nightly task. The data folder
; (readings, settings, backups) is deliberately left where it is.
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\uninstall.ps1"""; \
  Flags: waituntilterminated runhidden; RunOnceId: "RemoveServices"

[Code]
{ For an unattended install: the password goes to install.ps1 in its environment. }
function SetEnvironmentVariable(lpName, lpValue: String): Boolean;
  external 'SetEnvironmentVariableW@kernel32.dll stdcall';

var
  DataPage: TInputDirWizardPage;
  AdminPage: TInputQueryWizardPage;
  SensorPage: TInputQueryWizardPage;
  SensorMode: TNewRadioButton;
  SensorModeConnect: TNewRadioButton;

{ Where an existing install keeps its data - so reinstalling over it never points
  the PC at an empty new folder and makes the site look like it lost its readings. }
function ExistingDataDir: String;
begin
  if not RegQueryStringValue(HKLM, 'SOFTWARE\Observator\WeatherStation', 'DataDir', Result) then
    Result := '';
end;

function IsUpgrade: Boolean;
begin
  Result := ExistingDataDir <> '';
end;

{ "/Name=value" from the command line, or '' . }
function CmdLineParam(const Name: String): String;
var
  I: Integer;
  Prefix, S: String;
begin
  Result := '';
  Prefix := '/' + Name + '=';
  for I := 1 to ParamCount do
  begin
    S := ParamStr(I);
    if CompareText(Copy(S, 1, Length(Prefix)), Prefix) = 0 then
      Result := Trim(Copy(S, Length(Prefix) + 1, MaxInt));
  end;
end;

function CmdLineParamOr(const Name, Fallback: String): String;
begin
  Result := CmdLineParam(Name);
  if Result = '' then
    Result := Fallback;
end;

procedure InitializeWizard;
begin
  DataPage := CreateInputDirPage(wpSelectDir,
    'Where should the weather data be kept?',
    'Readings, settings, logs and backups go here.',
    'This folder is NOT touched by upgrades or by uninstalling, and it grows by about' + #13#10 +
    '0.5 GB a year because readings are never deleted. Keep it outside the program folder.',
    False, '');
  DataPage.Add('');
  if IsUpgrade then
    DataPage.Values[0] := CmdLineParamOr('DataDir', ExistingDataDir)
  else
    DataPage.Values[0] := CmdLineParamOr('DataDir', 'C:\ObservatorData');

  AdminPage := CreateInputQueryPage(DataPage.ID,
    'The first administrator',
    'Who signs in to the portal first?',
    'Enter the email address of the first administrator. The password is asked for at' + #13#10 +
    'the end, in its own window, so that it is never stored on this PC.');
  AdminPage.Add('Email address:', False);
  AdminPage.Values[0] := CmdLineParam('AdminEmail');

  SensorPage := CreateInputQueryPage(AdminPage.ID,
    'The sensor and the network',
    'How does the GMX551 reach this PC?',
    'Leave these as they are unless the site says otherwise.');
  SensorPage.Add('Sensor port (TCP):', False);
  SensorPage.Add('Converter address (only if this PC must dial the converter):', False);
  SensorPage.Add('Portal port (what people open in a browser):', False);
  SensorPage.Values[0] := CmdLineParamOr('StreamPort', '4000');
  SensorPage.Values[1] := CmdLineParam('ConverterHost');
  SensorPage.Values[2] := CmdLineParamOr('WebPort', '3201');

  SensorMode := TNewRadioButton.Create(WizardForm);
  SensorMode.Parent := SensorPage.Surface;
  SensorMode.Caption := 'The converter connects to this PC (usual)';
  SensorMode.Top := SensorPage.Edits[2].Top + SensorPage.Edits[2].Height + ScaleY(16);
  SensorMode.Width := SensorPage.SurfaceWidth;
  SensorMode.Checked := CompareText(CmdLineParam('StreamMode'), 'connect') <> 0;

  SensorModeConnect := TNewRadioButton.Create(WizardForm);
  SensorModeConnect.Parent := SensorPage.Surface;
  SensorModeConnect.Caption := 'This PC connects to the converter (fill in its address above)';
  SensorModeConnect.Top := SensorMode.Top + SensorMode.Height + ScaleY(4);
  SensorModeConnect.Width := SensorPage.SurfaceWidth;
  SensorModeConnect.Checked := not SensorMode.Checked;
end;

{ Unattended: nothing can be typed, so refuse early and plainly. }
function InitializeSetup: Boolean;
begin
  Result := True;
  { An install that is already there keeps its administrators; only a first
    install needs one to be named. }
  if WizardSilent and not IsUpgrade then
  begin
    if (Pos('@', CmdLineParam('AdminEmail')) < 2) or (CmdLineParam('AdminPassword') = '') then
    begin
      MsgBox('An unattended install needs /AdminEmail=<email> and /AdminPassword=<password>.' + #13#10 +
        'Without them there is nobody who can sign in to the portal.', mbCriticalError, MB_OK);
      Result := False;
    end
    else if Length(CmdLineParam('AdminPassword')) < 8 then
    begin
      MsgBox('The administrator password must be at least 8 characters.', mbCriticalError, MB_OK);
      Result := False;
    end;
  end;
end;

function GetDataDir(Param: String): String;
begin
  Result := DataPage.Values[0];
end;

function GetAdminEmail(Param: String): String;
begin
  Result := Trim(AdminPage.Values[0]);
end;

function GetWebPort(Param: String): String;
begin
  Result := Trim(SensorPage.Values[2]);
end;

function IsNumber(const S: String): Boolean;
var
  I: Integer;
begin
  Result := Length(S) > 0;
  for I := 1 to Length(S) do
    if (S[I] < '0') or (S[I] > '9') then
      Result := False;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  { Upgrading or reinstalling: there is already an administrator, and the data
    folder must stay where it is. }
  Result := IsUpgrade and ((PageID = AdminPage.ID) or (PageID = DataPage.ID));
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Data, Prog: String;
begin
  Result := True;
  { Nothing to check when nobody is there to correct it; InitializeSetup did. }
  if WizardSilent then
    Exit;
  if CurPageID = DataPage.ID then
  begin
    Data := Trim(DataPage.Values[0]);
    Prog := RemoveBackslashUnlessRoot(ExpandConstant('{app}'));
    if Data = '' then
    begin
      MsgBox('Choose a folder for the weather data.', mbError, MB_OK);
      Result := False;
    end
    else if (CompareText(RemoveBackslashUnlessRoot(Data), Prog) = 0) or
            (Pos(Lowercase(Prog + '\'), Lowercase(Data)) = 1) then
    begin
      MsgBox('Keep the data folder outside the program folder: upgrades replace the program folder.',
        mbError, MB_OK);
      Result := False;
    end;
  end
  else if CurPageID = AdminPage.ID then
  begin
    if IsUpgrade then
      Exit;
    if (Pos('@', GetAdminEmail('')) < 2) or (Pos(' ', GetAdminEmail('')) > 0) then
    begin
      MsgBox('Enter the email address of the first administrator, for example tech@site.local',
        mbError, MB_OK);
      Result := False;
    end;
  end
  else if CurPageID = SensorPage.ID then
  begin
    if not IsNumber(Trim(SensorPage.Values[0])) or not IsNumber(GetWebPort('')) then
    begin
      MsgBox('The ports must be numbers, for example 4000 and 3201.', mbError, MB_OK);
      Result := False;
    end
    else if SensorModeConnect.Checked and (Trim(SensorPage.Values[1]) = '') then
    begin
      MsgBox('Enter the converter''s address, or choose "The converter connects to this PC".',
        mbError, MB_OK);
      Result := False;
    end;
  end;
end;

{ The real work: the same install.ps1 the zip ships. Run visibly, because it asks
  for the administrator's password (twice) and prints what it is doing. }
function RunInstallScript: Boolean;
var
  Params: String;
  ResultCode, Show: Integer;
begin
  Show := SW_SHOW;
  Params := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}') + '\scripts\install.ps1"' +
    ' -InstallDir "' + ExpandConstant('{app}') + '"' +
    ' -DataDir "' + GetDataDir('') + '"' +
    ' -WebPort ' + GetWebPort('') +
    ' -StreamPort ' + Trim(SensorPage.Values[0]);
  { Only a first install names an administrator; install.ps1 then asks for the
    password in its own window. }
  if not IsUpgrade then
    Params := Params + ' -AdminEmail "' + GetAdminEmail('') + '"';
  if SensorModeConnect.Checked then
    Params := Params + ' -StreamMode connect -ConverterHost "' + Trim(SensorPage.Values[1]) + '"'
  else
    Params := Params + ' -StreamMode listen';

  { Unattended: hand the password over in the environment (never on the command
    line, where any program on the PC could read it), and run without a window. }
  if WizardSilent and not IsUpgrade then
  begin
    if not SetEnvironmentVariable('OBSERVATOR_ADMIN_PASSWORD', CmdLineParam('AdminPassword')) then
    begin
      MsgBox('Could not pass the administrator password to the setup step.', mbCriticalError, MB_OK);
      Result := False;
      Exit;
    end;
    Params := Params + ' -AdminPasswordFromEnvironment';
    Show := SW_HIDE;
  end
  else if WizardSilent then
    Show := SW_HIDE;

  if not Exec('powershell.exe', Params, '', Show, ewWaitUntilTerminated, ResultCode) then
  begin
    MsgBox('Windows PowerShell could not be started, so the setup could not finish.' + #13#10 +
      'Open the folder ' + ExpandConstant('{app}') + ' and run install.cmd as an administrator.',
      mbCriticalError, MB_OK);
    Result := False;
  end
  else if ResultCode <> 0 then
  begin
    MsgBox('The setup did not finish (code ' + IntToStr(ResultCode) + ').' + #13#10 + #13#10 +
      'The window that just closed says what went wrong, and the whole run is in' + #13#10 +
      GetDataDir('') + '\logs. Fix what it reports, then run install.cmd in' + #13#10 +
      ExpandConstant('{app}') + ' as an administrator - it carries on where it stopped.',
      mbCriticalError, MB_OK);
    Result := False;
  end
  else
    Result := True;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    if not RunInstallScript then
      Abort;
  end;
end;

[Messages]
FinishedHeadingLabel=The weather station is installed
FinishedLabel=Open the portal in a browser from any PC on the site network - the address was printed in the window that just closed, and the Start menu has a shortcut. The guides are in the "docs" folder.
