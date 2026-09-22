export type PaginationLink = { url: string | null; label: string; active: boolean };

/** Laravel LengthAwarePaginator JSON shape. */
export type Paginated<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
    links: PaginationLink[];
    first_page_url: string;
    last_page_url: string;
    next_page_url: string | null;
    prev_page_url: string | null;
    path: string;
};

/** Laravel Paginator (simple) JSON shape. */
export type SimplePaginated<T> = {
    data: T[];
    current_page: number;
    per_page: number;
    from: number | null;
    to: number | null;
    next_page_url: string | null;
    prev_page_url: string | null;
    path: string;
};

/** Resource-collection pagination shape ({ data, links, meta }). */
export type ResourcePaginated<T> = {
    data: T[];
    links: { first: string | null; last: string | null; prev: string | null; next: string | null };
    meta: { current_page: number; from: number | null; last_page: number; per_page: number; to: number | null; total: number; links: PaginationLink[] };
};
