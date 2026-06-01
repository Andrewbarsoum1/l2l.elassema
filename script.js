import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// Configuration for project 'BlockChain'
const supabaseUrl = 'https://ornktabwvrocypauqtkf.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybmt0YWJ3dnJvY3lwYXVxdGtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTM4OTQsImV4cCI6MjA4NTM4OTg5NH0.3LKzBo_xDCNSh359ey9MHi7Xw4I8qcPIXmeDXRdoZ_4'

const supabase = createClient(supabaseUrl, supabaseKey)
console.log('Supabase client initialized')

// Verify connection
async function checkConnection() {
    const statusDiv = document.getElementById('connectionStatus');
    if (!statusDiv) return;

    statusDiv.textContent = 'Checking connection...';
    statusDiv.style.color = '#666';

    // Try to select from the 'History' table (limit 1) to verify access
    const { data, error } = await supabase.from('History').select('id').limit(1);

    if (error) {
        console.error('Connection check failed:', error);
        // It might be empty, which returns no error but empty data, passing verified
        // But if table doesn't exist, it throws error.

        // Handling "PGRST204" (table not found) or auth errors
        statusDiv.textContent = 'Connection Status: ' + error.message;
        statusDiv.style.color = 'red';
    } else {
        console.log('Connection successful');
        statusDiv.textContent = 'Connected to Supabase (History table accessible)';
        statusDiv.style.color = 'green';
    }
}

// Keep track of the last successful save timestamp to prevent duplicate saves of the same data batch
let lastSaveTime = 0;

// Expose save function to window so the button can call it
window.saveToSupabase = async function () {
    const table = document.querySelector("#patientTable tbody");
    const statusDiv = document.getElementById('connectionStatus');

    if (!table || table.rows.length === 0) {
        alert("No data to save.");
        return;
    }

    // Check for duplicates in the database (same name and tests, created today)
    const today = new Date().toISOString().split('T')[0];

    // Fetch records created today to compare
    const { data: existingRecords, error: fetchError } = await supabase
        .from('History')
        .select('name, Test_Name')
        .gte('created_at', today);

    if (fetchError) {
        console.error('Error checking duplicates:', fetchError);
        // Continue? Or warn? Let's warn but proceed with caution logic below
    }

    statusDiv.textContent = 'Saving data...';
    statusDiv.style.color = 'blue';

    const records = [];
    for (let i = 0; i < table.rows.length; i++) {
        const row = table.rows[i];
        // Cells: 0=#, 1=Name, 2=Age, 3=Tests, 4=Price, 5=Actions
        const name = row.cells[1].textContent;
        const tests = row.cells[3].textContent;
        const priceText = row.cells[4].textContent;
        const price = parseInt(priceText) || 0;

        // Schema: "Price" (int), "Test_Name" (text[]), "Name" (text)
        // Split tests string into an array. Tests are usually comma separated in the table cell.
        // Assuming tests are separated by ", ".
        let testArray = [];
        if (tests) {
            testArray = tests.split(',').map(t => t.trim()).filter(t => t !== "");
        }

        records.push({
            "name": name,
            "Price": price,
            "Test_Name": testArray
        });
    }

    // Filter out records that already exist
    const uniqueRecords = records.filter(record => {
        // Check if this record matches any in existingRecords
        if (!existingRecords) return true;

        const isDuplicate = existingRecords.some(existing => {
            // Check Name
            if (existing.name !== record.name) return false;

            // Check Tests (Arrays)
            // Ideally we sort them to ensure order doesn't matter, but usually input is consistent.
            // Let's simply join and compare strings.
            const t1 = Array.isArray(existing.Test_Name) ? existing.Test_Name.sort().join(',') : (existing.Test_Name || '');
            const t2 = Array.isArray(record.Test_Name) ? [...record.Test_Name].sort().join(',') : (record.Test_Name || '');

            return t1 === t2;
        });

        if (isDuplicate) {
            console.log(`Duplicate found for ${record.name}. Skipping.`);
        }
        return !isDuplicate;
    });

    if (uniqueRecords.length === 0) {
        alert("All data currently in the table has already been saved to the database today.");
        statusDiv.textContent = 'Data already saved.';
        statusDiv.style.color = '#e67300'; // Orange
        return;
    }

    if (uniqueRecords.length < records.length) {
        const confirmSave = confirm(`Found ${records.length - uniqueRecords.length} duplicate records that are already saved. Do you want to save only the ${uniqueRecords.length} new records?`);
        if (!confirmSave) {
            statusDiv.textContent = 'Save cancelled by user.';
            return;
        }
    }

    const { data, error } = await supabase
        .from('History')
        .insert(uniqueRecords);

    if (error) {
        console.error('Error saving:', error);
        alert('Error saving to database: ' + error.message);
        statusDiv.textContent = 'Error saving data: ' + error.message;
        statusDiv.style.color = 'red';
    } else {
        console.log('Data saved:', data);
        alert('Data saved successfully!');
        statusDiv.textContent = 'Data saved successfully';
        statusDiv.style.color = 'green';
        lastSaveTime = Date.now();
    }
}

// Run check on load
checkConnection();
