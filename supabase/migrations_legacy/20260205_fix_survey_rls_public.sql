-- Allow public (anon) access for Landing Page Surveys
CREATE POLICY "Enable public access for landing_page_projects" ON landing_page_projects
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

-- Allow public (anon) access for Website Surveys
CREATE POLICY "Enable public access for website_projects" ON website_projects
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

-- Also fix Traffic Projects just in case
CREATE POLICY "Enable public access for traffic_projects" ON traffic_projects
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);
