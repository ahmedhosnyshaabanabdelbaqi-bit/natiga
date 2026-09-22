import { useMemo } from 'react';

type Props = { html: string; dir: 'rtl' | 'ltr'; lang: string; title: string; className?: string };

/**
 * Shows server-rendered (already escaped) email HTML inside a fully sandboxed iframe: no scripts, no same-origin
 * access, no navigation. Defense in depth for previews of admin-edited templates.
 */
export function EmailFrame({ html, dir, lang, title, className }: Props) {
    const srcDoc = useMemo(
        () =>
            `<!DOCTYPE html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><style>` +
            'body{margin:0;padding:16px;font-family:Cairo,Inter,Arial,sans-serif;font-size:14px;line-height:1.7;color:#0f172a;background:#fff}' +
            'p{margin:0 0 12px}a{color:#0F766E}</style></head><body>' +
            html +
            '</body></html>',
        [html, dir, lang],
    );
    return <iframe title={title} sandbox="" srcDoc={srcDoc} className={className ?? 'h-56 w-full rounded-md border bg-white'} />;
}
