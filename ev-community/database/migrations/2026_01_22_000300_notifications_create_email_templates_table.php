<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('email_templates', function (Blueprint $table) {
            $table->id();
            $table->string('key', 120)->unique();            // notification key, e.g. orders.confirmed
            $table->string('subject_ar', 255)->nullable();
            $table->string('subject_en', 255)->nullable();
            $table->text('body_ar')->nullable();             // plain text + line breaks + **bold** + [text](url); {{variable}} placeholders
            $table->text('body_en')->nullable();
            $table->jsonb('variables')->nullable();          // allowed variable names
            $table->boolean('is_system')->default(false);    // declared by code (TemplateRegistry / lang) vs. created by admins
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampsTz();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_templates');
    }
};
