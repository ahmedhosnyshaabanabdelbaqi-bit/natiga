CREATE SEQUENCE patient_barcode_number START WITH 1 MINVALUE 1 MAXVALUE 99999 NO CYCLE;
CREATE SEQUENCE bed_barcode_number START WITH 1 MINVALUE 1 MAXVALUE 99999 NO CYCLE;

ALTER TABLE patients ADD COLUMN barcode_no integer NOT NULL DEFAULT nextval('patient_barcode_number');
ALTER TABLE beds ADD COLUMN barcode_no integer NOT NULL DEFAULT nextval('bed_barcode_number');

ALTER SEQUENCE patient_barcode_number OWNED BY patients.barcode_no;
ALTER SEQUENCE bed_barcode_number OWNED BY beds.barcode_no;

CREATE UNIQUE INDEX patients_barcode_no_unique ON patients(barcode_no);
CREATE UNIQUE INDEX beds_barcode_no_unique ON beds(barcode_no);

INSERT INTO schema_migrations(version) VALUES (19) ON CONFLICT DO NOTHING;
