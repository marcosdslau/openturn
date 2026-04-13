-- PESDocumento não deve ser único globalmente (ex.: mesmo CPF em instituições diferentes ou duplicatas permitidas).
DROP INDEX IF EXISTS "PESPessoa_PESDocumento_key";
