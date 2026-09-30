; THIRSTY writes its own "Start at login" value (app.setLoginItemSettings, name THIRSTY).
; Remove it on a real uninstall; an update reinstalls over the top and keeps it.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "THIRSTY"
  ${endIf}
!macroend
