let accountsData = []; 
let currentFilter = 'all'; 
let activeApiKey = ""; 

// Sorting State
let currentSortKey = 'calculatedRisk'; 
let isAscending = false; 

document.addEventListener("DOMContentLoaded", () => {
    lucide.createIcons();
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('csvFile').addEventListener('change', handleFileUpload);
    document.getElementById('filterAll').addEventListener('click', () => setFilter('all'));
    document.getElementById('filterCritical').addEventListener('click', () => setFilter('critical'));
    document.getElementById('filterWarning').addEventListener('click', () => setFilter('warning'));
}

//  AI GATEWAY KEY VERIFICATION - Validates selected LLM provider
async function connectApiKey() {
    const keyInput = document.getElementById('apiKey').value.trim();
    const provider = document.getElementById('aiProvider').value;
    const statusText = document.getElementById('apiStatusText');
    const btn = document.getElementById('btnConnectApi');

    if (!keyInput) {
        statusText.innerText = "Please enter an API key before connecting.";
        statusText.className = "text-[10px] text-red-400 mt-2 font-semibold";
        activeApiKey = "";
        return;
    }

    btn.disabled = true;
    btn.className = "w-full bg-slate-700 text-slate-400 text-xs font-bold py-2 px-3 rounded-md flex items-center justify-center gap-1.5 cursor-not-allowed";
    btn.innerHTML = `<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Verifying key...`;
    lucide.createIcons();

    try {
        if (provider === 'gemini') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${keyInput}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    contents: [{ parts: [{ text: "ping" }] }], 
                    generationConfig: { maxOutputTokens: 5 } 
                })
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error?.message || "Gemini rejected this API key.");
            }
        } 
        else if (provider === 'openai') {
            const targetUrl = "https://api.openai.com/v1/chat/completions";
            const proxyUrl = "https://corsproxy.io/?" + encodeURIComponent(targetUrl);
            const res = await fetch(proxyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${keyInput}` },
                body: JSON.stringify({ 
                    model: "gpt-4o-mini", 
                    messages: [{ role: "user", content: "ping" }], 
                    max_tokens: 5 
                })
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error?.message || "OpenAI rejected this API key.");
            }
        }
        else if (provider === 'claude') {
            const targetUrl = "https://api.anthropic.com/v1/messages";
            const proxyUrl = "https://corsproxy.io/?" + encodeURIComponent(targetUrl);
            const res = await fetch(proxyUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'x-api-key': keyInput, 
                    'anthropic-version': '2023-06-01' 
                },
                body: JSON.stringify({ 
                    model: "claude-3-5-haiku-20241022", 
                    max_tokens: 5, 
                    messages: [{ role: "user", content: "ping" }] 
                })
            });
            if (!res.ok) throw new Error("Claude rejected the request or the key is invalid.");
        }

        activeApiKey = keyInput;
        statusText.innerText = `Authorized ${provider.toUpperCase()} gateway! Key is valid and active.`;
        statusText.className = "text-[10px] text-green-400 mt-2 font-semibold tracking-wide animate-pulse";
        
        btn.disabled = false;
        btn.className = "w-full bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-2 px-3 rounded-md flex items-center justify-center gap-1.5 transition shadow-sm";
        btn.innerHTML = `<i data-lucide="check-circle" class="w-3.5 h-3.5 text-white"></i> Key Connected`;

    } catch (error) {
        activeApiKey = ""; 
        statusText.innerText = `Authorization failed: ${error.message}`;
        statusText.className = "text-[10px] text-red-400 mt-2 font-semibold";
        
        btn.disabled = false;
        btn.className = "w-full bg-red-600 hover:bg-red-500 text-white text-xs font-bold py-2 px-3 rounded-md flex items-center justify-center gap-1.5 transition shadow-sm";
        btn.innerHTML = `<i data-lucide="x-circle" class="w-3.5 h-3.5 text-white"></i> Connection Failed`;
    }
    lucide.createIcons();
}

//  CSV FILE INGESTION - Parses uploaded data and filters out empty records
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: function(results) {
            const cleanRows = results.data.filter(row => row['Customer Name'] && String(row['Customer Name']).trim() !== "");
            processData(cleanRows);
        }
    });
}

//  EXCEL DATE PARSER - Converts Excel serial numbers into usable JS Date objects
function parseExcelDate(serial) {
    if (!serial || isNaN(serial)) return null;
    const utcDays = Math.floor(serial - 25569);
    const utcValue = utcDays * 86400 * 1000;
    return new Date(utcValue);
}

//  DATE FORMATTER - Formats standard JS date object into regular text string
function formatDateToString(dateObj) {
    if (!dateObj) return "N/A";
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    return `${day}.${month}.${year}.`;
}

//  CORE METRICS CALCULATOR & ENGINE - Computes data parameters and weights system risk thresholds
function processData(rawData) {
    const systemToday = new Date('2026-06-12');

    accountsData = rawData.map((row, index) => {
        const health = row['Health Score'] !== undefined && row['Health Score'] !== null ? Number(row['Health Score']) : 100;
        const adoption = row['Product Adoption %'] !== undefined && row['Product Adoption %'] !== null ? Number(row['Product Adoption %']) : 100;
        const tickets = row['Open Support Tickets'] !== undefined && row['Open Support Tickets'] !== null ? Number(row['Open Support Tickets']) : 0;
        const arr = row['ARR'] !== undefined && row['ARR'] !== null ? Number(row['ARR']) : 0;
        
        const lastTouchSerial = Number(row['Last CSM Touch Date']);
        const renewalSerial = Number(row['Renewal Date']);
        
        const lastTouchDateObj = parseExcelDate(lastTouchSerial);
        const renewalDateObj = parseExcelDate(renewalSerial);

        let daysSinceTouch = 30; 
        if (lastTouchDateObj) {
            const diffTime = Math.abs(systemToday - lastTouchDateObj);
            daysSinceTouch = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }

        let daysUntilRenewal = 365;
        if (renewalDateObj) {
            const diffTime = (renewalDateObj - systemToday);
            daysUntilRenewal = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }

        const healthComponent = (100 - health) * 0.40;
        const adoptionComponent = (100 - adoption) * 0.25;
        const ticketComponent = Math.min(tickets * 4, 100) * 0.20;
        const touchComponent = Math.min((daysSinceTouch / 30) * 100, 100) * 0.15;

        const calculatedRisk = Math.round(healthComponent + adoptionComponent + ticketComponent + touchComponent);
        
        let riskCategory = 'good';
        if (calculatedRisk >= 60 || health < 35 || tickets > 12) {
            riskCategory = 'critical';
        } else if (calculatedRisk >= 35 || health < 65) {
            riskCategory = 'warning';
        }

        return {
            id: index,
            name: String(row['Customer Name'] || '').trim(),
            csm: row['CSM Name'] ? String(row['CSM Name']).trim() : 'Unassigned',
            health: health,
            tickets: tickets,
            adoption: adoption,
            daysSinceTouch: daysSinceTouch,
            daysUntilRenewal: daysUntilRenewal,
            lastTouchString: formatDateToString(lastTouchDateObj),
            renewalString: formatDateToString(renewalDateObj),
            arr: arr,
            tier: row['Tier '] ? String(row['Tier ']).trim() : row['Tier'] ? String(row['Tier']).trim() : 'Tier 3',
            modules: row['Active Modules'] ? String(row['Active Modules']).trim() : 'None',
            insights: row['Staircase Insights'] || 'No internal diagnostic recorded.',
            notes: row['CSM Notes'] || 'No account executive log found.',
            calculatedRisk: calculatedRisk,
            riskCategory: riskCategory
        };
    });

    populateAdvancedFilterOptions();
    executeSort();
}

//  SIDEBAR DROPDOWN OPTION GENERATOR - Collects unique datasets (CSM Owner, modules, tiers) to inject into option fields
function populateAdvancedFilterOptions() {
    const tiers = new Set();
    const csms = new Set();
    const modulesOpt = new Set();

    accountsData.forEach(acc => {
        if (acc.tier) tiers.add(acc.tier);
        if (acc.csm) csms.add(acc.csm);
        if (acc.modules) {
            acc.modules.split(',').forEach(m => modulesOpt.add(m.trim()));
        }
    });

    buildSelectOptions('colFilterTier', tiers, 'All Tiers (No Filter)');
    buildSelectOptions('colFilterCsm', csms, 'All CSM Owners (No Filter)');
    buildSelectOptions('colFilterModules', modulesOpt, 'All Core Modules (No Filter)');
}

//  UI SELECT OPTION BUILDER - Generates standard HTML choice tags for dropdown components
function buildSelectOptions(elementId, setOptions, defaultText) {
    const select = document.getElementById(elementId);
    if (!select) return;
    select.innerHTML = `<option value="all">${defaultText}</option>`;
    
    Array.from(setOptions).sort().forEach(opt => {
        const el = document.createElement('option');
        el.value = opt;
        el.innerText = opt;
        select.appendChild(el);
    });
}

//  COLUMN CLICK SORT MANAGER - sets current ordering target parameter and direction state
function handleSort(key) {
    if (currentSortKey === key) {
        isAscending = !isAscending; 
    } else {
        currentSortKey = key;
        isAscending = ['name', 'tier', 'csm'].includes(key); 
    }
    executeSort();
}

//  SORT EXECUTION PIPELINE - Formats visual layout order according to set parameters
function executeSort() {
    accountsData.sort((a, b) => {
        let valueA = a[currentSortKey];
        let valueB = b[currentSortKey];

        if (typeof valueA === 'string') {
            return isAscending ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
        }
        return isAscending ? valueA - valueB : valueB - valueA;
    });

    updateUI();
    updateSortIndicators();
}

//  HEADER SORT DIRECTION GLYPHS - Updates column text label tracking arrow indicators
function updateSortIndicators() {
    const keys = ['name', 'tier', 'csm', 'health', 'tickets', 'daysSinceTouch', 'daysUntilRenewal', 'arr'];
    keys.forEach(key => {
        const el = document.getElementById(`sort-${key}`);
        if (!el) return;
        if (key === currentSortKey) {
            el.innerHTML = isAscending ? ' ↑' : ' ↓';
            el.className = "text-slate-900 font-bold ml-0.5";
        } else {
            el.innerHTML = ' ↕';
            el.className = "text-gray-300 ml-0.5 opacity-50";
        }
    });
}

//  FILTER APP TRIGGER - Refreshes core visibility engine layout blocks
function applyAdvancedFilters() {
    updateUI();
}

//  DASHBOARD METRICS RENDER HUB - Computes KPI aggregates and filters viewport card lists
function updateUI() {
    if (accountsData.length === 0) {
        document.getElementById('emptyState').classList.remove('hidden');
        document.getElementById('dataContainer').classList.add('hidden');
        return;
    }

    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('dataContainer').classList.remove('hidden');

    const selectedTier = document.getElementById('colFilterTier').value;
    const selectedCsm = document.getElementById('colFilterCsm').value;
    const selectedModules = document.getElementById('colFilterModules').value;

    const filteredData = accountsData.filter(acc => {
        const matchesSystemRisk = (currentFilter === 'all' || acc.riskCategory === currentFilter);
        const matchesTier = (selectedTier === 'all' || acc.tier === selectedTier);
        const matchesCsm = (selectedCsm === 'all' || acc.csm === selectedCsm);
        const matchesModules = (selectedModules === 'all' || acc.modules.includes(selectedModules));

        return matchesSystemRisk && matchesTier && matchesCsm && matchesModules;
    });

    const totalArr = accountsData.reduce((sum, acc) => sum + acc.arr, 0);
    const criticalCount = accountsData.filter(acc => acc.riskCategory === 'critical').length;
    const warningCount = accountsData.filter(acc => acc.riskCategory === 'warning').length;
    const avgHealth = Math.round(accountsData.reduce((sum, acc) => sum + acc.health, 0) / accountsData.length);
    const totalTickets = accountsData.reduce((sum, acc) => sum + acc.tickets, 0);

    document.getElementById('kpiArr').innerText = `$${totalArr.toLocaleString()}`;
    document.getElementById('kpiCritical').innerText = criticalCount;
    document.getElementById('kpiHealth').innerText = `${avgHealth} / 100`;
    document.getElementById('kpiTickets').innerText = totalTickets;

    document.getElementById('countAll').innerText = accountsData.length;
    document.getElementById('countCritical').innerText = criticalCount;
    document.getElementById('countWarning').innerText = warningCount;
    document.getElementById('lastUpdated').innerText = `Viewing: ${filteredData.length} of ${accountsData.length} records`;

    renderAccountsList(filteredData);
}

//  NAVIGATION TAB STATE MANAGER - Toggles CSS visibility rules for tracking active filter tabs
function setFilter(filterType) {
    currentFilter = filterType;
    const buttons = {
        all: document.getElementById('filterAll'),
        critical: document.getElementById('filterCritical'),
        warning: document.getElementById('filterWarning')
    };

    Object.keys(buttons).forEach(key => {
        if (key === filterType) {
            buttons[key].className = "w-full text-left px-3 py-2.5 rounded-lg bg-amber-500 text-slate-950 font-semibold flex justify-between items-center transition shadow";
        } else {
            buttons[key].className = "w-full text-left px-3 py-2.5 rounded-lg hover:bg-slate-800 text-slate-300 flex justify-between items-center transition";
        }
    });

    updateUI();
}

//  DYNAMIC CARD GENERATOR - Builds and injects HTML block components for custom layout records
function renderAccountsList(data) {
    const listContainer = document.getElementById('accountsList');
    listContainer.innerHTML = '';

    if (data.length === 0) {
        listContainer.innerHTML = `
            <div class="text-center py-12 bg-white rounded-xl border border-gray-200 text-gray-400 text-xs font-medium shadow-sm">
                No records match the selected filters.
            </div>`;
        return;
    }

    data.forEach(acc => {
        let renewalBadgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
        if (acc.daysUntilRenewal <= 60 && acc.daysUntilRenewal > 0) {
            renewalBadgeClass = 'bg-rose-100 text-rose-700 font-bold border-rose-200 animate-pulse';
        } else if (acc.daysUntilRenewal <= 0) {
            renewalBadgeClass = 'bg-red-200 text-red-800 font-black border-red-300';
        }

        const card = document.createElement('div');
        card.className = `bg-white p-4 rounded-xl border-l-4 ${acc.riskCategory === 'critical' ? 'border-l-red-600' : acc.riskCategory === 'warning' ? 'border-l-amber-500' : 'border-l-green-500'} border-y border-r border-gray-200 hover:border-slate-400 transition shadow-sm flex flex-col gap-3`;
        card.innerHTML = `
            <div class="flex justify-between items-center text-xs">
                <div class="w-3/12 font-extrabold text-slate-900 text-sm tracking-tight truncate pr-2">${acc.name}</div>
                <div class="w-1/12 text-center">
                    <span class="bg-slate-50 text-slate-700 px-2 py-0.5 rounded font-bold text-[10px] border border-gray-200 uppercase">${acc.tier}</span>
                </div>
                <div class="w-2/12 text-slate-700 font-semibold truncate pr-2">
                    <span class="text-gray-400 text-[9px] block font-normal uppercase tracking-wider">CSM Owner</span>
                    ${acc.csm}
                </div>
                <div class="w-1/12 text-center font-bold text-slate-900 text-sm">${acc.health}%</div>
                <div class="w-1/12 text-center">
                    <span class="px-2 py-0.5 rounded font-mono font-bold ${acc.tickets >= 10 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}">${acc.tickets}</span>
                </div>
                <div class="w-1.5/12 text-center text-slate-700 font-medium">
                    <span class="text-gray-400 text-[9px] block font-normal">${acc.lastTouchString}</span>
                    ${acc.daysSinceTouch}d ago
                </div>
                <div class="w-1.5/12 text-center">
                    <span class="text-gray-400 text-[9px] block font-normal mb-0.5">${acc.renewalString}</span>
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-mono border ${renewalBadgeClass}">
                        ${acc.daysUntilRenewal <= 0 ? 'Expired' : acc.daysUntilRenewal + 'd left'}
                    </span>
                </div>
                <div class="w-1/12 text-right font-extrabold text-slate-900 text-sm">$${acc.arr.toLocaleString()}</div>
            </div>
            
            <div class="bg-slate-50 border border-gray-100 rounded-xl p-3.5 text-[11px] text-slate-700 grid grid-cols-3 gap-4">
                <div class="col-span-1 border-r border-gray-200 pr-3">
                    <span class="font-bold text-indigo-700 block mb-0.5 uppercase tracking-wider text-[9px]">Staircase Insight:</span>
                    <p class="leading-relaxed italic text-slate-600">"${acc.insights}"</p>
                    <span class="inline-block mt-2 font-mono text-[9px] text-slate-400 bg-gray-200 px-1 py-0.5 rounded">Modules: ${acc.modules}</span>
                </div>
                <div class="col-span-1 border-r border-gray-200 pr-3">
                    <span class="font-bold text-teal-700 block mb-0.5 uppercase tracking-wider text-[9px]">Active CSM Log / Actions:</span>
                    <p class="leading-relaxed text-slate-600">${acc.notes}</p>
                </div>
                <div class="col-span-1 flex flex-col justify-between items-end gap-2 h-full">
                    <div class="flex gap-1.5 justify-end w-full">
                        <button onclick="generateLiveAiSummary(${acc.id})" class="bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition shadow-sm">
                            <i data-lucide="sparkles" class="w-3 h-3 text-amber-400"></i> Live AI Response
                        </button>
                        <button onclick="generateLocalSummary(${acc.id})" class="bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition shadow-sm">
                            <i data-lucide="cpu" class="w-3 h-3 text-blue-500"></i> Local Response
                        </button>
                    </div>
                    <div id="ai-space-${acc.id}" class="w-full text-right mt-1 min-h-[45px] flex items-center justify-end">
                        <span class="text-gray-400 italic text-[10px]">Click above to generate action plan...</span>
                    </div>
                </div>
            </div>
        `;
        listContainer.appendChild(card);
    });
    lucide.createIcons();
}

//  LIVE WIRE MODEL TRANSMITTER (API FETCH) - Ships payload metrics across dynamic selected cloud targets
async function generateLiveAiSummary(id) {
    const provider = document.getElementById('aiProvider').value;
    const account = accountsData.find(a => a.id === id);
    const container = document.getElementById(`ai-space-${id}`);
    
    if (!activeApiKey) {
        container.innerHTML = `<span class="text-xs text-red-500 font-bold tracking-wide">Error: Connect a valid API key at the top!</span>`;
        return;
    }
    
    container.innerHTML = `<span class="text-xs text-slate-400 italic animate-pulse flex items-center gap-1"><i data-lucide="loader" class="w-3 h-3 animate-spin"></i> Sending metrics to ${provider.toUpperCase()}...</span>`;
    lucide.createIcons();

    const systemPrompt = `You are an expert Customer Success AI Copilot. Your sole task is to construct a deeply descriptive, highly tactical customer evaluation action plan. You must strictly avoid short summary phrases or lazy descriptions.

MANDATORY RULES:
1. Length: You MUST write exactly 3 long, thorough, separate sentences (minimum 60 words total).
2. Structure Requirement:
   - Sentence 1: Explicitly state the customer health score percentage and the exact number of open support queries. Connect these data points explicitly to the specific operational frictions logged in the Staircase Insights.
   - Sentence 2: Analyze the contract risk based on the remaining renewal path or lack of recent engagement parameters found in the CSM notes.
   - Sentence 3: Formulate a definitive strategic milestone recommendation for the account team to execute immediately to stabilize the arrangement.
3. Content restriction: Do not output markdown, bullet points, asterisks, or bold tags. Provide raw plain text paragraphs only.`;

    const userPrompt = `Generate a comprehensive, full-length 3-sentence response following the system parameters exactly. Do not truncate or shorten this response.
Customer Name: ${account.name}
Tier Category: ${account.tier}
Contract ARR: $${account.arr}
Health Score: ${account.health}%
Open Support Tickets: ${account.tickets}
Last CSM Contact: ${account.daysSinceTouch} days ago (${account.lastTouchString})
Subscription Path: ${account.daysUntilRenewal} days remaining (${account.renewalString})
Active Modules: ${account.modules}
Staircase Insights: ${account.insights}
CSM Notes: ${account.notes}`;

    try {
        let response, data, aiText;

        if (provider === 'gemini') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${activeApiKey}`;
            
            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: userPrompt }] }],
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    generationConfig: { maxOutputTokens: 500, temperature: 1.0 }
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || "Gemini server rejected the request.");
            }
            data = await response.json();
            aiText = data.candidates[0].content.parts[0].text;

        } else if (provider === 'openai') {
            const targetUrl = "https://api.openai.com/v1/chat/completions";
            const proxyUrl = "https://corsproxy.io/?" + encodeURIComponent(targetUrl);
            
            response = await fetch(proxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${activeApiKey}`
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt }
                    ],
                    max_tokens: 500,
                    temperature: 1.0
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || "OpenAI server rejected the request.");
            }
            data = await response.json();
            aiText = data.choices[0].message.content;

        } else if (provider === 'claude') {
            const targetUrl = "https://api.anthropic.com/v1/messages";
            const proxyUrl = "https://corsproxy.io/?" + encodeURIComponent(targetUrl);
            
            response = await fetch(proxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': activeApiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: "claude-3-5-haiku-20241022",
                    max_tokens: 500,
                    system: systemPrompt,
                    messages: [{ role: "user", content: userPrompt }],
                    temperature: 1.0
                })
            });
            
            if (!response.ok) throw new Error("Claude API rejected the request.");
            data = await response.json();
            aiText = data.content[0].text;
        }

        renderAiOutput(container, aiText.trim(), true, provider);

    } catch (error) {
        console.error("API Error Log:", error);
        container.innerHTML = `
            <div class="text-left bg-red-50 border border-red-200 text-red-700 p-2 rounded-lg w-full text-[10px]">
                <span class="font-bold uppercase block text-[8px] mb-0.5">Live API Error Response:</span>
                <p class="font-mono text-[9px] bg-red-100 p-1 rounded overflow-x-auto">${error.message}</p>
            </div>`;
    }
}

//  LOCAL OFFLINE SIMULATOR - Builds procedural script placeholders if network channels fail
async function generateLocalSummary(id) {
    const account = accountsData.find(a => a.id === id);
    const container = document.getElementById(`ai-space-${id}`);
    const provider = document.getElementById('aiProvider').value;

    container.innerHTML = `<span class="text-xs text-slate-400 italic animate-pulse flex items-center gap-1"><i data-lucide="loader" class="w-3 h-3 animate-spin"></i> Initializing local model (Offline)...</span>`;
    lucide.createIcons();

    await new Promise(resolve => setTimeout(resolve, 450));

    let localActionText = `The account presents an operational state with standard parameter alignment across the active modules. It is recommended to establish a regular checkpoint schedule to keep monitoring core logs and prevent future churn risks.`;
    
    if (account.health < 35 || account.tickets > 12) {
        localActionText = `Account operational health has severely degraded down to ${account.health}% alongside ${account.tickets} open support queries, showing direct alignment with the complications flagged in the Staircase Insights. Deploy technical solution architects to debug the current deployment bottlenecks immediately and align directly with their account team.`;
    } else if (account.daysUntilRenewal <= 60) {
        localActionText = `Contract lifecycle parameters indicate an urgent commercial renewal pressure with only ${account.daysUntilRenewal} days remaining on the subscription path. Based on the notes logged by the CSM team, initiate an executive alignment check to eliminate commercial friction and secure a renewal roadmap.`;
    } else if (account.daysSinceTouch > 25) {
        localActionText = `Engagement mapping indicates an operational gap because this ${account.tier} profile has not recorded an active touchpoint in over ${account.daysSinceTouch} days. Coordinate a structured proactive review sequence immediately to sync up on their internal diagnostic metrics.`;
    }

    renderAiOutput(container, localActionText, false, provider);
}

//  UI FEEDBACK VIEW COMPILER - Injects themed HTML summary cards based on the generator origin
function renderAiOutput(container, text, isLiveApi, provider) {
    if (isLiveApi) {
        let providerName = provider === 'gemini' ? 'Gemini 2.5 Flash' : provider === 'openai' ? 'GPT-4o mini' : 'Claude 3.5 Haiku';
        container.innerHTML = `
            <div class="text-left bg-emerald-50 border border-emerald-200 text-slate-900 p-2.5 rounded-lg w-full shadow-sm animate-fadeIn">
                <span class="font-extrabold text-emerald-800 text-[9px] uppercase tracking-wider flex items-center gap-1 mb-0.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span> Live ${providerName} Response:
                </span>
                <p class="text-[11px] leading-relaxed font-semibold text-slate-800">${text}</p>
            </div>`;
    } else {
        container.innerHTML = `
            <div class="text-left bg-blue-50 border border-blue-200 text-slate-900 p-2.5 rounded-lg w-full shadow-sm animate-fadeIn">
                <span class="font-extrabold text-blue-800 text-[9px] uppercase tracking-wider flex items-center gap-1 mb-0.5">
                    <i data-lucide="cpu" class="w-3 h-3 text-blue-500"></i> Local Simulated Action Item:
                </span>
                <p class="text-[11px] leading-relaxed font-medium text-slate-700 italic">${text}</p>
            </div>`;
    }
    lucide.createIcons();
}