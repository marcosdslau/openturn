import { PERFIL_NOME_MAX_BYTES, bytesUtf8, normalizarNomePerfil } from './perfil-nome';

describe('nomes que vão para o equipamento', () => {
  it('normaliza espaços nas pontas e no meio', () => {
    expect(normalizarNomePerfil('  CATEC   MANHA  ')).toBe('CATEC MANHA');
    expect(normalizarNomePerfil('')).toBe('');
    expect(normalizarNomePerfil(null as unknown as string)).toBe('');
  });

  it('mede em BYTES, porque é assim que o firmware trunca', () => {
    expect(bytesUtf8('MATUTINO-01')).toBe(11);
    // Acentuada ocupa 2 bytes: "Manhã" cabe em 5 caracteres mas ocupa 6.
    expect(bytesUtf8('Manhã')).toBe(6);
    expect(PERFIL_NOME_MAX_BYTES).toBe(15);
  });

  it('um nome de 15 caracteres acentuados NÃO cabe no limite', () => {
    const nome = 'ÁÁÁÁÁÁÁÁ';
    expect(nome.length).toBeLessThan(PERFIL_NOME_MAX_BYTES);
    expect(bytesUtf8(nome)).toBeGreaterThan(PERFIL_NOME_MAX_BYTES);
  });
});
