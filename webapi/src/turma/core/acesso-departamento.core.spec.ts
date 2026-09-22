import { formaDaRegra, reaproveitavel } from './acesso-departamento.core';
import type { HardwareAccessSnapshot } from './ports';

const NOSSO_GRUPO = '25';
const NOSSO_HORARIO = '10';

function snapshotCom(regra: Partial<HardwareAccessSnapshot['regras'][number]>): HardwareAccessSnapshot {
  return {
    areas: [],
    portais: [],
    horarios: [],
    grupos: [],
    regras: [
      {
        id: '18',
        nome: 'SchoolGuard Catec - manha',
        tipo: 1,
        horarioIds: [NOSSO_HORARIO],
        portalIds: ['3'],
        grupoIds: [NOSSO_GRUPO],
        ...regra,
      },
    ],
  };
}

const pode = (s: HardwareAccessSnapshot) => reaproveitavel(s, '18', NOSSO_GRUPO, NOSSO_HORARIO);

describe('reaproveitavel', () => {
  it('reaproveita a regra que tem a nossa forma: um horário, só o nosso departamento', () => {
    expect(pode(snapshotCom({}))).toBe(true);
  });

  it('reaproveita regra sem horário nenhum — é só preencher', () => {
    expect(pode(snapshotCom({ horarioIds: [] }))).toBe(true);
  });

  it('NÃO reaproveita regra com dois horários: reescrever apagaria o segundo', () => {
    expect(pode(snapshotCom({ horarioIds: [NOSSO_HORARIO, '11'] }))).toBe(false);
  });

  it('NÃO reaproveita regra de outro horário', () => {
    expect(pode(snapshotCom({ horarioIds: ['99'] }))).toBe(false);
  });

  it('NÃO reaproveita regra compartilhada: mudaria quem passa no outro departamento', () => {
    expect(pode(snapshotCom({ grupoIds: [NOSSO_GRUPO, '26'] }))).toBe(false);
  });

  it('NÃO reaproveita regra de bloqueio — o modelo é allow-only', () => {
    expect(pode(snapshotCom({ tipo: 0 }))).toBe(false);
  });

  it('NÃO reaproveita regra que sumiu do equipamento', () => {
    const vazio: HardwareAccessSnapshot = { areas: [], portais: [], horarios: [], grupos: [], regras: [] };
    expect(reaproveitavel(vazio, '18', NOSSO_GRUPO, NOSSO_HORARIO)).toBe(false);
  });
});

describe('formaDaRegra', () => {
  const nossa = { horarioIds: ['10'], grupoIds: ['25'] };

  it('um horário e só o nosso departamento = nossa forma', () => {
    expect(formaDaRegra(nossa, '25')).toBe('nossa');
  });

  it('sem horário: o firmware trata como sempre liberada (runbook §8.3)', () => {
    expect(formaDaRegra({ ...nossa, horarioIds: [] }, '25')).toBe('sem_horario');
  });

  it('mais de um horário não cabe em "uma regra por horário"', () => {
    expect(formaDaRegra({ ...nossa, horarioIds: ['10', '11'] }, '25')).toBe('multiplos_horarios');
  });

  it('compartilhada com outro departamento', () => {
    expect(formaDaRegra({ ...nossa, grupoIds: ['25', '26'] }, '25')).toBe('compartilhada');
  });

  it('sem horário vence a checagem de compartilhada — é o aviso mais grave', () => {
    expect(formaDaRegra({ horarioIds: [], grupoIds: ['25', '26'] }, '25')).toBe('sem_horario');
  });
});
