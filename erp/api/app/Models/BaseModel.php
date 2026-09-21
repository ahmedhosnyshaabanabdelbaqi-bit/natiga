<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;

abstract class BaseModel extends Model
{
    use BelongsToCompany;

    protected $guarded = ['id'];
}
