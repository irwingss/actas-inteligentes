-- Add columns for related tables and system fields
ALTER TABLE arcgis_records ADD COLUMN descrip_1 TEXT;
ALTER TABLE arcgis_records ADD COLUMN hecho_detec_1 TEXT;
ALTER TABLE arcgis_records ADD COLUMN descrip_2 TEXT;
ALTER TABLE arcgis_records ADD COLUMN guid TEXT;
ALTER TABLE arcgis_records ADD COLUMN created_user TEXT;
ALTER TABLE arcgis_records ADD COLUMN created_date TEXT;
ALTER TABLE arcgis_records ADD COLUMN last_edited_user TEXT;
ALTER TABLE arcgis_records ADD COLUMN last_edited_date TEXT;
