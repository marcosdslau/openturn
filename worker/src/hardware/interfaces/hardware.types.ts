export enum HardwareBrand {
  CONTROLID = 'ControlID',
  HIKVISION = 'Hikvision',
  TOPDATA = 'TopData',
  INTELBRAS = 'Intelbras',
}

/** Tipos aceitos para aplicar configuração no equipamento (por marca). */
export enum HardwareEquipmentConfigType {
  GERAL = 'GERAL',
  BOX = 'BOX',
  WEBHOOK = 'WEBHOOK',
}

export interface HardwareUser {
  /** Código PESPessoa (chave de `PESEquipamentoMapeamento` com o equipamento). */
  pescodigo: number;
  /**
   * Id do usuário no equipamento (ex.: PESIdExterno numérico, user id no Control iD).
   * Diferente de `pescodigo` quando o cadastro no leitor usa outro identificador.
   */
  id: number;
  name: string;
  password?: string;
  cpf?: string;
  limiar?: number;
  /** Departamento / grupo (PESPessoa.PESGrupo) — casado com `groups` do equipamento Control iD pelo nome ou id. */
  grupo?: string;
  tags?: string[];
  faces?: string[];
  faceExtension?: string;
  fingers?: string[];
}

/**
 * Resultado da gravação do departamento no equipamento. `aplicado: false` quando o grupo
 * solicitado não existe no equipamento (o vínculo anterior é preservado) ou a gravação falhou —
 * nesse caso quem sincroniza NÃO deve carimbar o hash da pessoa como sincronizado.
 */
export interface GrupoAplicado {
  solicitado: string | null;
  aplicado: boolean;
  motivo?: 'nao_encontrado' | 'erro';
}

/** Sentido de giro como entrada em uma área: interna = entrar na escola; externa = sair da escola. */
export type HardwareSentido = 'interna' | 'externa';

/** Regra de um sentido já canonizada: dias (7 posições dom..sab, minutos) só em modo 'horario'. */
export interface RegraSentidoHardware {
  modo: 'livre' | 'horario' | 'bloqueado';
  dias: Array<Array<[number, number]>> | null;
}

/** Departamento + regra por sentido (working/Controle-turma/SpecControlId.md). */
export interface HardwareAccessGroup {
  /** Identificador estável do perfil — compõe nomes únicos de horários no equipamento. */
  codigo: string;
  nome: string;
  interna: RegraSentidoHardware;
  externa: RegraSentidoHardware;
}

export interface HardwareRuleRef {
  accessRuleId?: string;
  timeZoneId?: string;
}

/** Ids no equipamento: departamento e, por sentido, regra de acesso + horário. */
export interface HardwareAccessGroupRef {
  groupId?: string;
  interna?: HardwareRuleRef;
  externa?: HardwareRuleRef;
}

/** Portal (id no equipamento) de cada sentido. */
export type HardwareDirectionPortals = Record<HardwareSentido, string>;

export interface HostCatraConfig {
  host: string;
  catra_role?: string | null;
  catra_side_to_enter?: string | null;
  catra_default_fsm?: string | null;
  erro?: string;
}

export interface HardwareArea {
  id: string;
  nome: string;
}

export interface HardwarePortal {
  id: string;
  nome: string;
  areaFromId: string | null;
  areaToId: string | null;
}

export interface HardwareDirectionSetup {
  areaInternaId: string;
  areaExternaId: string;
  portalInternaId: string;
  portalExternaId: string;
  criados: { areas: number; portais: number };
  portaisPreexistentes: HardwarePortal[];
  regrasReplicadas: number;
  catra: HostCatraConfig[];
}

export interface HardwareDirectionReading {
  catra: HostCatraConfig[];
  areas: HardwareArea[];
  portais: HardwarePortal[];
}

/** Intervalo como o equipamento guarda: segundos desde 00:00, com 86399 = fim do dia. */
export interface HardwareSpan {
  start: number;
  end: number;
  /** dom..sab, 0/1 */
  dias: number[];
  /** hol1..hol3, 0/1 */
  feriados: number[];
}

/** Horário do equipamento (`time_zones` + `time_spans`) como está gravado. */
export interface HardwareAccessHorario {
  id: string;
  nome: string;
  spans: HardwareSpan[];
}

/** Regra de acesso com seus vínculos, como está gravada no equipamento. */
export interface HardwareAccessRegra {
  id: string;
  nome: string;
  /** 1 = permissão, 0 = bloqueio. */
  tipo: number;
  horarioIds: string[];
  /** Portais aos quais a regra está ligada — é isto que define em que sentido ela vale. */
  portalIds: string[];
  grupoIds: string[];
}

/** Intervalo a gravar no equipamento: segundos desde 00:00 e os dias em que vale. */
export interface HardwareSpanEntrada {
  start: number;
  end: number;
  /** dom..sab */
  dias: boolean[];
  /** hol1..hol3 */
  feriados?: boolean[];
}

/** Um host do equipamento e de onde ele saiu no cadastro. */
export interface HardwareAccessHost {
  host: string;
  /** Campo de origem, ex.: "EQPConfig.ip_entry". `EQPEnderecoIp` é o ÚLTIMO fallback da precedência. */
  origem: string;
  /** true = é com este host que o sistema fala por padrão. */
  efetivo: boolean;
}

/** Retrato lido de um host específico — para comparar se os hosts têm o mesmo banco de objetos. */
export interface HardwareAccessHostSnapshot extends HardwareAccessHost {
  snapshot?: HardwareAccessSnapshot;
  erro?: string;
}

/**
 * Escrita na configuração de acesso do equipamento. Operações cruas e sem opinião: quem chama
 * decide a ordem, valida e atualiza o espelho. Departamentos e regras entram na fase 3.
 */
export interface HardwareAccessConfigOps {
  criarArea(nome: string): Promise<string>;
  renomearArea(id: string, nome: string): Promise<void>;
  /** Aresta dirigida: quem passa sai de `areaFromId` e ENTRA em `areaToId`. */
  criarPortal(nome: string, areaFromId: string, areaToId: string): Promise<string>;
  criarHorario(nome: string): Promise<string>;
  renomearHorario(id: string, nome: string): Promise<void>;
  substituirIntervalos(id: string, spans: HardwareSpanEntrada[]): Promise<void>;
  /** Não mexe nos vínculos: barrar horário em uso é responsabilidade de quem chama. */
  removerHorario(id: string): Promise<void>;
  criarGrupo(nome: string): Promise<string>;
  renomearGrupo(id: string, nome: string): Promise<void>;
  /** Regra de PERMISSÃO (`type: 1`). O modelo é allow-only: bloqueio nunca é criado. */
  criarRegra(nome: string): Promise<string>;
  renomearRegra(id: string, nome: string): Promise<void>;
  definirHorariosDaRegra(regraId: string, horarioIds: string[]): Promise<void>;
  /** É o portal que define o SENTIDO da regra — nem o departamento nem a regra têm sentido próprio. */
  definirPortaisDaRegra(regraId: string, portalIds: string[]): Promise<void>;
  ligarRegraAoGrupo(grupoId: string, regraId: string): Promise<void>;
  /** Apaga vínculos e depois a regra, na ordem que as chaves estrangeiras exigem. */
  removerRegra(regraId: string): Promise<void>;
  desligarRegraDoGrupo(grupoId: string, regraId: string): Promise<void>;
}

/** Retrato completo da configuração de acesso de um equipamento (base do espelho). */
export interface HardwareAccessSnapshot {
  areas: HardwareArea[];
  portais: HardwarePortal[];
  horarios: HardwareAccessHorario[];
  grupos: Array<{ id: string; nome: string }>;
  regras: HardwareAccessRegra[];
}

export interface HardwareAccessGroupInspection {
  encontrado: boolean;
  grupo: { id: string; nome: string } | null;
  membros: number;
  areas: HardwareArea[];
  portais: HardwarePortal[];
  regras: Array<{
    id: string;
    nome: string;
    tipo: number;
    portais: string[];
    horarios: HardwareAccessHorario[];
  }>;
}
