import {
  extractHoursFromCron,
  isLastScheduledHour,
  localDayIsoDate,
  toLocalHour,
} from './cron-hour.utils';

describe('extractHoursFromCron', () => {
  it('extrai horas de cron com 5 campos', () => {
    expect(extractHoursFromCron('0 9,15,22 * * *')).toEqual([9, 15, 22]);
  });

  it('extrai horas de cron com 6 campos', () => {
    expect(extractHoursFromCron('0 0 9,15,22 * * *')).toEqual([9, 15, 22]);
  });

  it('expande range de horas', () => {
    expect(extractHoursFromCron('0 8-10 * * *')).toEqual([8, 9, 10]);
  });

  it('retorna vazio para expressão inválida', () => {
    expect(extractHoursFromCron('invalid')).toEqual([]);
  });
});

describe('toLocalHour', () => {
  it('converte UTC para hora local com fuso -3', () => {
    const utc = new Date('2026-07-09T01:00:00.000Z');
    expect(toLocalHour(utc, -3)).toBe(22);
  });
});

describe('isLastScheduledHour', () => {
  const cronExpr = '0 9,15,22 * * *';
  const fuso = -3;

  it('retorna false na primeira execução do dia', () => {
    const now = new Date('2026-07-09T12:00:00.000Z');
    expect(isLastScheduledHour(cronExpr, now, fuso)).toBe(false);
  });

  it('retorna true na última execução do dia', () => {
    const now = new Date('2026-07-09T01:00:00.000Z');
    expect(isLastScheduledHour(cronExpr, now, fuso)).toBe(true);
  });

  it('funciona com cron de 6 campos', () => {
    const cron6 = '0 0 9,15,22 * * *';
    const now = new Date('2026-07-09T01:00:00.000Z');
    expect(isLastScheduledHour(cron6, now, fuso)).toBe(true);
  });

  it('cron de frequência: true às 23:58 locais, false às 12:00 locais', () => {
    const cronFreq = '58 23 * * *';
    expect(isLastScheduledHour(cronFreq, new Date('2026-08-08T02:58:00.000Z'), fuso)).toBe(true);
    expect(isLastScheduledHour(cronFreq, new Date('2026-08-07T15:00:00.000Z'), fuso)).toBe(false);
  });
});

describe('localDayIsoDate', () => {
  it('usa o dia civil local da instituição', () => {
    // 01:10Z de 08/08 ainda é 07/08 no fuso -3
    expect(localDayIsoDate(new Date('2026-08-08T01:10:00.000Z'), -3)).toBe('2026-08-07');
    expect(localDayIsoDate(new Date('2026-08-08T03:10:00.000Z'), -3)).toBe('2026-08-08');
  });

  it('fuso 0 equivale ao dia UTC', () => {
    expect(localDayIsoDate(new Date('2026-08-07T23:59:00.000Z'), 0)).toBe('2026-08-07');
  });
});
