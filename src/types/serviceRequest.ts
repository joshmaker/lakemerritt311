/** Known OAK 311 statuses, as of the dataset documentation. */
export const REQUEST_STATUSES = [
  "PENDING", // Received for review
  "OPEN", // Assigned to a work unit
  "WOCREATE", // Work order created (not all units use this; OPEN requests may also have work orders)
  "CLOSED", // Resolved
  "REFERRED", // Forwarded to another entity (see referredto)
  "UNFUNDED", // City isn't funded to provide this service
  "CANCEL", // Created in error, test/training, or duplicate of an unresolved request
  "WAITING ON CUSTOMER", // Staff need info from the customer
  "EVALUATED - NO FURTHER ACTION", // Evaluated; no action will be taken
  "GONE ON ARRIVAL", // Staff couldn't verify the issue on site
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** One record from `data/api/311.json`. All values are strings in the JSON. */
export interface ServiceRequest {
  /** Service request number, numeric string. 5-digit IDs are pre-Aug-2012 Recycling Hotline records. */
  requestid: string;
  /** Street address or named place. "ZZ" means no address was recorded. */
  probaddress: string;
  /** ISO 8601, no timezone offset; assume California time. */
  datetimeinit: string;
  /** Absent for requests that aren't closed. */
  datetimeclosed?: string;
  /** Request category code, e.g. "PARKS". Open-ended. */
  reqcategory: string;
  /** Type of issue, e.g. "Litter in Parks". Open-ended. */
  description: string;
  /** Status snapshot as of upload. Typed as `string` because the city may add new values. */
  status: string;
  /** Only present when status is "REFERRED". */
  referredto?: string;
}

export type ServiceRequests = ServiceRequest[];
