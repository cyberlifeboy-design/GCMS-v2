// Warning ticket violation catalog — from "Warrning tickets.docx" (LOC Golf Cart programme).
// Level 1: Warning (recoverable, on record)
// Level 2: Event ban (all sites, this event)
// Level 3: Permanent ban (all sites, all future events) — blocks the user/system access

export interface TicketViolation {
    code: string;
    text: string;
}

export const TICKET_LEVEL_LABELS: Record<1 | 2 | 3, string> = {
    1: 'Level 1 — Warning (recoverable, on record)',
    2: 'Level 2 — Event ban (all sites, this event)',
    3: 'Level 3 — Permanent ban (all sites, all future events)',
};

export const TICKET_CATALOG: Record<1 | 2 | 3, TicketViolation[]> = {
    1: [
        { code: 'L1-1', text: 'Driving above the 15 km/h speed limit in a venue zone' },
        { code: 'L1-2', text: 'Using a mobile phone or device while operating a cart' },
        { code: 'L1-3', text: 'Failing to signal before turning or changing direction' },
        { code: 'L1-4', text: 'Parking in an unapproved or operationally active area' },
        { code: 'L1-5', text: 'Carrying more passengers than the cart has seats' },
        { code: 'L1-6', text: 'Leaving keys in an unattended cart in any venue area' },
        { code: 'L1-7', text: 'Failing to return the cart at the agreed time without prior notification' },
        { code: 'L1-8', text: 'Returning the cart without cleaning it or removing personal items' },
        { code: 'L1-9', text: 'Passengers not fully seated — arms or legs outside the cart while moving' },
        { code: 'L1-10', text: 'Not wearing a seat belt where one is fitted' },
        { code: 'L1-11', text: 'Applying stickers, markings or unofficial modifications to the cart' },
        { code: 'L1-12', text: 'Exceeding the cargo weight limit on a cargo-type cart' },
        { code: 'L1-13', text: 'Using a cart outside of their approved operational time window without notifying the VLM' },
        { code: 'L1-14', text: 'Repeatedly ignoring VLM route guidance across multiple sessions within the event' },
        { code: 'L1-15', text: 'Transporting unsecured cargo that causes damage to venue equipment or other property' },
        { code: 'L1-16', text: 'Carrying a passenger in the cargo area of a cargo cart' },
    ],
    2: [
        { code: 'L2-1', text: 'Involved in a collision causing moderate damage to stadium infrastructure (e.g. fencing, signage, walls)' },
        { code: 'L2-2', text: 'Found operating a cart while under the influence of alcohol or substances' },
        { code: 'L2-3', text: 'Driving outside approved venue boundaries without authorisation' },
        { code: 'L2-4', text: 'Driving onto a pitch or playing surface / touchline area' },
        { code: 'L2-5', text: 'Transferring or sharing the cart with an unauthorised user or non-approved driver' },
        { code: 'L2-6', text: 'Ignoring a direct VUM instruction to restrict access to a specific zone' },
        { code: 'L2-7', text: 'Operating the cart during a Match Day time-restriction window without VUM approval' },
        { code: 'L2-8', text: 'Causing damage to a cart through high-speed manoeuvring (e.g. overturning, collision)' },
        { code: 'L2-9', text: "Using a cart that was not issued to them without the VLM's knowledge" },
        { code: 'L2-10', text: 'Driving on pedestrian or rubberised surfaces in restricted areas' },
        { code: 'L2-11', text: 'Abandoning the cart in an undesignated area following an incident without reporting it' },
        { code: 'L2-12', text: 'Operating a cart that has been flagged as under maintenance or not cleared for use' },
        { code: 'L2-13', text: 'Failing to report an incident or damage after it occurs, discovered later via CCTV' },
    ],
    3: [
        { code: 'L3-1', text: 'Driving on a public road outside venue boundaries' },
        { code: 'L3-2', text: 'Causing a collision resulting in injury to a pedestrian or bystander' },
        { code: 'L3-3', text: 'Deliberate or reckless driving that injures another member of staff' },
        { code: 'L3-4', text: 'Intentionally providing a false incident report or tampering with evidence' },
        { code: 'L3-5', text: 'Repeated Level 2 violations within the same event cycle' },
        { code: 'L3-6', text: 'Assault or threatening behaviour directed at VLM or Logistics staff during an investigation' },
        { code: 'L3-7', text: 'Removing, concealing, or disabling CCTV visibility of a cart during an incident' },
        { code: 'L3-8', text: 'Driving a cart under the influence causing an injury or near-miss at high speed' },
        { code: 'L3-9', text: 'Falsifying the Handover Form or signing on behalf of another individual' },
        { code: 'L3-10', text: 'Gross misconduct during a blacklisting investigation (e.g. refusing to cooperate, destroying evidence)' },
        { code: 'L3-11', text: 'Serious breach of a legal or criminal nature arising from cart use (e.g. property destruction, endangerment)' },
        { code: 'L3-12', text: 'Second or subsequent permanent-ban-level offence at any SC/LOC event' },
        { code: 'L3-13', text: 'Coordinated or group violation (e.g. multiple persons misusing carts in a planned manner)' },
    ],
};

export const INCIDENT_TYPES = [
    'Injury/Illness', 'Third Party Injury', 'Near Miss', 'Hazard',
    'Theft / Lost / Missing', 'Accident', 'Vehicle', 'Property Damage', 'Safety Incident',
] as const;

export const DESIGNATIONS = ['TDC Staff', 'LFP Staff', 'SSOC Staff', 'GWC Crew', 'Volunteer', 'Other'] as const;
export const TREATMENTS_RECEIVED = ['First Aid', 'Medical Treatment', 'Lost Time Injury', 'No treatment (notification only)'] as const;
export const TREATMENT_PROVIDERS = ['Self-Administered', 'First Aid Officer', 'Ambulance', 'Hospital', 'Doctor'] as const;
export const REPORTED_TO_OPTIONS = ['LOC Logistics', 'Health & Safety', 'GWC Crew Supervisor', 'Site / Venue Supervisor or Manager'] as const;
export const COMPLETED_BY_OPTIONS = ['TDC Manager', 'LFP Manager', 'GWC Crew / Supervisor', 'Other'] as const;

export const INVESTIGATION_CHECKLIST: Array<{ key: string; label: string }> = [
    { key: 'headLightsOperational', label: 'Head lights fully operational? (both left and right)' },
    { key: 'headLightsLensesOk', label: 'Head lights free of cracks or missing lenses?' },
    { key: 'tailLightsOperational', label: 'Tail lights operational? (both left and right)' },
    { key: 'tailLightsLensesOk', label: 'Tail light lenses cracked or missing?' },
    { key: 'brakeLightsOperational', label: 'Brake lights fully operational?' },
    { key: 'turnSignalsOperational', label: 'Turn signals fully operational? (both left and right)' },
    { key: 'tiresNoCracks', label: 'Tires free of visible cracks or uneven wear?' },
    { key: 'tiresNoForeignObjects', label: 'Tires free of foreign objects (nails/screws etc.)?' },
    { key: 'batteryCablesOk', label: 'Battery cables free of corrosion and cracks?' },
    { key: 'brakesOperable', label: 'Brakes fully operable? (i.e. stopping ability)' },
    { key: 'brakesNoNoise', label: 'Brakes free of squeak, squeal or grinding sounds?' },
    { key: 'wipersOperable', label: 'Windshield wipers operable?' },
    { key: 'windshieldClear', label: 'Windshield clear of cracks and scratches?' },
    { key: 'hornOperable', label: 'Horn operable and adequate?' },
];
