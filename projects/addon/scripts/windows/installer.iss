[Setup]
AppName=SchoolGuard
AppVersion=1.0.0
DefaultDirName={pf}\SchoolGuard
DefaultGroupName=SchoolGuard
UninstallDisplayIcon={app}\connector-win.exe
Compression=lzma
SolidCompression=no
OutputDir=..\..\dist-installers
OutputBaseFilename=Setup-Addon
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64
ArchitecturesAllowed=x64

[Files]
Source: "..\..\bin\node-v24.13.0-win-x64.exe"; DestName: "node.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\dist\index.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "nssm.exe"; DestDir: "{app}"; Flags: ignoreversion

[Code]
var
  TokenPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  TokenPage := CreateInputQueryPage(wpSelectDir,
    'Configuração do SchoolGuard',
    'Insira os dados de pareamento gerados no painel do SchoolGuard SaaS.',
    'Estes dados são necessários para conectar os equipamentos locais à nuvem.');

  TokenPage.Add('Token JWT de Pareamento:', False);
  TokenPage.Add('Relay WebSocket URL:', False);
  
  // Set default URL
  TokenPage.Values[1] := 'wss://admin.schoolguard.com.br/ws/connectors';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  if CurPageID = TokenPage.ID then
  begin
    if Trim(TokenPage.Values[0]) = '' then
    begin
      MsgBox('O Token de Pareamento é obrigatório!', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if Trim(TokenPage.Values[1]) = '' then
    begin
      MsgBox('A URL do Relay é obrigatória!', mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;
  Result := True;
end;

[Run]
; Run the pairing command using the provided inputs
Filename: "{app}\node.exe"; Parameters: """{app}\index.js"" pair --token ""{code:GetTokenValue}"" --url ""{code:GetUrlValue}"""; Flags: runhidden waituntilterminated

; Create a runner batch script so NSSM bypasses Windows Quotes escaping issues
Filename: "{cmd}"; Parameters: "/c echo ""{app}\node.exe"" ""{app}\index.js"" start > ""{app}\service-run.bat"""; Flags: runhidden waituntilterminated

; Install the service using NSSM pointing to the Bat file
Filename: "{app}\nssm.exe"; Parameters: "install SchoolGuard ""{app}\service-run.bat"""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "set SchoolGuard AppDirectory ""{app}"""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "set SchoolGuard DisplayName ""SchoolGuard API Bridge"""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "set SchoolGuard Description ""Ponte segura entre equipamentos locais e o SchoolGuard SaaS."""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "set SchoolGuard Start SERVICE_AUTO_START"; Flags: runhidden waituntilterminated

; Start the service
Filename: "{app}\nssm.exe"; Parameters: "start SchoolGuard"; Flags: runhidden waituntilterminated

[UninstallRun]
; Stop and remove the service using NSSM
Filename: "{app}\nssm.exe"; Parameters: "stop SchoolGuard"; Flags: runhidden waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "remove SchoolGuard confirm"; Flags: runhidden waituntilterminated

[Code]
// Helper functions to retrieve the inputs for the [Run] section
function GetTokenValue(Param: String): String;
begin
  Result := TokenPage.Values[0];
end;

function GetUrlValue(Param: String): String;
begin
  Result := TokenPage.Values[1];
end;
