-- Define o próximo ID autoincrement como GREATEST(100, MAX(id)+1) para todas as tabelas.
-- Comportamento:
--   Banco vazio  → próximo insert = 100
--   Banco com dados → próximo insert = MAX(id)+1 (sem conflito de PK)

DO $$
DECLARE
  rec RECORD;
  seq_name TEXT;
  next_val BIGINT;
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('CLICliente',             'CLICodigo'),
    ('INSInstituicao',         'INSCodigo'),
    ('PESPessoa',              'PESCodigo'),
    ('MATMatricula',           'MATCodigo'),
    ('EQPEquipamento',         'EQPCodigo'),
    ('ERPConfiguracao',        'ERPCodigo'),
    ('USRUsuario',             'USRCodigo'),
    ('USRSenhaResetToken',     'USRSTCodigo'),
    ('PESEquipamentoMapeamento', 'PEQCodigo'),
    ('USRAcesso',              'UACCodigo'),
    ('REGRegistroPassagem',    'REGCodigo'),
    ('PERPeriodosConfig',      'PERCodigo'),
    ('RPDRegistrosDiarios',    'RPDCodigo'),
    ('CMDComandoFila',         'CMDCodigo'),
    ('controlid_dao',          'CTDCodigo'),
    ('controlid_catra_event',  'CTCCodigo'),
    ('ROTRotina',              'ROTCodigo'),
    ('ROTExecucaoLog',         'EXECodigo'),
    ('ROTHistoricoVersao',     'HVICodigo'),
    ('CONConnector',           'CONCodigo'),
    ('RMTSessaoRemota',        'RMTCodigo'),
    ('AIPProvedorIa',          'AIPCodigo'),
    ('AIMModeloIa',            'AIMCodigo'),
    ('AIPEPermissaoIa',        'AIPECodigo'),
    ('AICConversaIa',          'AICCodigo'),
    ('AIMSMensagemIa',         'AIMSCodigo'),
    ('AILCreditoLedger',       'AILCodigo')
  ) AS v(table_name, column_name)
  LOOP
    seq_name := pg_get_serial_sequence(format('"%s"', rec.table_name), rec.column_name);
    IF seq_name IS NOT NULL THEN
      EXECUTE format(
        'SELECT GREATEST(100, COALESCE(MAX(%I), 0) + 1) FROM %I',
        rec.column_name, rec.table_name
      ) INTO next_val;
      EXECUTE format('SELECT setval(%L, %s, false)', seq_name, next_val);
    END IF;
  END LOOP;
END $$;
