import {
  extractHoursFromCron,
  isLastScheduledHour,
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
});
