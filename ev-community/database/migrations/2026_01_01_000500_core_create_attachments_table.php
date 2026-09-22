<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attachments', function (Blueprint $table) {
            $table->id();
            $table->ulid('public_id')->unique();
            $table->string('owner_type', 120)->nullable();
            $table->unsignedBigInteger('owner_id')->nullable();
            $table->string('collection', 60)->default('default');   // e.g. payment_proof, product_image, receipt_pdf
            $table->string('storage_disk', 30);
            $table->string('storage_path', 500);
            $table->string('original_filename', 255);
            $table->string('mime_type', 120);
            $table->string('extension', 12);
            $table->unsignedBigInteger('size');
            $table->string('checksum_sha256', 64)->nullable();
            $table->string('visibility', 10)->default('private');   // private|public
            $table->jsonb('variants')->nullable();                   // {thumb: path, medium: path, large: path}
            $table->jsonb('meta')->nullable();                       // width/height, pages, etc.
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('scanned_at')->nullable();
            $table->string('scan_status', 20)->default('not_scanned'); // not_scanned|clean|infected|error
            $table->timestampsTz();

            $table->index(['owner_type', 'owner_id', 'collection']);
            $table->index('uploaded_by');
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE attachments ADD CONSTRAINT attachments_visibility_check CHECK (visibility IN ('private','public'))");
            DB::statement('ALTER TABLE attachments ADD CONSTRAINT attachments_size_positive CHECK (size >= 0)');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('attachments');
    }
};
