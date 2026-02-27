[Setup]
AppName=OpenTurn Connector
AppVersion=1.0.0
DefaultDirName={pf}\OpenTurn Connector
DefaultGroupName=OpenTurn Connector
UninstallDisplayIcon={app}\connector-win.exe
Compression=lzma2
SolidCompression=yes
OutputDir=..\..\dist-installers
OutputBaseFilename=OpenTurn-Connector-Setup
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
    'Configuração do OpenTurn Connector',
    'Insira os dados de pareamento gerados no painel do OpenTurn SaaS.',
    'Estes dados são necessários para conectar os equipamentos locais à nuvem.');

  TokenPage.Add('Token JWT de Pareamento:', False);
  TokenPage.Add('Relay WebSocket URL:', False);
  
  // Set default URL
  TokenPage.Values[1] := 'wss://api.sua-empresa.com/ws/connectors';
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

; Install the service using NSSM
Filename: "{app}\nssm.exe"; Parameters: "install OpenTurnConnector ""{app}\node.exe"" ""{app}\index.js"" start"; Flags: runhidden waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "set OpenTurnConnector AppDirectory ""{app}"""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "set OpenTurnConnector DisplayName ""OpenTurn Connector API Bridge"""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "set OpenTurnConnector Description ""Ponte segura entre equipamentos ControlID locais e o OpenTurn SaaS."""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "set OpenTurnConnector Start SERVICE_AUTO_START"; Flags: runhidden waituntilterminated

; Start the service
Filename: "{app}\nssm.exe"; Parameters: "start OpenTurnConnector"; Flags: runhidden waituntilterminated

[UninstallRun]
; Stop and remove the service using NSSM
Filename: "{app}\nssm.exe"; Parameters: "stop OpenTurnConnector"; Flags: runhidden waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "remove OpenTurnConnector confirm"; Flags: runhidden waituntilterminated

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
