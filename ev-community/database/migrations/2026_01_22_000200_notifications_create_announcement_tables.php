<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('announcement_campaigns', function (Blueprint $table) {
            $table->id();
            $table->ulid('public_id')->unique();
            $table->string('title_ar', 255);
            $table->string('title_en', 255);
            $table->text('body_ar');
            $table->text('body_en');
            $table->string('url', 2048)->nullable();
            $table->string('category', 30)->default('system');
            $table->string('audience_type', 40);             // all_members|vehicle_make|vehicle_model|specific_members|<registered by other modules>
            $table->jsonb('audience_params')->nullable();
            $table->jsonb('channels');                       // ["in_app","email",...] (in_app always present)
            $table->boolean('is_marketing')->default(false);
            $table->string('status', 20)->default('draft');  // draft|scheduled|sending|sent|cancelled|failed
            $table->timestampTz('scheduled_at')->nullable();
            $table->timestampTz('started_at')->nullable();
            $table->timestampTz('finished_at')->nullable();
            $table->unsignedInteger('recipients_count')->default(0);
            $table->unsignedInteger('sent_count')->default(0);
            $table->unsignedInteger('failed_count')->default(0);
            $table->text('last_error')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampsTz();

            $table->index(['status', 'scheduled_at']);
            $table->index('created_at');
        });

        Schema::create('announcement_recipients', function (Blueprint $table) {
            $table->id();
            $table->foreignId('campaign_id')->constrained('announcement_campaigns')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('notification_id')->nullable()->constrained('notifications')->nullOnDelete();
            $table->string('status', 20)->default('pending'); // pending|sent|skipped|failed
            $table->text('error')->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('sent_at')->nullable();

            $table->unique(['campaign_id', 'user_id']);
            $table->index(['campaign_id', 'status']);
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE announcement_campaigns ADD CONSTRAINT announcement_campaigns_status_check CHECK (status IN ('draft','scheduled','sending','sent','cancelled','failed'))");
            DB::statement("ALTER TABLE announcement_campaigns ADD CONSTRAINT announcement_campaigns_category_check CHECK (category IN ('orders','payments','shipping','pickup','maintenance','warranty','charging','offers','support','system'))");
            DB::statement("ALTER TABLE announcement_recipients ADD CONSTRAINT announcement_recipients_status_check CHECK (status IN ('pending','sent','skipped','failed'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('announcement_recipients');
        Schema::dropIfExists('announcement_campaigns');
    }
};
