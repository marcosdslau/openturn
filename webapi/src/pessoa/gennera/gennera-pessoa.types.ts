export type GenneraPersonSearchResult = {
  idPerson: number;
  personName: string;
  secondaryName?: string | null;
  primaryName?: string | null;
  document?: string | null;
  documentMask?: string | null;
  email?: string | null;
  idPersonType?: number;
  active?: boolean;
  profiles?: { idProfile: number | null; name: string | null }[];
  documentName?: string | null;
  hasInstitution?: boolean;
};

export type GenneraPersonProfile = {
  idProfile?: number | null;
  profile?: string | null;
  name?: string | null;
};

export type GenneraPersonDetail = {
  idPerson: number;
  name?: string | null;
  socialName?: string | null;
  cpf?: string | null;
  email?: string | null;
  active?: boolean;
  telephoneAreaCode?: string | null;
  telephoneNumber?: string | null;
  mobilePhoneAreaCode?: string | null;
  mobilePhoneNumber?: string | null;
  photo?: string | null;
  profiles?: GenneraPersonProfile[];
};

export type GenneraSyncResult = {
  message: string;
  created?: number;
  updated?: number;
  failed?: number;
  errors?: { idPerson: number; error: string }[];
};
