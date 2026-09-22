import { compararHosts } from './hosts-acesso';
import type { HardwareAccessHostSnapshot, HardwareAccessSnapshot } from './ports';

const vazio = (): HardwareAccessSnapshot => ({ areas: [], portais: [], horarios: [], grupos: [], regras: [] });

const comObjetos = (opcoes: {
  areas?: Array<[string, string]>;
  horarios?: Array<[string, string]>;
  grupos?: Array<[string, string]>;
}): HardwareAccessSnapshot => ({
  ...vazio(),
  areas: (opcoes.areas ?? []).map(([id, nome]) => ({ id, nome })),
  horarios: (opcoes.horarios ?? []).map(([id, nome]) => ({ id, nome, spans: [] })),
  grupos: (opcoes.grupos ?? []).map(([id, nome]) => ({ id, nome })),
});

const host = (
  h: string,
  origem: string,
  efetivo: boolean,
  snapshot?: HardwareAccessSnapshot,
  erro?: string,
): HardwareAccessHostSnapshot => ({ host: h, origem, efetivo, snapshot, erro });

describe('compararHosts', () => {
  it('com um host só não há o que comparar', () => {
    const r = compararHosts([host('10.0.0.1', 'EQPEnderecoIp', true, vazio())]);

    expect(r.veredicto).toBe('host_unico');
    expect(r.diferencas).toEqual([]);
  });

  it('hosts com os mesmos objetos = banco compartilhado', () => {
    const iguais = comObjetos({ areas: [['3', 'Área Interna']], horarios: [['10', 'manha']] });
    const r = compararHosts([
      host('10.0.0.1', 'EQPConfig.host', true, iguais),
      host('10.0.0.2', 'EQPConfig.ip_entry', false, comObjetos({ areas: [['3', 'Área Interna']], horarios: [['10', 'manha']] })),
    ]);

    expect(r.veredicto).toBe('iguais');
    expect(r.hosts[0].contagens).toMatchObject({ areas: 1, horarios: 1 });
  });

  it('objeto que existe só num host = bancos separados', () => {
    const r = compararHosts([
      host('10.0.0.1', 'EQPConfig.host', true, comObjetos({ horarios: [['10', 'manha']] })),
      host('10.0.0.2', 'EQPConfig.ip_entry', false, comObjetos({ horarios: [['10', 'manha'], ['11', 'tarde']] })),
    ]);

    expect(r.veredicto).toBe('diferentes');
    expect(r.diferencas.join(' ')).toContain('horários só em 10.0.0.2');
    expect(r.diferencas.join(' ')).toContain('tarde #11');
    expect(r.recomendacao).toContain('bancos de objetos separados');
  });

  it('mesmo id com nome diferente também denuncia bancos separados', () => {
    const r = compararHosts([
      host('10.0.0.1', 'EQPConfig.host', true, comObjetos({ grupos: [['25', 'Catec manha']] })),
      host('10.0.0.2', 'EQPConfig.ip_entry', false, comObjetos({ grupos: [['25', 'Outro grupo']] })),
    ]);

    expect(r.veredicto).toBe('diferentes');
    expect(r.diferencas.join(' ')).toContain('"Catec manha" vs "Outro grupo"');
  });

  it('host que não respondeu impede a conclusão em vez de fingir igualdade', () => {
    const r = compararHosts([
      host('10.0.0.1', 'EQPConfig.host', true, vazio()),
      host('10.0.0.2', 'EQPConfig.ip_entry', false, undefined, 'timeout'),
    ]);

    expect(r.veredicto).toBe('indisponivel');
    expect(r.diferencas[0]).toContain('não respondeu');
  });

  it('compara contra o host efetivo, não contra o primeiro da lista', () => {
    const r = compararHosts([
      host('10.0.0.9', 'EQPConfig.ip_entry', false, comObjetos({ areas: [['1', 'A']] })),
      host('10.0.0.1', 'EQPEnderecoIp', true, comObjetos({ areas: [['2', 'B']] })),
    ]);

    expect(r.veredicto).toBe('diferentes');
    // "só em 10.0.0.1" seria o texto se a referência fosse o primeiro da lista.
    expect(r.diferencas.join(' ')).toContain('áreas só em 10.0.0.9');
  });
});
