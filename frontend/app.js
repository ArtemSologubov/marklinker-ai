// API Base URL (assumes same host)
const API_URL = '';

// App State
let state = {
    subjects: [],
    currentSubject: '',
    papers: [],
    currentPaper: null,
    mapping: null,
    currentQuestionKey: null,
    uploadType: 'paper', // 'paper' or 'mark_scheme'
    zoom: {
        paper: 1.0,
        ms: 1.0
    },
    showMarkScheme: false, // default to hidden
    showNotes: false, // default to hidden
    drawingMode: {
        tool: 'select',
        color: '#ff0000',
        size: 3
    }
};

// DOM Elements
const subjectSelect = document.getElementById('subject-select');
const paperSelect = document.getElementById('paper-select');
const addSubjectBtn = document.getElementById('add-subject-btn');
const themeToggle = document.getElementById('theme-toggle');

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const tabBtns = document.querySelectorAll('.tab-btn');

const editMappingBtn = document.getElementById('edit-mapping-btn');
const questionsList = document.getElementById('questions-list');
const questionsEmptyState = document.getElementById('questions-empty-state');

const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

const preprocessScreen = document.getElementById('preprocess-screen');
const msMatchSelect = document.getElementById('ms-match-select');
const startAlignBtn = document.getElementById('start-align-btn');
const unmapPaperBtn = document.getElementById('unmap-paper-btn');
const toggleMsBtn = document.getElementById('toggle-ms-btn');
const toggleNotesBtn = document.getElementById('toggle-notes-btn');
const drawingToolbar = document.getElementById('drawing-toolbar');

const splitScreen = document.getElementById('split-screen');
const currentQNum = document.getElementById('current-q-num');
const paperImageStack = document.getElementById('paper-image-stack');
const msImageStack = document.getElementById('ms-image-stack');

// Modals
const addSubjectModal = document.getElementById('add-subject-modal');
const newSubjectName = document.getElementById('new-subject-name');
const submitSubjectBtn = document.getElementById('submit-subject-btn');

const editMappingModal = document.getElementById('edit-mapping-modal');
const mappingModalQNum = document.getElementById('mapping-modal-q-num');
const mappingPaperPages = document.getElementById('mapping-paper-pages');
const mappingMsPages = document.getElementById('mapping-ms-pages');
const mappingPaperTotal = document.getElementById('mapping-paper-total');
const mappingMsTotal = document.getElementById('mapping-ms-total');
const submitMappingBtn = document.getElementById('submit-mapping-btn');

// Close modal buttons
const modalCloseBtns = document.querySelectorAll('.modal-close-btn');

// ==========================================
// Initialization & Event Listeners
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
});

function initApp() {
    fetchSubjects();
    setupZoomAndPan('paper-panel');
    setupZoomAndPan('ms-panel');
    initPMTDownloader();
    initDrawingToolbar();
}

function setupEventListeners() {
    // Subject / Paper Selection
    subjectSelect.addEventListener('change', (e) => {
        state.currentSubject = e.target.value;
        paperSelect.disabled = false;
        fetchPapers(state.currentSubject);
        fetchMarkSchemes(state.currentSubject);
        resetViewer();
    });

    paperSelect.addEventListener('change', (e) => {
        const paperName = e.target.value;
        const paper = state.papers.find(p => p.name === paperName);
        if (paper) {
            selectPaper(paper);
        }
    });

    // Theme Toggle
    themeToggle.addEventListener('change', () => {}); // Handled below
    themeToggle.addEventListener('click', toggleTheme);

    // Subject Modal
    addSubjectBtn.addEventListener('click', () => openModal(addSubjectModal));
    submitSubjectBtn.addEventListener('click', createSubject);

    // Modal close events
    modalCloseBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            closeModal(addSubjectModal);
            closeModal(editMappingModal);
        });
    });

    // Upload Tabs
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.uploadType = btn.dataset.type;
        });
    });

    // Drag and Drop Upload
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });

    // Process Align Action
    startAlignBtn.addEventListener('click', startAlignPaper);

    // Edit Mapping Modal Action
    editMappingBtn.addEventListener('click', openEditMappingModal);
    submitMappingBtn.addEventListener('click', saveManualMapping);

    // Reset Mapping / Unprocess Action
    unmapPaperBtn.addEventListener('click', resetPaperMapping);

    // Toggle Mark Scheme Action
    toggleMsBtn.addEventListener('click', toggleMarkSchemeVisibility);
    toggleNotesBtn.addEventListener('click', toggleNotesVisibility);
    
    // Preprocess Syllabus selection
    document.getElementById('preprocess-level').addEventListener('change', populatePreprocessBoards);
}

// ==========================================
// Theme Logic
// ==========================================
function toggleTheme() {
    const body = document.body;
    const themeIcon = themeToggle.querySelector('i');
    
    if (body.classList.contains('dark-theme')) {
        body.classList.remove('dark-theme');
        body.classList.add('light-theme');
        themeIcon.className = 'fa-solid fa-sun';
    } else {
        body.classList.remove('light-theme');
        body.classList.add('dark-theme');
        themeIcon.className = 'fa-solid fa-moon';
    }
}

// ==========================================
// API Fetch Calls
// ==========================================
async function fetchSubjects() {
    try {
        const res = await fetch(`${API_URL}/api/subjects`);
        const data = await res.json();
        state.subjects = data;
        
        subjectSelect.innerHTML = '<option value="" disabled selected>Select Subject</option>';
        data.forEach(subject => {
            const opt = document.createElement('option');
            opt.value = subject;
            opt.textContent = subject;
            subjectSelect.appendChild(opt);
        });
    } catch (err) {
        console.error('Error fetching subjects:', err);
    }
}

async function fetchPapers(subject) {
    try {
        const res = await fetch(`${API_URL}/api/papers?subject=${encodeURIComponent(subject)}`);
        const data = await res.json();
        state.papers = data;

        paperSelect.innerHTML = '<option value="" disabled selected>Select Paper</option>';
        data.forEach(paper => {
            const opt = document.createElement('option');
            opt.value = paper.name;
            opt.textContent = `${paper.name} ${paper.processed ? '(Processed)' : '(Unmapped)'}`;
            paperSelect.appendChild(opt);
        });
    } catch (err) {
        console.error('Error fetching papers:', err);
    }
}

async function fetchMarkSchemes(subject) {
    try {
        const res = await fetch(`${API_URL}/api/mark_schemes?subject=${encodeURIComponent(subject)}`);
        const data = await res.json();
        
        // Populating the select element in preprocess panel
        msMatchSelect.innerHTML = '';
        data.forEach(ms => {
            const opt = document.createElement('option');
            opt.value = ms;
            opt.textContent = ms;
            msMatchSelect.appendChild(opt);
        });
        
        if (data.length === 0) {
            msMatchSelect.innerHTML = '<option value="" disabled selected>No mark schemes uploaded yet</option>';
        }
    } catch (err) {
        console.error('Error fetching mark schemes:', err);
    }
}

async function selectPaper(paper) {
    state.currentPaper = paper;
    resetViewer();
    
    if (paper.processed) {
        unmapPaperBtn.disabled = false;
        loadMapping(paper.name);
    } else {
        // Show preprocess wizard screen
        splitScreen.style.display = 'none';
        questionsList.style.display = 'none';
        questionsEmptyState.style.display = 'flex';
        preprocessScreen.style.display = 'flex';
        editMappingBtn.disabled = true;
        unmapPaperBtn.disabled = true;
        
        // Select matched MS in dropdown if available
        if (paper.matched_mark_scheme) {
            msMatchSelect.value = paper.matched_mark_scheme;
        }
        
        // Populate boards for preprocess screen
        populatePreprocessBoards();
    }
}

async function loadMapping(paperName) {
    showLoader('Loading questions mapping...');
    try {
        const res = await fetch(`${API_URL}/api/mapping?subject=${encodeURIComponent(state.currentSubject)}&paper_name=${encodeURIComponent(paperName)}`);
        const data = await res.json();
        
        state.mapping = data;
        renderQuestionsList(data.questions);
        
        preprocessScreen.style.display = 'none';
        questionsEmptyState.style.display = 'none';
        questionsList.style.display = 'flex';
        splitScreen.style.display = 'grid';
        if (drawingToolbar) drawingToolbar.style.display = 'flex';
        editMappingBtn.disabled = false;
        unmapPaperBtn.disabled = false;
        
        // Mark scheme/notes are hidden by default when loading a paper
        state.showMarkScheme = false;
        state.showNotes = false;
        updateSplitPanelDisplay();
        
        // Select first question automatically
        const keys = Object.keys(data.questions);
        if (keys.length > 0) {
            // Sort keys numerically
            keys.sort((a, b) => parseInt(a) - parseInt(b));
            selectQuestion(keys[0]);
        }
    } catch (err) {
        console.error('Error loading mapping:', err);
        alert('Failed to load paper details.');
    } finally {
        hideLoader();
    }
}

async function createSubject() {
    const name = newSubjectName.value.trim();
    if (!name) return;
    
    try {
        const res = await fetch(`${API_URL}/api/create_subject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject: name })
        });
        const data = await res.json();
        if (data.success) {
            closeModal(addSubjectModal);
            newSubjectName.value = '';
            await fetchSubjects();
            subjectSelect.value = name;
            subjectSelect.dispatchEvent(new Event('change'));
        } else {
            alert(data.error || 'Failed to create subject');
        }
    } catch (err) {
        console.error(err);
    }
}

async function handleFileUpload(file) {
    if (!state.currentSubject) {
        alert('Please select or create a Subject first before uploading files.');
        return;
    }
    
    const formData = new FormData();
    formData.append('subject', state.currentSubject);
    formData.append('type', state.uploadType);
    formData.append('file', file);
    
    showLoader(`Uploading ${file.name}...`);
    try {
        const res = await fetch(`${API_URL}/api/upload`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            // Refresh selections
            if (state.uploadType === 'paper') {
                await fetchPapers(state.currentSubject);
                // Select the uploaded paper
                const newPaper = state.papers.find(p => p.filename === data.filename);
                if (newPaper) {
                    paperSelect.value = newPaper.name;
                    selectPaper(newPaper);
                }
            } else {
                await fetchMarkSchemes(state.currentSubject);
                // If current paper is unmapped, refresh the alignment options
                if (state.currentPaper && !state.currentPaper.processed) {
                    selectPaper(state.currentPaper);
                }
            }
        } else {
            alert(data.error || 'Upload failed');
        }
    } catch (err) {
        console.error(err);
        alert('Error uploading file');
    } finally {
        hideLoader();
    }
}

async function startAlignPaper() {
    if (!state.currentSubject || !state.currentPaper) return;
    
    const msFile = msMatchSelect.value;
    if (!msFile) {
        alert('Please select a Mark Scheme PDF to align.');
        return;
    }
    
    const level = document.getElementById('preprocess-level').value;
    const board = document.getElementById('preprocess-board').value;
    if (!board) {
        alert('Please select an Exam Board.');
        return;
    }
    
    showLoader('Running Local AI Alignment. Rendering pages, matching questions, and fetching notes (this may take 5-10s)...');
    try {
        const res = await fetch(`${API_URL}/api/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subject: state.currentSubject,
                paper_file: state.currentPaper.filename,
                ms_file: msFile,
                board: board,
                level: level
            })
        });
        const data = await res.json();
        if (data.success) {
            // Reload list and map
            await fetchPapers(state.currentSubject);
            paperSelect.value = state.currentPaper.name;
            state.currentPaper = state.papers.find(p => p.name === state.currentPaper.name);
            loadMapping(state.currentPaper.name);
        } else {
            alert(data.error || 'Alignment processing failed.');
        }
    } catch (err) {
        console.error(err);
        alert('An error occurred during local processing.');
    } finally {
        hideLoader();
    }
}

// ==========================================
// Question Layout & Selection
// ==========================================
function renderQuestionsList(questions) {
    questionsList.innerHTML = '';
    
    const keys = Object.keys(questions);
    // Sort question keys numerically
    keys.sort((a, b) => parseInt(a) - parseInt(b));
    
    keys.forEach(qKey => {
        const qData = questions[qKey];
        const li = document.createElement('li');
        li.className = 'q-item';
        li.dataset.key = qKey;
        
        const paperPageStr = qData.paper_pages.length > 0 ? `Pages ${qData.paper_pages.join(', ')}` : 'No Pages';
        const msPageStr = qData.ms_pages.length > 0 ? `MS Pg ${qData.ms_pages.join(', ')}` : 'Unmapped';
        
        li.innerHTML = `
            <div class="q-name">Question ${qKey}</div>
            <div class="q-meta">${paperPageStr} | ${msPageStr}</div>
        `;
        
        li.addEventListener('click', () => selectQuestion(qKey));
        questionsList.appendChild(li);
    });

    // Add extra button to append a manual question
    const addQItem = document.createElement('li');
    addQItem.className = 'q-item add-q-item';
    addQItem.style.borderStyle = 'dashed';
    addQItem.style.justifyContent = 'center';
    addQItem.style.background = 'none';
    addQItem.innerHTML = `
        <div class="q-name" style="color: var(--accent-primary)"><i class="fa-solid fa-plus-circle"></i> Add Question</div>
    `;
    addQItem.addEventListener('click', addNewQuestionPrompt);
    questionsList.appendChild(addQItem);
}

function selectQuestion(qKey) {
    state.currentQuestionKey = qKey;
    currentQNum.textContent = qKey;
    
    // Highlight list item
    document.querySelectorAll('.q-item').forEach(el => el.classList.remove('active'));
    const activeEl = document.querySelector(`.q-item[data-key="${qKey}"]`);
    if (activeEl) activeEl.classList.add('active');
    
    const qData = state.mapping.questions[qKey];
    if (!qData) return;
    
    // Render Question Paper Pages
    paperImageStack.innerHTML = '';
    if (qData.paper_pages.length > 0) {
        qData.paper_pages.forEach(pNum => {
            const wrapper = createPageWithCanvas('paper', pNum);
            paperImageStack.appendChild(wrapper);
        });
    } else {
        paperImageStack.innerHTML = '<div class="empty-state"><i class="fa-solid fa-file-excel"></i><p>No paper pages mapped to this question</p></div>';
    }
    
    // Render Mark Scheme Pages
    msImageStack.innerHTML = '';
    if (qData.ms_pages.length > 0) {
        qData.ms_pages.forEach(pNum => {
            const wrapper = createPageWithCanvas('ms', pNum);
            msImageStack.appendChild(wrapper);
        });
    } else {
        msImageStack.innerHTML = '<div class="empty-state"><i class="fa-solid fa-file-excel"></i><p>No mark scheme pages mapped to this question</p></div>';
    }
    
    // Reset panning layout
    resetPan('paper-panel');
    resetPan('ms-panel');
    
    // If notes are active, load notes for current question
    if (state.showNotes) {
        loadNotesForCurrentQuestion();
    }
}

function addNewQuestionPrompt() {
    const qNum = prompt('Enter the new question number (integer):');
    if (!qNum) return;
    
    const parsed = parseInt(qNum);
    if (isNaN(parsed) || parsed <= 0) {
        alert('Please enter a valid positive number.');
        return;
    }
    
    const key = parsed.toString();
    if (state.mapping.questions[key]) {
        alert(`Question ${key} already exists.`);
        return;
    }
    
    // Create placeholder question mapping
    state.mapping.questions[key] = {
        paper_pages: [],
        ms_pages: []
    };
    
    renderQuestionsList(state.mapping.questions);
    selectQuestion(key);
    openEditMappingModal();
}

// ==========================================
// Manual Mapping Controls
// ==========================================
async function openEditMappingModal() {
    if (!state.mapping || !state.currentQuestionKey) return;
    
    const qKey = state.currentQuestionKey;
    const qData = state.mapping.questions[qKey];
    
    mappingModalQNum.textContent = qKey;
    mappingPaperTotal.textContent = state.mapping.paper_total_pages;
    mappingMsTotal.textContent = state.mapping.ms_total_pages;
    
    mappingPaperPages.value = qData.paper_pages.join(', ');
    mappingMsPages.value = qData.ms_pages.join(', ');
    
    // Clear and load notes index selection dropdown
    const select = document.getElementById('mapping-note-url');
    const customInput = document.getElementById('mapping-note-custom-url');
    select.innerHTML = '<option value="">None / Custom</option>';
    customInput.value = '';
    
    const board = state.mapping.board;
    const level = state.mapping.level || 'a-level';
    
    if (board) {
        select.innerHTML = '<option value="">Loading syllabus topics...</option>';
        try {
            const res = await fetch(`${API_URL}/api/notes_index?subject=${encodeURIComponent(state.currentSubject)}&board=${encodeURIComponent(board)}&level=${encodeURIComponent(level)}`);
            const data = await res.json();
            
            select.innerHTML = '<option value="">None / Custom</option>';
            if (data && data.length > 0) {
                data.forEach(note => {
                    const opt = document.createElement('option');
                    opt.value = note.url;
                    opt.textContent = note.title;
                    select.appendChild(opt);
                });
            }
        } catch (err) {
            console.error('Error fetching notes index:', err);
            select.innerHTML = '<option value="">Failed to load syllabus topics</option>';
        }
    } else {
        select.innerHTML = '<option value="">Syllabus not configured for this paper</option>';
    }
    
    // Select current note if mapped
    if (qData.note_url) {
        let found = false;
        for (let opt of select.options) {
            if (opt.value === qData.note_url) {
                select.value = qData.note_url;
                found = true;
                break;
            }
        }
        if (!found) {
            customInput.value = qData.note_url;
            select.value = '';
        }
    }
    
    openModal(editMappingModal);
}

function parsePagesInput(inputStr, maxPages) {
    if (!inputStr.trim()) return [];
    
    // Parse comma separated values and ranges
    const parts = inputStr.split(',');
    const pages = new Set();
    
    for (let p of parts) {
        p = p.trim();
        if (/^\d+$/.test(p)) {
            const val = parseInt(p);
            if (val >= 1 && val <= maxPages) pages.add(val);
        } else if (/^\d+\s*-\s*\d+$/.test(p)) {
            const rangeParts = p.split('-');
            const start = parseInt(rangeParts[0].trim());
            const end = parseInt(rangeParts[1].trim());
            if (start <= end && start >= 1 && end <= maxPages) {
                for (let i = start; i <= end; i++) {
                    pages.add(i);
                }
            }
        }
    }
    
    return Array.from(pages).sort((a, b) => a - b);
}

async function saveManualMapping() {
    const qKey = state.currentQuestionKey;
    const paperVal = mappingPaperPages.value;
    const msVal = mappingMsPages.value;
    
    const paperPages = parsePagesInput(paperVal, state.mapping.paper_total_pages);
    const msPages = parsePagesInput(msVal, state.mapping.ms_total_pages);
    
    const select = document.getElementById('mapping-note-url');
    const customInput = document.getElementById('mapping-note-custom-url');
    
    let noteUrl = select.value;
    let noteTitle = null;
    
    if (customInput.value.trim()) {
        noteUrl = customInput.value.trim();
        noteTitle = 'Custom Linked Note';
    } else if (noteUrl) {
        noteTitle = select.options[select.selectedIndex].textContent;
    }
    
    // Update local state copy
    if (paperPages.length === 0 && msPages.length === 0) {
        // Delete question if both are empty
        delete state.mapping.questions[qKey];
    } else {
        state.mapping.questions[qKey] = {
            paper_pages: paperPages,
            ms_pages: msPages,
            note_title: noteTitle,
            note_url: noteUrl || null
        };
    }
    
    showLoader('Saving mapping updates...');
    try {
        const res = await fetch(`${API_URL}/api/update_mapping`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subject: state.currentSubject,
                paper_name: state.currentPaper.name,
                questions: state.mapping.questions
            })
        });
        const data = await res.json();
        if (data.success) {
            closeModal(editMappingModal);
            renderQuestionsList(state.mapping.questions);
            
            // Re-select question or fallback to first
            const keys = Object.keys(state.mapping.questions);
            if (keys.includes(qKey)) {
                selectQuestion(qKey);
            } else if (keys.length > 0) {
                keys.sort((a, b) => parseInt(a) - parseInt(b));
                selectQuestion(keys[0]);
            } else {
                resetViewer();
            }
        } else {
            alert(data.error || 'Failed to save mapping');
        }
    } catch (err) {
        console.error(err);
        alert('Error saving changes');
    } finally {
        hideLoader();
    }
}

// ==========================================
// Zoom & Pan Engine (Grab Scroll)
// ==========================================
function setupZoomAndPan(panelId) {
    const panel = document.getElementById(panelId);
    const viewport = panel.querySelector('.viewport');
    const imageStack = panel.querySelector('.image-stack');
    const zoomLevelEl = panel.querySelector('.zoom-level');
    
    const type = panelId === 'paper-panel' ? 'paper' : 'ms';
    
    // Zoom Controls
    panel.querySelector('.zoom-in-btn').addEventListener('click', () => adjustZoom(0.1));
    panel.querySelector('.zoom-out-btn').addEventListener('click', () => adjustZoom(-0.1));
    panel.querySelector('.reset-zoom-btn').addEventListener('click', () => resetZoom());
    
    function adjustZoom(delta) {
        state.zoom[type] = Math.min(3.0, Math.max(0.5, state.zoom[type] + delta));
        updateZoomTransform();
    }
    
    function resetZoom() {
        state.zoom[type] = 1.0;
        updateZoomTransform();
        resetPan(panelId);
    }
    
    function updateZoomTransform() {
        imageStack.style.transform = `scale(${state.zoom[type]})`;
        zoomLevelEl.textContent = `${Math.round(state.zoom[type] * 100)}%`;
    }
    
    // Grab scroll logic
    let isDown = false;
    let startX, startY;
    let scrollLeft, scrollTop;
    
    viewport.addEventListener('mousedown', (e) => {
        isDown = true;
        viewport.classList.add('grabbing');
        startX = e.pageX - viewport.offsetLeft;
        startY = e.pageY - viewport.offsetTop;
        scrollLeft = viewport.scrollLeft;
        scrollTop = viewport.scrollTop;
    });
    
    viewport.addEventListener('mouseleave', () => {
        isDown = false;
        viewport.classList.remove('grabbing');
    });
    
    viewport.addEventListener('mouseup', () => {
        isDown = false;
        viewport.classList.remove('grabbing');
    });
    
    viewport.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - viewport.offsetLeft;
        const y = e.pageY - viewport.offsetTop;
        const walkX = (x - startX) * 1.5; // multiplier makes drag faster
        const walkY = (y - startY) * 1.5;
        viewport.scrollLeft = scrollLeft - walkX;
        viewport.scrollTop = scrollTop - walkY;
    });
}

function resetPan(panelId) {
    const viewport = document.getElementById(panelId).querySelector('.viewport');
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
}

// ==========================================
// Helpers / Utilities
// ==========================================
function showLoader(text = 'Loading...') {
    loadingText.textContent = text;
    loadingOverlay.style.display = 'flex';
}

function hideLoader() {
    loadingOverlay.style.display = 'none';
}

function openModal(modalEl) {
    modalEl.style.display = 'flex';
}

function closeModal(modalEl) {
    modalEl.style.display = 'none';
}

function resetViewer() {
    preprocessScreen.style.display = 'none';
    splitScreen.style.display = 'none';
    if (drawingToolbar) drawingToolbar.style.display = 'none';
    questionsList.style.display = 'none';
    questionsEmptyState.style.display = 'flex';
    editMappingBtn.disabled = true;
    unmapPaperBtn.disabled = true;
    paperImageStack.innerHTML = '';
    msImageStack.innerHTML = '';
    state.zoom.paper = 1.0;
    state.zoom.ms = 1.0;
    
    document.querySelectorAll('.zoom-level').forEach(el => el.textContent = '100%');
    document.querySelectorAll('.image-stack').forEach(el => el.style.transform = 'scale(1)');
}

function toggleMarkSchemeVisibility() {
    state.showMarkScheme = !state.showMarkScheme;
    if (state.showMarkScheme) {
        state.showNotes = false;
    }
    updateSplitPanelDisplay();
}

function toggleNotesVisibility() {
    state.showNotes = !state.showNotes;
    if (state.showNotes) {
        state.showMarkScheme = false;
    }
    updateSplitPanelDisplay();
}

function updateSplitPanelDisplay() {
    const msPanel = document.getElementById('ms-panel');
    const msImageStack = document.getElementById('ms-image-stack');
    const notesContainer = document.getElementById('notes-container');
    const rightPanelTitle = document.getElementById('right-panel-title');
    const msZoomControls = document.getElementById('ms-zoom-controls');
    
    const toggleMsBtn = document.getElementById('toggle-ms-btn');
    const toggleNotesBtn = document.getElementById('toggle-notes-btn');
    
    if (state.showMarkScheme) {
        splitScreen.style.gridTemplateColumns = '1fr 1fr';
        msPanel.style.display = 'flex';
        
        msImageStack.style.display = 'flex';
        notesContainer.style.display = 'none';
        msZoomControls.style.display = 'flex';
        
        rightPanelTitle.textContent = 'Mark Scheme';
        
        toggleMsBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Hide Mark Scheme';
        toggleMsBtn.classList.remove('show-state');
        
        toggleNotesBtn.innerHTML = '<i class="fa-solid fa-book-open"></i> Show Notes';
        toggleNotesBtn.classList.add('show-state');
        
    } else if (state.showNotes) {
        splitScreen.style.gridTemplateColumns = '1fr 1fr';
        msPanel.style.display = 'flex';
        
        msImageStack.style.display = 'none';
        notesContainer.style.display = 'block';
        msZoomControls.style.display = 'none';
        
        rightPanelTitle.textContent = 'Revision Notes';
        
        toggleMsBtn.innerHTML = '<i class="fa-solid fa-eye"></i> Show Mark Scheme';
        toggleMsBtn.classList.add('show-state');
        
        toggleNotesBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Hide Notes';
        toggleNotesBtn.classList.remove('show-state');
        
        loadNotesForCurrentQuestion();
        
    } else {
        splitScreen.style.gridTemplateColumns = '1fr';
        msPanel.style.display = 'none';
        
        toggleMsBtn.innerHTML = '<i class="fa-solid fa-eye"></i> Show Mark Scheme';
        toggleMsBtn.classList.add('show-state');
        
        toggleNotesBtn.innerHTML = '<i class="fa-solid fa-book-open"></i> Show Notes';
        toggleNotesBtn.classList.add('show-state');
    }
}

async function loadNotesForCurrentQuestion() {
    const notesContainer = document.getElementById('notes-container');
    if (!state.currentQuestionKey || !state.mapping) return;
    
    const qData = state.mapping.questions[state.currentQuestionKey];
    if (!qData || !qData.note_url) {
        notesContainer.innerHTML = '<div class="empty-state"><i class="fa-solid fa-unlink"></i><p>No revision notes linked to this question yet. Click "Edit Mapping" to link a subtopic.</p></div>';
        return;
    }
    
    notesContainer.innerHTML = '<div class="empty-state"><div class="loading-spinner" style="width:30px;height:30px;border-width:2px;"></div><p>Fetching revision notes...</p></div>';
    
    try {
        const res = await fetch(`${API_URL}/api/note_content?url=${encodeURIComponent(qData.note_url)}`);
        const data = await res.json();
        
        if (data.error) {
            notesContainer.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation" style="color:var(--color-danger)"></i><p>Failed to load note content:<br>${data.error}</p></div>`;
        } else {
            notesContainer.innerHTML = `
                <div class="note-attribution" style="margin-bottom:15px; font-size:12px; color:var(--text-secondary); display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:8px;">
                    <span>Linked: <strong>${qData.note_title || 'Revision Note'}</strong></span>
                    <a href="${qData.note_url}" target="_blank" style="color:var(--accent-primary);text-decoration:none;"><i class="fa-solid fa-external-link"></i> Open on SaveMyExams</a>
                </div>
                ${data.content}
            `;
        }
    } catch (err) {
        console.error('Error fetching notes:', err);
        notesContainer.innerHTML = '<div class="empty-state"><i class="fa-solid fa-wifi-off"></i><p>Network error loading revision notes.</p></div>';
    }
}

function populatePreprocessBoards() {
    const boardSelect = document.getElementById('preprocess-board');
    const levelSelect = document.getElementById('preprocess-level');
    
    if (!pmtState.config || !state.currentSubject) return;
    
    const subjectKey = state.currentSubject.toLowerCase().replace(/\s+/g, '-');
    const level = levelSelect.value;
    
    boardSelect.innerHTML = '';
    const levelConfig = pmtState.config[level];
    if (!levelConfig) return;
    
    const boards = levelConfig[subjectKey] || [];
    
    if (boards.length === 0) {
        boardSelect.innerHTML = '<option value="" disabled selected>No boards configured</option>';
        return;
    }
    
    boards.forEach(board => {
        const opt = document.createElement('option');
        opt.value = board;
        opt.textContent = formatPMTDisplayName(board);
        boardSelect.appendChild(opt);
    });
    
    if (boardSelect.options.length > 0) {
        boardSelect.selectedIndex = 0;
    }
}

async function resetPaperMapping() {
    if (!state.currentSubject || !state.currentPaper) return;
    
    if (!confirm(`Are you sure you want to reset "${state.currentPaper.name}"? This will clear the question mapping and require running alignment again.`)) {
        return;
    }
    
    showLoader('Resetting paper alignment...');
    try {
        const res = await fetch(`${API_URL}/api/unprocess`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subject: state.currentSubject,
                paper_name: state.currentPaper.name
            })
        });
        const data = await res.json();
        if (data.success) {
            // Reload subject's papers list
            await fetchPapers(state.currentSubject);
            // Re-select the same paper (which will now show the preprocess wizard)
            const updatedPaper = state.papers.find(p => p.name === state.currentPaper.name);
            if (updatedPaper) {
                selectPaper(updatedPaper);
            } else {
                resetViewer();
            }
        } else {
            alert(data.error || 'Failed to reset paper mapping.');
        }
    } catch (err) {
        console.error(err);
        alert('An error occurred while resetting the paper mapping.');
    } finally {
        hideLoader();
    }
}

// PMT Downloader State
let pmtState = {
    config: null,
    fetchedPapers: [],
    selectedPapers: []
};

function formatPMTDisplayName(val) {
    if (!val) return '';
    const custom = {
        'aqa': 'AQA',
        'ocr': 'OCR',
        'ocr-a': 'OCR A',
        'ocr-b': 'OCR B',
        'ocr-mei': 'OCR MEI',
        'cie': 'CIE (CAIE)',
        'cie-igcse': 'CIE IGCSE',
        'cie-igcse-further': 'CIE IGCSE Further',
        'cie-old': 'CIE (Old)',
        'edexcel': 'Edexcel',
        'edexcel-a': 'Edexcel A',
        'edexcel-b': 'Edexcel B',
        'edexcel-ial': 'Edexcel IAL',
        'edexcel-igcse': 'Edexcel IGCSE',
        'edexcel-igcse-a': 'Edexcel IGCSE A',
        'edexcel-igcse-b': 'Edexcel IGCSE B',
        'edexcel-igcse-further': 'Edexcel IGCSE Further',
        'wjec': 'WJEC',
        'wjec-eduqas': 'Eduqas',
        'wjec-eduqas-a': 'Eduqas A',
        'wjec-eduqas-b': 'Eduqas B',
        'wjec-wales': 'WJEC Wales',
        'eduqas': 'Eduqas',
        'caie': 'CAIE',
        'maths': 'Maths',
        'biology': 'Biology',
        'chemistry': 'Chemistry',
        'physics': 'Physics',
        'computer-science': 'Computer Science',
        'economics': 'Economics',
        'english-language': 'English Language',
        'english-literature': 'English Literature',
        'geography': 'Geography',
        'history': 'History',
        'psychology': 'Psychology',
        'combined-science': 'Combined Science'
    };
    if (custom[val.toLowerCase()]) {
        return custom[val.toLowerCase()];
    }
    return val.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

async function initPMTDownloader() {
    // Tab switching elements
    const tabLocalUpload = document.getElementById('tab-local-upload');
    const tabPmtDownloader = document.getElementById('tab-pmt-downloader');
    const localUploadPanel = document.getElementById('local-upload-panel');
    const pmtDownloaderPanel = document.getElementById('pmt-downloader-panel');
    
    // PMT Form elements
    const pmtLevel = document.getElementById('pmt-level');
    const pmtSubject = document.getElementById('pmt-subject');
    const pmtBoard = document.getElementById('pmt-board');
    const pmtSearchBtn = document.getElementById('pmt-search-btn');
    
    // PMT Modal elements
    const pmtListModal = document.getElementById('pmt-list-modal');
    const pmtModalTitle = document.getElementById('pmt-modal-title');
    const pmtPapersList = document.getElementById('pmt-papers-list');
    const pmtSelectAll = document.getElementById('pmt-select-all');
    const pmtSelectNone = document.getElementById('pmt-select-none');
    const submitPmtDownloadBtn = document.getElementById('submit-pmt-download-btn');
    const pmtSelectedCount = document.getElementById('pmt-selected-count');
    
    // Tab switching listeners
    tabLocalUpload.addEventListener('click', () => {
        tabLocalUpload.classList.add('active');
        tabPmtDownloader.classList.remove('active');
        localUploadPanel.style.display = 'block';
        pmtDownloaderPanel.style.display = 'none';
    });
    
    tabPmtDownloader.addEventListener('click', () => {
        tabPmtDownloader.classList.add('active');
        tabLocalUpload.classList.remove('active');
        pmtDownloaderPanel.style.display = 'block';
        localUploadPanel.style.display = 'none';
    });

    // Load dynamic PMT config
    try {
        const res = await fetch(`${API_URL}/api/pmt/config`);
        pmtState.config = await res.json();
        setupDynamicPMTSelectors();
    } catch (err) {
        console.error('Error fetching PMT configuration:', err);
    }

    function setupDynamicPMTSelectors() {
        if (!pmtState.config) return;

        // Populate levels
        const levels = Object.keys(pmtState.config);
        pmtLevel.innerHTML = '';
        levels.forEach(level => {
            const opt = document.createElement('option');
            opt.value = level;
            opt.textContent = level === 'gcse' ? 'GCSE' : 'A-Level';
            pmtLevel.appendChild(opt);
        });

        // Event listener on Level selection change
        pmtLevel.addEventListener('change', () => {
            populateSubjects();
        });

        // Event listener on Subject selection change
        pmtSubject.addEventListener('change', () => {
            populateBoards();
        });

        // Initialize selectors
        populateSubjects();
    }

    function populateSubjects() {
        const level = pmtLevel.value;
        if (!pmtState.config || !pmtState.config[level]) return;

        const subjects = Object.keys(pmtState.config[level]);
        pmtSubject.innerHTML = '<option value="" disabled selected>Select Subject</option>';
        pmtSubject.disabled = false;

        subjects.forEach(subject => {
            const opt = document.createElement('option');
            opt.value = subject;
            opt.textContent = formatPMTDisplayName(subject);
            pmtSubject.appendChild(opt);
        });

        // Reset board
        pmtBoard.innerHTML = '<option value="" disabled selected>Select Subject First</option>';
        pmtBoard.disabled = true;

        // Auto-match current selected workspace subject if possible
        if (state.currentSubject) {
            let matched = false;
            const workspaceSubjLower = state.currentSubject.toLowerCase();
            
            // Try matching normalized or raw string (e.g. combined-science / physics)
            for (let opt of pmtSubject.options) {
                if (opt.value.toLowerCase() === workspaceSubjLower || opt.value.replace(/-/g, '') === workspaceSubjLower) {
                    pmtSubject.value = opt.value;
                    matched = true;
                    break;
                }
            }
            if (matched) {
                populateBoards();
            }
        }
    }

    function populateBoards() {
        const level = pmtLevel.value;
        const subject = pmtSubject.value;
        if (!pmtState.config || !pmtState.config[level] || !pmtState.config[level][subject]) return;

        const boards = pmtState.config[level][subject];
        pmtBoard.innerHTML = '<option value="" disabled selected>Select Exam Board</option>';
        pmtBoard.disabled = false;

        boards.forEach(board => {
            const opt = document.createElement('option');
            opt.value = board;
            opt.textContent = formatPMTDisplayName(board);
            pmtBoard.appendChild(opt);
        });
    }
    
    // Search listener
    pmtSearchBtn.addEventListener('click', async () => {
        const level = pmtLevel.value;
        const subject = pmtSubject.value;
        const board = pmtBoard.value;
        
        if (!level || !subject || !board) {
            alert('Please select Level, Subject, and Exam Board.');
            return;
        }
        
        showLoader(`Searching PMT for ${formatPMTDisplayName(level)} ${formatPMTDisplayName(subject)} (${formatPMTDisplayName(board)})...`);
        
        try {
            const res = await fetch(`${API_URL}/api/pmt/list_papers?level=${level}&subject=${subject}&board=${board}`);
            const data = await res.json();
            
            if (data.error) {
                alert(data.error);
                return;
            }
            
            pmtState.fetchedPapers = data;
            pmtState.selectedPapers = [];
            
            // Populate Modal Checklist
            pmtModalTitle.textContent = `${formatPMTDisplayName(subject)} - ${formatPMTDisplayName(board)} (${level.toUpperCase()})`;
            pmtPapersList.innerHTML = '';
            
            if (data.length === 0) {
                pmtPapersList.innerHTML = '<div class="empty-state"><i class="fa-solid fa-face-frown"></i><p>No papers found. Check board/subject support.</p></div>';
                submitPmtDownloadBtn.disabled = true;
            } else {
                data.forEach((paper, idx) => {
                    const li = document.createElement('li');
                    li.className = 'pmt-paper-checkbox-item';
                    
                    li.innerHTML = `
                        <input type="checkbox" id="pmt-paper-check-${idx}" data-idx="${idx}">
                        <label for="pmt-paper-check-${idx}" class="pmt-paper-details">
                            <span class="pmt-paper-name">${paper.display_name}</span>
                            <span class="pmt-paper-urls-info">Paper and Mark Scheme available</span>
                        </label>
                    `;
                    
                    // Listeners for checkbox changes
                    const chk = li.querySelector('input[type="checkbox"]');
                    chk.addEventListener('change', (e) => {
                        const paperIdx = parseInt(e.target.dataset.idx);
                        const p = pmtState.fetchedPapers[paperIdx];
                        if (e.target.checked) {
                            pmtState.selectedPapers.push(p);
                        } else {
                            pmtState.selectedPapers = pmtState.selectedPapers.filter(item => item.id !== p.id);
                        }
                        updateSelectedCount();
                    });
                    
                    // Allow clicking label/item to check
                    li.addEventListener('click', (e) => {
                        if (e.target !== chk && e.target.tagName !== 'LABEL') {
                            chk.checked = !chk.checked;
                            chk.dispatchEvent(new Event('change'));
                        }
                    });
                    
                    pmtPapersList.appendChild(li);
                });
                submitPmtDownloadBtn.disabled = true;
            }
            
            updateSelectedCount();
            openModal(pmtListModal);
            
        } catch (err) {
            console.error(err);
            alert('An error occurred while scraping PMT. Please try again.');
        } finally {
            hideLoader();
        }
    });
    
    // Select all/none actions
    pmtSelectAll.addEventListener('click', () => {
        document.querySelectorAll('#pmt-papers-list input[type="checkbox"]').forEach(chk => {
            if (!chk.checked) {
                chk.checked = true;
                chk.dispatchEvent(new Event('change'));
            }
        });
    });
    
    pmtSelectNone.addEventListener('click', () => {
        document.querySelectorAll('#pmt-papers-list input[type="checkbox"]').forEach(chk => {
            if (chk.checked) {
                chk.checked = false;
                chk.dispatchEvent(new Event('change'));
            }
        });
    });
    
    // Download listener
    submitPmtDownloadBtn.addEventListener('click', async () => {
        const subject = pmtSubject.value; // The subject slug on PMT (e.g. computer-science)
        const displaySubject = formatPMTDisplayName(subject); // Normalized directory name (e.g. Computer Science)
        
        closeModal(pmtListModal);
        showLoader(`Downloading ${pmtState.selectedPapers.length} papers directly into subjects/${displaySubject}...`);
        
        try {
            const res = await fetch(`${API_URL}/api/pmt/download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subject: displaySubject,
                    papers: pmtState.selectedPapers
                })
            });
            
            const data = await res.json();
            if (data.success) {
                // Refresh selections
                await fetchSubjects();
                
                // If current selected subject matches displaySubject, reload its papers
                if (state.currentSubject.toLowerCase() === displaySubject.toLowerCase()) {
                    subjectSelect.value = state.currentSubject;
                    await fetchPapers(state.currentSubject);
                } else {
                    // Set dropdown value to displaySubject
                    subjectSelect.value = displaySubject;
                    subjectSelect.dispatchEvent(new Event('change'));
                }
                
                alert(`Direct download complete! ${data.count} past papers and mark schemes have been added.`);
            } else {
                alert(data.error || 'Failed to download papers');
            }
        } catch (err) {
            console.error(err);
            alert('An error occurred during download execution.');
        } finally {
            hideLoader();
        }
    });
    
    // Helper to close modal
    pmtListModal.querySelectorAll('.modal-close-btn').forEach(btn => {
        btn.addEventListener('click', () => closeModal(pmtListModal));
    });
    
    function updateSelectedCount() {
        const count = pmtState.selectedPapers.length;
        pmtSelectedCount.textContent = count;
        submitPmtDownloadBtn.disabled = count === 0;
    }
}

// ==========================================
// Phase 5: PDF Drawing Persistent Engine
// ==========================================
function initDrawingToolbar() {
    const tools = ['select', 'pen', 'line', 'rect', 'circle', 'text'];
    
    // 1. Tool Selection Listeners
    tools.forEach(tool => {
        const btn = document.getElementById(`draw-tool-${tool}`);
        if (btn) {
            btn.addEventListener('click', () => {
                // Remove active class from all tool buttons
                tools.forEach(t => {
                    const b = document.getElementById(`draw-tool-${t}`);
                    if (b) b.classList.remove('active');
                });
                // Set active class
                btn.classList.add('active');
                state.drawingMode.tool = tool;
                
                // Update slider step/min/max/labels based on tool type
                const slider = document.getElementById('draw-size-slider');
                const valLabel = document.getElementById('draw-size-value');
                if (tool === 'text') {
                    slider.min = 12;
                    slider.max = 36;
                    slider.value = 18;
                    valLabel.textContent = '18pt';
                    state.drawingMode.size = 18;
                } else {
                    slider.min = 1;
                    slider.max = 15;
                    slider.value = 3;
                    valLabel.textContent = '3px';
                    state.drawingMode.size = 3;
                }
                
                updateCanvasPointerEvents();
            });
        }
    });
    
    // 2. Color Swatches Selection
    const swatches = document.querySelectorAll('.color-section .color-swatch');
    const picker = document.getElementById('draw-color-picker');
    
    swatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            swatches.forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            
            const color = swatch.dataset.color;
            state.drawingMode.color = color;
            if (picker) picker.value = color;
        });
    });
    
    // 3. Custom Color Picker Change
    if (picker) {
        picker.addEventListener('input', (e) => {
            swatches.forEach(s => s.classList.remove('active'));
            state.drawingMode.color = e.target.value;
        });
    }
    
    // 4. Size Slider Change
    const sizeSlider = document.getElementById('draw-size-slider');
    const sizeValue = document.getElementById('draw-size-value');
    if (sizeSlider && sizeValue) {
        sizeSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            state.drawingMode.size = parseInt(val);
            sizeValue.textContent = state.drawingMode.tool === 'text' ? `${val}pt` : `${val}px`;
        });
    }
}

function updateCanvasPointerEvents() {
    const canvases = document.querySelectorAll('.drawing-canvas');
    canvases.forEach(canvas => {
        canvas.style.pointerEvents = state.drawingMode.tool === 'select' ? 'none' : 'auto';
    });
}

function createPageWithCanvas(pageType, pageNum) {
    const wrapper = document.createElement('div');
    wrapper.className = 'page-wrapper';
    wrapper.dataset.pageType = pageType;
    wrapper.dataset.pageNum = pageNum;
    
    const img = document.createElement('img');
    img.src = `${API_URL}/api/page/${pageType}/${encodeURIComponent(state.currentSubject)}/${encodeURIComponent(state.currentPaper.name)}/${pageNum}?t=${new Date().getTime()}`;
    img.alt = `${pageType === 'paper' ? 'Question' : 'Mark Scheme'} Page ${pageNum}`;
    
    const canvas = document.createElement('canvas');
    canvas.className = 'drawing-canvas';
    canvas.style.pointerEvents = state.drawingMode.tool === 'select' ? 'none' : 'auto';
    
    wrapper.appendChild(img);
    wrapper.appendChild(canvas);
    
    img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
    };
    
    setupCanvasDrawingEvents(wrapper, canvas, pageType, pageNum);
    
    return wrapper;
}

function setupCanvasDrawingEvents(wrapper, canvas, pageType, pageNum) {
    const ctx = canvas.getContext('2d');
    let isDrawing = false;
    let startX = 0, startY = 0;
    let points = [];
    
    function getCanvasCoords(e) {
        const rect = canvas.getBoundingClientRect();
        // Scale client coordinates to canvas internal pixel dimensions
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);
        return { x, y };
    }
    
    canvas.addEventListener('mousedown', (e) => {
        if (state.drawingMode.tool === 'select') return;
        
        isDrawing = true;
        const coords = getCanvasCoords(e);
        startX = coords.x;
        startY = coords.y;
        
        if (state.drawingMode.tool === 'text') {
            isDrawing = false;
            showTextInputOverlay(wrapper, canvas, e, coords.x, coords.y, pageType, pageNum);
            return;
        }
        
        points = [[coords.x, coords.y]];
    });
    
    canvas.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        
        const coords = getCanvasCoords(e);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = state.drawingMode.color;
        ctx.lineWidth = state.drawingMode.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        const tool = state.drawingMode.tool;
        
        if (tool === 'pen') {
            if (e.shiftKey) {
                // Draw straight line from start
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(coords.x, coords.y);
                ctx.stroke();
            } else {
                points.push([coords.x, coords.y]);
                ctx.beginPath();
                ctx.moveTo(points[0][0], points[0][1]);
                for (let i = 1; i < points.length; i++) {
                    ctx.lineTo(points[i][0], points[i][1]);
                }
                ctx.stroke();
            }
        } else if (tool === 'line') {
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(coords.x, coords.y);
            ctx.stroke();
        } else if (tool === 'rect') {
            ctx.beginPath();
            ctx.rect(startX, startY, coords.x - startX, coords.y - startY);
            ctx.stroke();
        } else if (tool === 'circle') {
            const radius = Math.sqrt(Math.pow(coords.x - startX, 2) + Math.pow(coords.y - startY, 2));
            ctx.beginPath();
            ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
            ctx.stroke();
        }
    });
    
    const endDrawing = async (e) => {
        if (!isDrawing) return;
        isDrawing = false;
        
        const coords = getCanvasCoords(e);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const tool = state.drawingMode.tool;
        let pointsRatios = [];
        
        if (tool === 'pen') {
            if (e.shiftKey) {
                pointsRatios = [
                    [startX / canvas.width, startY / canvas.height],
                    [coords.x / canvas.width, coords.y / canvas.height]
                ];
            } else {
                if (points.length < 2) return;
                pointsRatios = points.map(pt => [pt[0] / canvas.width, pt[1] / canvas.height]);
            }
        } else if (tool === 'line' || tool === 'rect' || tool === 'circle') {
            pointsRatios = [
                [startX / canvas.width, startY / canvas.height],
                [coords.x / canvas.width, coords.y / canvas.height]
            ];
        } else {
            return;
        }
        
        await commitDrawingToBackend(wrapper, pageType, pageNum, {
            tool: tool,
            color: state.drawingMode.color,
            size: state.drawingMode.size,
            points: pointsRatios
        });
    };
    
    canvas.addEventListener('mouseup', endDrawing);
    canvas.addEventListener('mouseleave', endDrawing);
}

function showTextInputOverlay(wrapper, canvas, e, canvasX, canvasY, pageType, pageNum) {
    if (wrapper.querySelector('.canvas-text-input')) return;
    
    const rect = canvas.getBoundingClientRect();
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'canvas-text-input';
    
    input.style.left = `${e.clientX - rect.left}px`;
    input.style.top = `${e.clientY - rect.top - 10}px`;
    input.style.fontSize = `${state.drawingMode.size}px`;
    input.style.color = state.drawingMode.color;
    input.style.border = `1px solid ${state.drawingMode.color}`;
    
    wrapper.appendChild(input);
    input.focus();
    
    const submitText = async () => {
        const textVal = input.value.trim();
        if (textVal) {
            const startRatioX = canvasX / canvas.width;
            const startRatioY = canvasY / canvas.height;
            
            await commitDrawingToBackend(wrapper, pageType, pageNum, {
                tool: 'text',
                color: state.drawingMode.color,
                size: state.drawingMode.size,
                points: [[startRatioX, startRatioY]],
                text: textVal
            });
        }
        input.remove();
    };
    
    input.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter') submitText();
        if (evt.key === 'Escape') input.remove();
    });
    
    input.addEventListener('blur', submitText);
}

async function commitDrawingToBackend(wrapper, pageType, pageNum, drawingData) {
    showLoader('Saving drawing annotation...');
    try {
        const res = await fetch(`${API_URL}/api/drawing/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subject: state.currentSubject,
                paper_name: state.currentPaper.name,
                page_type: pageType,
                page_num: pageNum,
                tool: drawingData.tool,
                color: drawingData.color,
                size: drawingData.size,
                points: drawingData.points,
                text: drawingData.text || ''
            })
        });
        
        const data = await res.json();
        if (data.success) {
            const img = wrapper.querySelector('img');
            const baseUrl = img.src.split('?')[0];
            img.src = `${baseUrl}?t=${new Date().getTime()}`;
        } else {
            alert(data.error || 'Failed to save drawing');
        }
    } catch (err) {
        console.error(err);
        alert('An error occurred while saving the drawing.');
    } finally {
        hideLoader();
    }
}
