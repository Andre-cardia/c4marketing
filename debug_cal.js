
const apiKey = 'cal_live_dce1007edad18303ba5dedbb992d83e6';
const url = `https://api.cal.com/v2/bookings?status=upcoming&limit=100`;

console.log('Fetching from:', url);

async function fetchBookings() {
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        console.log('Data Type:', typeof data.data);
        console.log('Is Array?', Array.isArray(data.data));
        console.log('Data Content:', JSON.stringify(data.data, null, 2));

    } catch (error) {
        console.error('Fetch error:', error);
    }
}

fetchBookings();
