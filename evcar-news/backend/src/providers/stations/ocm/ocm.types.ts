/**
 * Subset of the Open Charge Map API v3 POI shape (compact=false,
 * verbose=false, camelcase=false) that the mapper reads. Every field is
 * optional: the API omits nulls and older records miss fields.
 * Reference: github.com/openchargemap/ocm-system (OCM.API.Model).
 */
export interface OcmReference {
  ID?: number;
  Title?: string | null;
}

export interface OcmDataProvider extends OcmReference {
  WebsiteURL?: string | null;
  Comments?: string | null;
  License?: string | null;
  IsOpenDataLicensed?: boolean | null;
  IsRestrictedEdit?: boolean | null;
  IsApprovedImport?: boolean | null;
}

export interface OcmOperatorInfo extends OcmReference {
  WebsiteURL?: string | null;
  PhonePrimaryContact?: string | null;
  ContactEmail?: string | null;
}

export interface OcmUsageType extends OcmReference {
  IsPayAtLocation?: boolean | null;
  IsMembershipRequired?: boolean | null;
  IsAccessKeyRequired?: boolean | null;
}

export interface OcmStatusType extends OcmReference {
  IsOperational?: boolean | null;
  IsUserSelectable?: boolean | null;
}

export interface OcmAddressInfo {
  ID?: number;
  Title?: string | null;
  AddressLine1?: string | null;
  AddressLine2?: string | null;
  Town?: string | null;
  StateOrProvince?: string | null;
  Postcode?: string | null;
  CountryID?: number | null;
  Country?: { ID?: number; ISOCode?: string | null; Title?: string | null } | null;
  Latitude?: number | null;
  Longitude?: number | null;
  ContactTelephone1?: string | null;
  ContactEmail?: string | null;
  AccessComments?: string | null;
  RelatedURL?: string | null;
}

export interface OcmConnection {
  ID?: number;
  ConnectionTypeID?: number | null;
  ConnectionType?: (OcmReference & { FormalName?: string | null }) | null;
  StatusTypeID?: number | null;
  StatusType?: OcmStatusType | null;
  LevelID?: number | null;
  Amps?: number | null;
  Voltage?: number | null;
  PowerKW?: number | null;
  CurrentTypeID?: number | null;
  CurrentType?: OcmReference | null;
  Quantity?: number | null;
  Comments?: string | null;
}

export interface OcmPoi {
  ID?: number;
  UUID?: string | null;
  DataProviderID?: number | null;
  DataProvider?: OcmDataProvider | null;
  OperatorID?: number | null;
  OperatorInfo?: OcmOperatorInfo | null;
  UsageTypeID?: number | null;
  UsageType?: OcmUsageType | null;
  UsageCost?: string | null;
  AddressInfo?: OcmAddressInfo | null;
  Connections?: OcmConnection[] | null;
  NumberOfPoints?: number | null;
  GeneralComments?: string | null;
  StatusTypeID?: number | null;
  StatusType?: OcmStatusType | null;
  DateLastConfirmed?: string | null;
  DateLastVerified?: string | null;
  DateLastStatusUpdate?: string | null;
  DateCreated?: string | null;
  DataQualityLevel?: number | null;
  SubmissionStatusTypeID?: number | null;
}

/** OCM StandardStatusTypes. */
export const OCM_STATUS = {
  UNKNOWN: 0,
  CURRENTLY_AVAILABLE: 10,
  CURRENTLY_IN_USE: 20,
  TEMPORARILY_UNAVAILABLE: 30,
  OPERATIONAL: 50,
  PARTLY_OPERATIONAL: 75,
  NOT_OPERATIONAL: 100,
  PLANNED: 150,
  REMOVED_DECOMMISSIONED: 200,
  REMOVED_DUPLICATE: 210,
} as const;

/** OCM StandardCurrentTypes. */
export const OCM_CURRENT = { AC_SINGLE_PHASE: 10, AC_THREE_PHASE: 20, DC: 30 } as const;

/** OCM "(Unknown Operator)". */
export const OCM_UNKNOWN_OPERATOR_ID = 1;

export const OCM_ATTRIBUTION = 'Open Charge Map (openchargemap.org)';
export const OCM_USER_DATA_LICENCE = 'CC BY 4.0';
