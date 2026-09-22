<?php

declare(strict_types=1);

namespace App\Modules\Core\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 */
class DocumentSequence extends Model
{
    protected $table = 'document_sequences';

    protected $guarded = ['id'];
}
