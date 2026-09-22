export type Severity = 'p0' | 'p1' | 'p2' | 'p3';
export type ExceptionStatus = 'open' | 'assigned' | 'resolved' | 'ignored';
export type IncidentStatus =
    | 'open'
    | 'investigating'
    | 'mitigated'
    | 'resolved'
    | 'closed';

export type PersonRef = { id: string; name: string };

export type OperationsExceptionRow = {
    id: string;
    category: string;
    severity: Severity;
    title: string;
    details: Record<string, unknown> | null;
    source: string | null;
    dedup_key: string | null;
    status: ExceptionStatus;
    assignee: PersonRef | null;
    detected_at: string | null;
    resolved_at: string | null;
    resolved_by: string | null;
    resolution: string | null;
    occurrences: number;
    created_at: string | null;
};

export type IncidentSummary = {
    id: string;
    number: string;
    severity: Severity;
    title: string;
    affected_module: string | null;
    status: IncidentStatus;
    owner: PersonRef | null;
    started_at: string | null;
    detected_at: string | null;
    resolved_at: string | null;
    created_at: string | null;
};

export type IncidentReview = Partial<
    Record<
        | 'what_went_well'
        | 'what_went_wrong'
        | 'action_items'
        | 'timeline_summary',
        string
    >
>;

export type IncidentDetail = IncidentSummary & {
    impact: string | null;
    root_cause: string | null;
    resolution: string | null;
    corrective_actions: string | null;
    review: IncidentReview;
    created_by: string | null;
};

export type IncidentEventRow = {
    id: number;
    /** created | note | status_changed | review_updated | owner_changed | updated */
    type: string;
    message: string | null;
    meta: Record<string, unknown> | null;
    author: string | null;
    created_at: string | null;
};

export type ModuleOption = { key: string; name: { ar: string; en: string } };
