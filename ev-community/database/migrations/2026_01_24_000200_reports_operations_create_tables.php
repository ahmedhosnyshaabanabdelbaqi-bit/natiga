<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('operations_exceptions', function (Blueprint $table) {
            $table->id();
            $table->ulid('public_id')->unique();
            $table->string('category', 30);              // finance|inventory|orders|shipping|maintenance|integrations|notifications|security|data_quality
            $table->string('severity', 2);               // p0|p1|p2|p3
            $table->string('title', 255);
            $table->jsonb('details')->nullable();
            $table->string('source', 120)->nullable();   // command|job|service class or name
            $table->string('dedup_key', 191)->nullable();
            $table->string('status', 20)->default('open'); // open|assigned|resolved|ignored
            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('detected_at');
            $table->timestampTz('resolved_at')->nullable();
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('resolution')->nullable();
            $table->unsignedInteger('occurrences')->default(1);
            $table->timestampsTz();

            $table->index(['status', 'severity', 'detected_at']);
            $table->index(['category', 'status']);
            $table->index('assigned_to');
        });

        Schema::create('incidents', function (Blueprint $table) {
            $table->id();
            $table->ulid('public_id')->unique();
            $table->string('number', 20)->unique();      // INC-YYYY-NNNN
            $table->string('severity', 2);               // p0|p1|p2|p3
            $table->string('title', 255);
            $table->string('affected_module', 40)->nullable();
            $table->text('impact')->nullable();
            $table->string('status', 20)->default('open'); // open|investigating|mitigated|resolved|closed
            $table->timestampTz('started_at');
            $table->timestampTz('detected_at');
            $table->timestampTz('resolved_at')->nullable();
            $table->foreignId('owner_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('root_cause')->nullable();
            $table->text('resolution')->nullable();
            $table->text('corrective_actions')->nullable();
            $table->jsonb('review')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampsTz();

            $table->index(['status', 'severity', 'started_at']);
            $table->index('owner_id');
        });

        Schema::create('incident_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('incident_id')->constrained('incidents')->restrictOnDelete();
            $table->string('type', 30);                  // created|note|status_changed|review_updated|owner_changed
            $table->text('message')->nullable();
            $table->jsonb('meta')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('created_at');

            $table->index(['incident_id', 'created_at']);
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE operations_exceptions ADD CONSTRAINT operations_exceptions_category_check CHECK (category IN ('finance','inventory','orders','shipping','maintenance','integrations','notifications','security','data_quality'))");
            DB::statement("ALTER TABLE operations_exceptions ADD CONSTRAINT operations_exceptions_severity_check CHECK (severity IN ('p0','p1','p2','p3'))");
            DB::statement("ALTER TABLE operations_exceptions ADD CONSTRAINT operations_exceptions_status_check CHECK (status IN ('open','assigned','resolved','ignored'))");
            DB::statement('ALTER TABLE operations_exceptions ADD CONSTRAINT operations_exceptions_occurrences_positive CHECK (occurrences > 0)');
            // Deduplication: one *live* exception per key; resolved/ignored rows keep their key for history.
            DB::statement("CREATE UNIQUE INDEX operations_exceptions_dedup_open_unique ON operations_exceptions (dedup_key) WHERE dedup_key IS NOT NULL AND status IN ('open','assigned')");
            DB::statement("ALTER TABLE incidents ADD CONSTRAINT incidents_severity_check CHECK (severity IN ('p0','p1','p2','p3'))");
            DB::statement("ALTER TABLE incidents ADD CONSTRAINT incidents_status_check CHECK (status IN ('open','investigating','mitigated','resolved','closed'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('incident_events');
        Schema::dropIfExists('incidents');
        Schema::dropIfExists('operations_exceptions');
    }
};
