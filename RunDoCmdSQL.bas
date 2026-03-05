Attribute VB_Name = "RunDoCmdSQL"

' Executes an action SQL statement (INSERT INTO, UPDATE, DELETE) against the current database.
' Uses CurrentDb.Execute instead of DoCmd.RunSQL for reliable execution of append queries.
'
' Parameters:
'   strSQL             - The SQL action statement to execute (must be an action query, e.g. INSERT INTO)
'   intLogErr          - Pass 0 to suppress error logging; default (-1) logs errors via objLog
'   intKeepWarningsOff - Retained for backwards compatibility; no longer used

Public Function RunDoCmdSQL(strSQL As String, Optional intLogErr As Integer = -1, Optional intKeepWarningsOff = 0)
On Error GoTo ErrHandler
    CurrentDb.Execute strSQL, dbFailOnError
    DoEvents
    Exit Function
ErrHandler:
    If intLogErr = -1 Then
        objLog.LogEvent Err.Description & ". Failed to execute sql: " & strSQL, "RunDoCmdSQL()", Err.Number, "Runtime"
    End If
End Function
