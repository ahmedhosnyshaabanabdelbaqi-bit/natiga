<?php

namespace Database\Seeders\System;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Placeholder policy versions so consent logging has a version to reference. The legal texts MUST be
 * reviewed and replaced by the business owner before production (see docs/GO_LIVE_CHECKLIST.md).
 */
class PolicySeeder extends Seeder
{
    public function run(): void
    {
        foreach (['terms' => ['الشروط والأحكام', 'Terms and Conditions'], 'privacy' => ['سياسة الخصوصية', 'Privacy Policy']] as $type => [$ar, $en]) {
            if (DB::table('policy_versions')->where('type', $type)->exists()) {
                continue;
            }
            DB::table('policy_versions')->insert([
                'type' => $type, 'version' => '1.0',
                'content_ar' => "# {$ar}\n\nهذه نسخة أولية تحتاج إلى اعتماد صاحب النشاط والمستشار القانوني قبل الإطلاق.",
                'content_en' => "# {$en}\n\nInitial draft. Must be approved by the business owner and legal counsel before launch.",
                'summary_ar' => $ar, 'summary_en' => $en, 'requires_reacceptance' => false, 'published_at' => now(), 'created_at' => now(), 'updated_at' => now(),
            ]);
        }
    }
}
