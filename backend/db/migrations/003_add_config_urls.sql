-- Add layer1 and layer2 URLs to app_configuration table
ALTER TABLE app_configuration 
ADD COLUMN IF NOT EXISTS survey123_layer1_url TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS survey123_layer2_url TEXT DEFAULT '';

COMMENT ON COLUMN app_configuration.survey123_layer1_url IS 'URL for Layer 1 (Descriptions)';
COMMENT ON COLUMN app_configuration.survey123_layer2_url IS 'URL for Layer 2 (Facts)';
