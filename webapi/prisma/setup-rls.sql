-- Função para obter o tenant da sessão
CREATE OR REPLACE FUNCTION current_tenant() RETURNS integer AS $$
  SELECT current_setting('app.current_tenant', true)::integer;
$$ LANGUAGE sql STABLE;

-- Habilitar RLS nas tabelas
ALTER TABLE "INSInstituicao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PESPessoa" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MATMatricula" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EQPEquipamento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ERPConfiguracao" ENABLE ROW LEVEL SECURITY;

-- Políticas para INSInstituicao (Onde o usuário tem acesso ou via SuperRoot)
-- Nota: USRUsuario terá lógica separada para filtrar quais instituições ele vê.
-- Para simplificar o RLS inicial, vamos focar nas tabelas que possuem INSInstituicaoCodigo.

-- Política para PESPessoa
CREATE POLICY tenant_isolation_pes ON "PESPessoa"
  USING ("INSInstituicaoCodigo" = current_tenant());

-- Política para MATMatricula
CREATE POLICY tenant_isolation_mat ON "MATMatricula"
  USING ("INSInstituicaoCodigo" = current_tenant());

-- Política para EQPEquipamento
CREATE POLICY tenant_isolation_eqp ON "EQPEquipamento"
  USING ("INSInstituicaoCodigo" = current_tenant());

-- Política para ERPConfiguracao
CREATE POLICY tenant_isolation_erp ON "ERPConfiguracao"
  USING ("INSInstituicaoCodigo" = current_tenant());

-- Política para INSInstituicao (ela mesma)
CREATE POLICY tenant_isolation_ins ON "INSInstituicao"
  USING ("INSCodigo" = current_tenant());

-- Política para REGRegistroPassagem
ALTER TABLE "REGRegistroPassagem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_reg ON "REGRegistroPassagem"
  USING ("INSInstituicaoCodigo" = current_tenant());

-- Política para ROTRotina
ALTER TABLE "ROTRotina" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_rot ON "ROTRotina"
  USING ("INSInstituicaoCodigo" = current_tenant());

-- Política para ROTExecucaoLog
ALTER TABLE "ROTExecucaoLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_exe ON "ROTExecucaoLog"
  USING ("INSInstituicaoCodigo" = current_tenant());

-- Bypass RLS para o usuário da aplicação (usado pelo Prisma via SET app.current_tenant)
-- O Prisma seta o tenant manualmente via $extends, então o owner do schema precisa fazer bypass
-- Nota: Executar APENAS se o user do banco for diferente do owner das tabelas
-- ALTER ROLE openturn_user SET row_security = off;

