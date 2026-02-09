
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkSales() {
    const startOfMonth = '2026-02-01T00:00:00.000Z';

    console.log('Fetching acceptances since:', startOfMonth);

    const { data: acceptances, error } = await supabase
        .from('acceptances')
        .select(`
            id,
            company_name,
            timestamp,
            proposal_id,
            contract_snapshot,
            proposal:proposals (
                id,
                monthly_fee,
                setup_fee,
                services
            )
        `)
        .gte('timestamp', startOfMonth);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Found acceptances:', acceptances?.length);

    if (!acceptances) return;

    let total = 0;

    acceptances.forEach((acc: any) => {
        let monthly = acc.proposal?.monthly_fee || 0;
        let setup = acc.proposal?.setup_fee || 0;

        // Check snapshot if proposal is missing
        if (!acc.proposal && acc.contract_snapshot && acc.contract_snapshot.proposal) {
            monthly = acc.contract_snapshot.proposal.monthly_fee || 0;
            setup = acc.contract_snapshot.proposal.setup_fee || 0;
            console.log(`(Using Snapshot for ${acc.company_name})`);
        }

        const subtotal = monthly + setup;
        total += subtotal;

        console.log(`
        ID: ${acc.id}
        Company: ${acc.company_name}
        Date: ${acc.timestamp}
        Proposal ID: ${acc.proposal_id}
        Monthly: ${monthly}
        Setup: ${setup}
        Subtotal: ${subtotal}
        Snapshot: ${!!acc.contract_snapshot}
        -------------------`);
    });

    console.log('Total Calculated:', total);
}

checkSales();
