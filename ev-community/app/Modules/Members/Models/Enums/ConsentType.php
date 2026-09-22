<?php

namespace App\Modules\Members\Models\Enums;

use App\Support\Concerns\EnumOptions;
use App\Support\Contracts\HasLabel;

enum ConsentType: string implements HasLabel
{
    use EnumOptions;

    case Terms = 'terms';
    case Privacy = 'privacy';
    case MarketingEmail = 'marketing_email';
    case MarketingSms = 'marketing_sms';
    case MarketingWhatsapp = 'marketing_whatsapp';

    public function label(): string
    {
        return __('privacy.consents.'.$this->value);
    }

    /** @return self[] */
    public static function marketing(): array
    {
        return [self::MarketingEmail, self::MarketingSms, self::MarketingWhatsapp];
    }

    public function isMarketing(): bool
    {
        return in_array($this, self::marketing(), true);
    }
}
