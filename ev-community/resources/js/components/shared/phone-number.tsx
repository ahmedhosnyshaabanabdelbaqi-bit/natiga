import { MessageCircle, Phone } from 'lucide-react';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Props = {
    value: string | null | undefined;
    /** Also render a WhatsApp deep link next to the number. */
    whatsapp?: boolean;
    /** Show a phone icon before the number. */
    icon?: boolean;
    className?: string;
};

function digitsOf(value: string): string {
    return value.replace(/[^\d+]/g, '');
}

/** Renders a phone number as a forced-LTR `tel:` link (numbers never flip in RTL). */
export function PhoneNumber({
    value,
    whatsapp = false,
    icon = false,
    className,
}: Props) {
    if (!value) {
        return (
            <span className={cn('text-muted-foreground', className)}>—</span>
        );
    }
    const digits = digitsOf(value);
    const international = digits.startsWith('+')
        ? digits.slice(1)
        : digits.startsWith('0')
          ? `20${digits.slice(1)}`
          : digits;

    return (
        <span className={cn('inline-flex items-center gap-1.5', className)}>
            {icon ? (
                <Phone
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                />
            ) : null}
            <a
                href={`tel:${digits}`}
                dir="ltr"
                className="code underline-offset-4 hover:underline"
                aria-label={t('ui.phone.call', { number: value })}
            >
                {value}
            </a>
            {whatsapp ? (
                <a
                    href={`https://wa.me/${international}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex size-6 items-center justify-center rounded-md text-success hover:bg-success-soft"
                    aria-label={t('ui.phone.whatsapp', { number: value })}
                >
                    <MessageCircle className="size-4" aria-hidden="true" />
                </a>
            ) : null}
        </span>
    );
}
