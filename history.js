import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// Configuration (Same as main script)
const supabaseUrl = 'https://ornktabwvrocypauqtkf.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybmt0YWJ3dnJvY3lwYXVxdGtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTM4OTQsImV4cCI6MjA4NTM4OTg5NH0.3LKzBo_xDCNSh359ey9MHi7Xw4I8qcPIXmeDXRdoZ_4'

const supabase = createClient(supabaseUrl, supabaseKey)

$(document).ready(async function () {
    console.log('Fetching history data...');

    const { data: historyData, error } = await supabase
        .from('History')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching data:', error);
        alert('Error loading data: ' + error.message);
        return;
    }

    // Populate Table
    const tableBody = $('#historyTable tbody');
    tableBody.empty(); // Clear loading message

    historyData.forEach(row => {
        // Store ISO date in data attribute for filtering
        const date = new Date(row.created_at).toLocaleString();
        const rawDate = row.created_at.split('T')[0]; // YYYY-MM-DD
        const name = row.name || 'Unknown';

        let tests = '';
        if (Array.isArray(row.Test_Name)) {
            tests = row.Test_Name.join(', ');
        } else {
            // Fallback for old data where Test_Name might be a string or combined string
            tests = row.Test_Name || '-';
        }

        // We store the full tests list in a data attribute so we can restore it or filter it
        const tr = `
            <tr>
                <td data-date="${rawDate}">${date}</td>
                <td>${name}</td>
                <td data-full-tests="${tests}">${tests}</td>
                <td data-original-price="${row.Price}">${row.Price}</td>
            </tr>
        `;
        tableBody.append(tr);
    });

    // Initialize DataTables with individual column searching
    // Setup - add a text input to each footer cell
    $('#historyTable tfoot th').each(function () {
        var title = $(this).text();
        $(this).html('<input type="text" id="' + title + '"placeholder="Search ' + title + '" />');
    });

    // Custom filtering function which will search data in column 1 (Date)
    $.fn.dataTable.ext.search.push(
        function (settings, data, dataIndex) {
            var min = $('#minDate').val();
            var max = $('#maxDate').val();

            // DataTables data[0] is the text content (Date). 
            // Using logic to get the data-date attribute from the node
            var dateCell = settings.aoData[dataIndex].anCells[0];
            var dateStr = $(dateCell).attr('data-date'); // YYYY-MM-DD

            if (!dateStr) return true; // No date found? show it

            if ((min === "" && max === "") ||
                (min === "" && dateStr <= max) ||
                (min <= dateStr && max === "") ||
                (min <= dateStr && dateStr <= max)) {
                return true;
            }
            return false;
        }
    );

    // DataTable
    var table = $('#historyTable').DataTable({
        dom: 'Bfrtip',
        buttons: [
            'copy', 'csv', 'excel', 'pdf', 'print'
        ],
        initComplete: function () {
            // Apply the search
            this.api().columns().every(function () {
                var that = this;
                $('input', this.footer()).on('keyup change clear', function () {
                    // Standard DataTables search for most columns
                    if (that.search() !== this.value) {
                        that.search(this.value).draw();
                    }
                });
            });
        },
        footerCallback: function (row, data, start, end, display) {
            var api = this.api();

            // Helper to convert string to int
            var intVal = function (i) {
                return typeof i === 'string' ?
                    i.replace(/[\$,]/g, '') * 1 :
                    typeof i === 'number' ?
                        i : 0;
            };

            // Total over all pages (filtered)
            var total = api
                .column(3, { page: 'current' }) // Column index 3 is Price (Date, Name, Tests, Price)
                .data()
                .reduce(function (a, b) {
                    return intVal(a) + intVal(b);
                }, 0);

            // Update footer
            $(api.column(3).footer()).html(
                'Total: ' + total
            );

            // Update Count
            var count = api.rows({ search: 'applied' }).count();
            $('#testCount').text(count);
        }
    });

    // Event listener for Tests column search calculation
    // We need to update the display of the Tests column based on the search term
    var tableApi = table;

    // Column 2 is "Tests"
    tableApi.columns(2).every(function () {
        var that = this;
        var footerInput = $('input', this.footer());

        // We already have a generic listener, but we add a specific draw listener below
        // to handle the visual filtering
    });

    // On draw, filter the visible text of the Tests column and update price
    table.on('draw', function () {
        var searchTerm = table.column(2).search().toLowerCase();
        var pageTotal = 0;

        table.rows({ search: 'applied' }).nodes().to$().each(function () {
            var row = $(this);
            var testCell = row.find('td').eq(2);
            var priceCell = row.find('td').eq(3);
            var fullTests = testCell.attr('data-full-tests');
            var originalPrice = parseFloat(priceCell.attr('data-original-price')) || 0;

            var currentPrice = 0;

            if (searchTerm && fullTests) {
                // Filter the list
                var testsArr = fullTests.split(', ');
                var matching = testsArr.filter(t => t.toLowerCase().includes(searchTerm));

                // Join them back
                if (matching.length > 0) {
                    testCell.text(matching.join(', '));

                    // Calculate price from matching tests. Format: "Test Name - Price" or "Test Name-Price"
                    // We look for the last number in the string
                    currentPrice = matching.reduce((sum, t) => {
                        // Regex to find number at the end, optionally preceded by hyphen
                        // Handles "Test - 90", "Test-90", "Test 90" roughly
                        // But user data usually "Test Name - Price"
                        const parts = t.split('-');
                        if (parts.length > 1) {
                            const val = parseFloat(parts[parts.length - 1]);
                            return sum + (isNaN(val) ? 0 : val);
                        }
                        return sum;
                    }, 0);

                } else {
                    // Should not happen if the row matches via DataTables search, but safe fallback
                    testCell.text(fullTests);
                    currentPrice = originalPrice;
                }
            } else {
                // Restore full text if no search
                if (fullTests) testCell.text(fullTests);
                currentPrice = originalPrice;
            }

            priceCell.text(currentPrice);
            pageTotal += currentPrice;
        });

        // Update footer with the dynamically calculated total
        // We override the default footerCallback result here because footerCallback runs on 'data', 
        // but we are modifying the 'display' (DOM) to show partial prices.
        $(table.column(3).footer()).html('Total: ' + pageTotal);
    });

    // Stats visibility logic
    // We check if ANY filter is applied to toggle visibility
    table.on('search.dt', function () {
        var hasFilter = false;

        // Check global search
        if (table.search()) hasFilter = true;

        // Check column searches
        table.columns().every(function () {
            if (this.search()) hasFilter = true;
        });

        // Check date filter
        if ($('#minDate').val() || $('#maxDate').val()) hasFilter = true;

        if (hasFilter) {
            $('#statsContainer').css('visibility', 'visible');
        } else {
            $('#statsContainer').css('visibility', 'hidden');
        }
    });


    // Event listeners to the two range filtering inputs to redraw on input
    $('#minDate, #maxDate').on('change', function () {
        table.draw();
    });

    $('#clearDates').on('click', function () {
        $('#minDate').val('');
        $('#maxDate').val('');
        table.draw();
    });
});
