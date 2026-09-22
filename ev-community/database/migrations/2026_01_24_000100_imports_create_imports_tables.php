<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('imports', function (Blueprint $table) {
            $table->id();
            $table->ulid('public_id')->unique();
            $table->string('number', 20)->unique();                  // IMP-2026-00001 (NumberSequence 'import')
            $table->string('type', 60);                              // importer key, e.g. exchange_rates
            $table->string('status', 20)->default('uploaded');       // uploaded|parsed|validating|validated|processing|completed|failed|cancelled
            $table->foreignId('file_attachment_id')->nullable()->constrained('attachments')->nullOnDelete();
            $table->string('original_filename', 255);
            $table->unsignedInteger('total_rows')->default(0);
            $table->unsignedInteger('valid_rows')->default(0);
            $table->unsignedInteger('invalid_rows')->default(0);
            $table->unsignedInteger('duplicate_rows')->default(0);
            $table->unsignedInteger('imported_rows')->default(0);
            $table->unsignedInteger('skipped_rows')->default(0);
            $table->unsignedInteger('failed_rows')->default(0);
            $table->foreignId('error_report_attachment_id')->nullable()->constrained('attachments')->nullOnDelete();
            $table->jsonb('options')->nullable();                    // mapping, unmapped headers, importer options
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestampTz('started_at')->nullable();
            $table->timestampTz('finished_at')->nullable();
            $table->jsonb('summary')->nullable();                    // counts, invariant, errors, duration
            $table->timestampsTz();

            $table->index(['type', 'status']);
            $table->index('status');
            $table->index(['created_by', 'created_at']);
            $table->index('created_at');
        });

        Schema::create('import_rows', function (Blueprint $table) {
            $table->id();
            $table->foreignId('import_id')->constrained('imports')->cascadeOnDelete();
            $table->unsignedInteger('row_number');                   // 1-based line number in the source file (excluding the header)
            $table->jsonb('raw');                                    // column key => raw cell string
            $table->jsonb('normalized')->nullable();                 // importer->normalizeRow() output
            $table->string('status', 20)->default('pending');        // pending|valid|invalid|duplicate|imported|skipped|failed
            $table->jsonb('errors')->nullable();                     // [{field, message}] or [message]
            $table->string('entity_type', 120)->nullable();
            $table->unsignedBigInteger('entity_id')->nullable();
            $table->timestampTz('processed_at')->nullable();

            $table->unique(['import_id', 'row_number']);
            $table->index(['import_id', 'status']);
        });

        Schema::create('exports', function (Blueprint $table) {
            $table->id();
            $table->ulid('public_id')->unique();
            $table->string('number', 20)->unique();                  // EXP-2026-00001 (NumberSequence 'export')
            $table->string('type', 60);                              // exporter key
            $table->string('status', 20)->default('queued');         // queued|processing|completed|failed|expired
            $table->jsonb('filters')->nullable();
            $table->string('format', 10)->default('csv');            // csv|xlsx
            $table->unsignedInteger('row_count')->nullable();
            $table->foreignId('file_attachment_id')->nullable()->constrained('attachments')->nullOnDelete();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->string('locale', 5)->default('ar');
            $table->timestampTz('expires_at')->nullable();
            $table->timestampTz('started_at')->nullable();
            $table->timestampTz('finished_at')->nullable();
            $table->jsonb('summary')->nullable();
            $table->timestampsTz();

            $table->index(['created_by', 'created_at']);
            $table->index(['status', 'expires_at']);
            $table->index('type');
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE imports ADD CONSTRAINT imports_status_check CHECK (status IN ('uploaded','parsed','validating','validated','processing','completed','failed','cancelled'))");
            DB::statement("ALTER TABLE import_rows ADD CONSTRAINT import_rows_status_check CHECK (status IN ('pending','valid','invalid','duplicate','imported','skipped','failed'))");
            DB::statement("ALTER TABLE exports ADD CONSTRAINT exports_status_check CHECK (status IN ('queued','processing','completed','failed','expired'))");
            DB::statement("ALTER TABLE exports ADD CONSTRAINT exports_format_check CHECK (format IN ('csv','xlsx'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('exports');
        Schema::dropIfExists('import_rows');
        Schema::dropIfExists('imports');
    }
};
