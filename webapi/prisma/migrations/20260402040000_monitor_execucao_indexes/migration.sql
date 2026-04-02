-- Índices para agregações do snapshot do monitor (instituição + tempo de início; série global por tempo)
CREATE INDEX IF NOT EXISTS "ROTExecucaoLog_ins_exeInicio_idx" ON "ROTExecucaoLog" ("INSInstituicaoCodigo", "EXEInicio");
CREATE INDEX IF NOT EXISTS "ROTExecucaoLog_exeInicio_idx" ON "ROTExecucaoLog" ("EXEInicio");
