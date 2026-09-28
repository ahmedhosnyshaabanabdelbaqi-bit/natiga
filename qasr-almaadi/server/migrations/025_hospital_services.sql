CREATE TABLE hospital_radiology (
 id text PRIMARY KEY,
 admission_id text NOT NULL REFERENCES admissions(id),
 name text NOT NULL,
 priority text NOT NULL DEFAULT 'routine' CHECK(priority IN ('routine','urgent')),
 status text NOT NULL DEFAULT 'ordered' CHECK(status IN ('ordered','scheduled','performed','reported','reviewed','cancelled')),
 scheduled_at timestamptz,
 performed_at timestamptz,
 reported_at timestamptz,
 reviewed_at timestamptz,
 result text,
 reason text,
 price_id text REFERENCES prices(id),
 charge_id text UNIQUE REFERENCES charges(id),
 created_by text NOT NULL REFERENCES users(id),
 performed_by text REFERENCES users(id),
 reported_by text REFERENCES users(id),
 reviewed_by text REFERENCES users(id),
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE hospital_theatres (
 name text PRIMARY KEY
);
CREATE TABLE hospital_surgeries (
 id text PRIMARY KEY,
 admission_id text NOT NULL REFERENCES admissions(id),
 name text NOT NULL,
 status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','in_progress','completed','reviewed','cancelled')),
 scheduled_at timestamptz NOT NULL,
 scheduled_end_at timestamptz NOT NULL,
 theatre text NOT NULL REFERENCES hospital_theatres(name),
 surgeon_id text NOT NULL REFERENCES users(id),
 started_at timestamptz,
 completed_at timestamptz,
 reviewed_at timestamptz,
 result text,
 reason text,
 price_id text REFERENCES prices(id),
 charge_id text UNIQUE REFERENCES charges(id),
 created_by text NOT NULL REFERENCES users(id),
 completed_by text REFERENCES users(id),
 reviewed_by text REFERENCES users(id),
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(scheduled_end_at>scheduled_at)
);
CREATE TABLE pharmacy_dispenses (
 id text PRIMARY KEY,
 admission_id text NOT NULL REFERENCES admissions(id),
 order_id text NOT NULL REFERENCES orders(id),
 order_version integer NOT NULL,
 order_snapshot jsonb NOT NULL,
 item_id text NOT NULL REFERENCES inventory(id),
 item_name text NOT NULL,
 batch text NOT NULL,
 unit text NOT NULL,
 quantity numeric NOT NULL CHECK(quantity>0),
 movement_id text UNIQUE NOT NULL REFERENCES stock_movements(id),
 charge_id text UNIQUE REFERENCES charges(id),
 actor_id text NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE hospital_service_events (
 id text PRIMARY KEY,
 service_type text NOT NULL CHECK(service_type IN ('radiology','surgery')),
 service_id text NOT NULL,
 admission_id text NOT NULL REFERENCES admissions(id),
 previous_status text,
 status text NOT NULL,
 previous_version integer,
 result text,
 reason text,
 actor_id text NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hospital_radiology_queue ON hospital_radiology(status,created_at);
CREATE INDEX hospital_radiology_admission ON hospital_radiology(admission_id);
CREATE INDEX hospital_surgery_queue ON hospital_surgeries(status,scheduled_at);
CREATE INDEX hospital_surgery_admission ON hospital_surgeries(admission_id);
CREATE INDEX hospital_surgery_theatre_time ON hospital_surgeries(theatre,scheduled_at,scheduled_end_at);
CREATE INDEX pharmacy_dispense_order ON pharmacy_dispenses(order_id,created_at);
CREATE INDEX pharmacy_dispense_admission ON pharmacy_dispenses(admission_id,created_at);
CREATE INDEX hospital_service_event_history ON hospital_service_events(service_type,service_id,created_at);
