# Lake Merritt Data Vis

Data visualizations of Oakland 311 service requests.

## Tech stack

- **Language:** TypeScript only. Do not add `.js` files for source code.
  - Keep `strict: true` in `tsconfig.json`.
  - Avoid `any`; use the types in `src/types/` (or add new ones there).
- **Charts:** Apache ECharts (`echarts` package).
  - Import from `echarts/core` and register only the charts/components you use, to keep bundles small.
  - Use ECharts' own option types (e.g. `EChartsOption`) for chart configs.
  - Dispose chart instances on teardown and call `resize()` on container resize.

## API Data files: do not read

**Do not open, read, cat, grep, or otherwise load files in `data/api/`.** They may be very large
and will flood the context window. Everything you need about their structure is documented below.

If you need to verify something about the data, write a small script that streams or samples
the file and prints a summary (counts, distinct values, min/max dates), then ask before running it.

## Schema: `data/api/311.json`

A JSON array of Oakland 311 service request records (OAK 311). All values are strings in the JSON.

```ts
export type RequestStatus =
  | "PENDING"                        // Received for review
  | "OPEN"                           // Assigned to a work unit
  | "WOCREATE"                       // Work order created (not all units use this; OPEN requests may also have work orders)
  | "CLOSED"                         // Resolved
  | "REFERRED"                       // Forwarded to another entity (see referredto)
  | "UNFUNDED"                       // City isn't funded to provide this service
  | "CANCEL"                         // Created in error, test/training, or duplicate of an unresolved request
  | "WAITING ON CUSTOMER"            // Staff need info from the customer
  | "EVALUATED - NO FURTHER ACTION"  // Evaluated; no action will be taken
  | "GONE ON ARRIVAL";               // Staff couldn't verify the issue on site

export interface ServiceRequest {
  /** Service request number, numeric string. Display as an integer with no decimals.
   *  5-digit IDs came from the Recycling Hotline's prior system (imported Aug 2012);
   *  all others are 6 digits. */
  requestid: string;
  /** Problem location: street address ("529 GRAND AVE") or named place
   *  ("LAKESIDE PARK - PERGOLA"). "ZZ" means no address was recorded
   *  (usually general Recycling Hotline inquiries). */
  probaddress: string;
  /** Date the request was initiated. ISO 8601, no timezone offset, assume California
   *  e.g. "2026-09-21T15:45:14.000". */
  datetimeinit: string;
  /** Date the request was closed. Absent for requests that aren't closed. */
  datetimeclosed?: string;
  /** Request category code, e.g. "HOMELESS EMT", "PARKS", "BLDGMAINT" */
  reqcategory: string;
  /** Type of issue, e.g. "Litter in Parks". See notes below. */
  description: string;
  /** Status as of the date of upload. */
  status: RequestStatus;
  /** Who the request was referred to. Only present when status is "REFERRED". */
  referredto?: string;
  /** Longitude, as a numeric string. May be missing. (SoQL: make_point(sry, srx)) */
  srx?: string;
  /** Latitude, as a numeric string. May be missing. */
  sry?: string;
}

export type ServiceRequests = ServiceRequest[];
```

Example records:

```json
[
  {"requestid":"1668999","probaddress":"636-648 BELLEVUE AVE","datetimeinit":"2026-09-21T15:45:14.000","reqcategory":"HOMELESS EMT","description":"Homeless Encampment","status":"PENDING"},
  {"requestid":"1668895","probaddress":"LAKESIDE PARK - PERGOLA","datetimeinit":"2026-09-21T12:24:24.000","reqcategory":"PARKS","description":"Litter in Parks","status":"OPEN"},
  {"requestid":"1668702","probaddress":"529 GRAND AVE","datetimeinit":"2026-09-20T17:38:39.000","reqcategory":"BLDGMAINT","description":"Park - Tot Lots, Tables, Benches","status":"OPEN"}
]
```

### Data-handling rules

- **Filter out test tickets.** Exclude records whose `description` is `"test template"` or
  `"This is a test subject. Ignore this ticket."`. Many `CANCEL` records are also test or
  duplicate entries, so consider excluding them from volume counts.
- **Recycling Hotline requests.** Descriptions starting with `Business`, `City Services`,
  `CityBldg`, `Events`, or `Misc` come from the Recycling Hotline. 5-digit `requestid`s are
  also Hotline records predating Aug 2012.
- **Abbreviations.** "TE" in a description means "Traffic Engineering". Expand it in chart labels.
- **Status is a snapshot**, not history: it reflects state at upload time. Don't present it as a timeline of status changes.
- **Resolution time** = `datetimeclosed - datetimeinit`, only for records that have `datetimeclosed`.
- `reqcategory` and `description` values are open-ended; derive them from the data rather than
  hardcoding unions. For `status`, handle unknown values gracefully (log and bucket as "Other")
  in case the city adds new ones.

Full dataset documentation:
https://data.oaklandca.gov/Infrastructure/Service-requests-received-by-the-Oakland-Call-Cent/quth-gb8e/about_data
