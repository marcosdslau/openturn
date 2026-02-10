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
