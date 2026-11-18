let db = JSON.parse(localStorage.getItem('forge_v6_db')) || { workouts: [], history: [], progressPhotos: [] };
let activeWorkoutId = null;
let editorMovements = [];

const save = () => localStorage.setItem('forge_v6_db', JSON.stringify(db));

// --- INDEXEDDB FOR PROGRESS PHOTOS ---
let photoDB = null;
const PHOTO_DB_NAME = 'ironman_photos';
const PHOTO_STORE_NAME = 'photos';

function openPhotoDB() {
    return new Promise((resolve, reject) => {
        if (photoDB) {
            resolve(photoDB);
            return;
        }
        const request = indexedDB.open(PHOTO_DB_NAME, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            photoDB = request.result;
            resolve(photoDB);
        };
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(PHOTO_STORE_NAME)) {
                db.createObjectStore(PHOTO_STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

// Storage estimation with navigator.storage.estimate()
async function checkStorageUsage() {
    if (navigator.storage && navigator.storage.estimate) {
        try {
            const estimate = await navigator.storage.estimate();
            const usedMB = (estimate.usage / (1024 * 1024)).toFixed(1);
            const quotaMB = (estimate.quota / (1024 * 1024)).toFixed(0);
            const percentUsed = ((estimate.usage / estimate.quota) * 100).toFixed(1);

            if (percentUsed > 80) {
                alert(`⚠️ Storage Warning: Using ${usedMB}MB of ${quotaMB}MB (${percentUsed}%). Consider deleting some old photos.`);
            }
        } catch (e) {
            console.log('Storage estimation not available');
        }
    }
}

// Migrate existing photos from localStorage to IndexedDB
async function migratePhotosToIndexedDB() {
    if (db.progressPhotos && db.progressPhotos.length > 0) {
        try {
            const idb = await openPhotoDB();
            const tx = idb.transaction(PHOTO_STORE_NAME, 'readwrite');
            const store = tx.objectStore(PHOTO_STORE_NAME);

            for (const photo of db.progressPhotos) {
                store.put(photo);
            }

            await new Promise((resolve, reject) => {
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });

            // Clear from localStorage after successful migration
            db.progressPhotos = [];
            save();
            console.log('Photos migrated to IndexedDB successfully');
        } catch (e) {
            console.error('Migration failed:', e);
        }
    }
}

// Easter egg audio
let easterEggAudio = null;

function playEasterEgg() {
    // If already playing, do nothing
    if (easterEggAudio && !easterEggAudio.paused) {
        return;
    }

    easterEggAudio = new Audio('song.mp3');
    easterEggAudio.play();
}

function showView(viewId) {
    ['home', 'log', 'stats', 'progress'].forEach(v => document.getElementById(`view-${v}`).classList.add('hidden'));
    document.getElementById(`view-${viewId}`).classList.remove('hidden');

    // Hide navbar when in logger view
    const nav = document.getElementById('main-nav');
    if (viewId === 'log') {
        nav.classList.add('hidden');
    } else {
        nav.classList.remove('hidden');
    }

    document.querySelectorAll('nav button').forEach(b => {
        b.classList.remove('tab-active');
        b.classList.add('text-amber-600');
    });
    const navBtn = document.getElementById(`nav-${viewId}`);
    if (navBtn) {
        navBtn.classList.add('tab-active');
        navBtn.classList.remove('text-amber-600');
    }
    if (viewId === 'home') renderHome();
    if (viewId === 'stats') renderHistory();
    if (viewId === 'progress') renderProgressPhotos(); // async, renders when ready
    lucide.createIcons();
}

// --- WORKOUT EDITOR ---
function openWorkoutModal(id = null) {
    activeWorkoutId = id;
    const title = document.getElementById('modalTitle');
    const nameInput = document.getElementById('workoutNameInput');
    if (id) {
        const w = db.workouts.find(x => x.id === id);
        title.innerText = "Edit Workout";
        nameInput.value = w.name;
        editorMovements = w.movements.map(m => ({ name: m.name }));
    } else {
        title.innerText = "New Workout";
        nameInput.value = '';
        editorMovements = [{ name: '' }];
    }
    renderEditorRows();
    document.getElementById('modal-workout').classList.remove('hidden');
}

function closeWorkoutModal() { document.getElementById('modal-workout').classList.add('hidden'); }

function renderEditorRows() {
    const container = document.getElementById('movementInputsContainer');
    container.innerHTML = '';
    editorMovements.forEach((mov, idx) => {
        const div = document.createElement('div');
        div.className = "flex gap-2 items-center animate-in";
        div.innerHTML = `
            <div class="flex flex-col">
                <button onclick="moveMov(${idx}, -1)" class="p-1 text-slate-600 ${idx === 0 ? 'opacity-0' : ''}" ${idx === 0 ? 'disabled' : ''}><i data-lucide="chevron-up" class="w-4 h-4"></i></button>
                <button onclick="moveMov(${idx}, 1)" class="p-1 text-slate-600 ${idx === editorMovements.length - 1 ? 'opacity-0' : ''}" ${idx === editorMovements.length - 1 ? 'disabled' : ''}><i data-lucide="chevron-down" class="w-4 h-4"></i></button>
            </div>
            <input type="text" value="${mov.name}" oninput="editorMovements[${idx}].name = this.value" placeholder="Movement" class="flex-1 bg-neutral-900 border border-white/5 rounded-xl p-3 outline-none focus:border-red-500 text-base font-500">
            <button onclick="removeEditorRow(${idx})" class="p-2 text-slate-700 hover:text-red-400"><i data-lucide="x-circle" class="w-5 h-5"></i></button>
        `;
        container.appendChild(div);
    });
    lucide.createIcons();
}

function addMovementRow() {
    editorMovements.push({ name: '' });
    renderEditorRows();
    // Focus the new input field so keyboard stays open
    const inputs = document.querySelectorAll('#movementInputsContainer input[type="text"]');
    if (inputs.length > 0) {
        inputs[inputs.length - 1].focus();
    }
}
function removeEditorRow(idx) { editorMovements.splice(idx, 1); renderEditorRows(); }
function moveMov(idx, dir) {
    const target = idx + dir;
    if (target >= 0 && target < editorMovements.length) {
        [editorMovements[idx], editorMovements[target]] = [editorMovements[target], editorMovements[idx]];
        renderEditorRows();
    }
}

function handleWorkoutSave() {
    const name = document.getElementById('workoutNameInput').value;
    const valid = editorMovements.map(m => m.name.trim()).filter(n => n);
    if (!name || !valid.length) return alert("Required fields missing");

    if (activeWorkoutId) {
        const w = db.workouts.find(x => x.id === activeWorkoutId);
        w.name = name;
        w.movements = valid.map(n => {
            const old = w.movements.find(e => e.name === n);
            return old || { name: n, unit: 'kg', lastSets: [{ weight: '', reps: '' }] };
        });
    } else {
        db.workouts.push({ id: Date.now(), name, movements: valid.map(n => ({ name: n, unit: 'kg', lastSets: [{ weight: '', reps: '' }] })) });
    }
    save(); closeWorkoutModal(); renderHome();
}

// --- HOME SCREEN ---
function renderHome() {
    const container = document.getElementById('workoutList');
    container.innerHTML = db.workouts.length ? '' : `<div class="text-center py-20 text-slate-700 font-500">No workouts yet.</div>`;
    db.workouts.forEach(w => {
        const lastEntry = db.history.find(h => h.templateId === w.id);
        const dateLabel = lastEntry ? `• Last: ${lastEntry.date}` : '• New';

        const div = document.createElement('div');
        div.className = "glass p-5 rounded-[2.5rem] flex justify-between items-center animate-in";
        div.innerHTML = `
            <div onclick="openLogger(${w.id})" class="flex-1 cursor-pointer">
                <h3 class="font-800 text-xl text-red-500">${w.name}</h3>
                <p class="text-xs font-black text-slate-500 uppercase mt-1 tracking-wider">${w.movements.length} Movements ${dateLabel}</p>
            </div>
            <div class="flex gap-2">
                <button onclick="event.stopPropagation(); openWorkoutModal(${w.id})" class="p-3 bg-white/5 rounded-2xl text-slate-500"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                <button onclick="event.stopPropagation(); deleteWorkout(${w.id})" class="p-3 bg-white/5 rounded-2xl text-slate-500 hover:text-red-400 transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>`;
        container.appendChild(div);
    });
    lucide.createIcons();
}

function deleteWorkout(id) {
    if (confirm("Permanently delete this workout?")) {
        db.workouts = db.workouts.filter(w => w.id !== id);
        save(); renderHome();
    }
}

// --- LOGGER (WITH INSTANT AUTO-SAVE) ---
let currentLogSession = null;

function openLogger(id) {
    currentLogSession = db.workouts.find(x => x.id === id);
    document.getElementById('logWorkoutName').innerText = currentLogSession.name;
    renderLogMovements();
    showView('log');
}

function renderLogMovements() {
    const container = document.getElementById('movementLogs');
    container.innerHTML = '';
    currentLogSession.movements.forEach((mov, mIdx) => {
        const div = document.createElement('div');
        div.className = "glass p-6 rounded-[2.5rem] space-y-4 animate-in";
        div.innerHTML = `
            <div class="flex justify-between items-center">
                <h4 class="font-800 text-lg text-red-500 truncate">${mov.name}</h4>
                <div class="flex glass-bright rounded-xl p-1">
                    <button onclick="toggleUnit(${mIdx}, 'kg')" class="px-3 py-1 rounded-lg text-xs font-black ${mov.unit === 'kg' ? 'bg-red-600' : 'text-slate-500'}">KG</button>
                    <button onclick="toggleUnit(${mIdx}, 'lbs')" class="px-3 py-1 rounded-lg text-xs font-black ${mov.unit === 'lbs' ? 'bg-red-600' : 'text-slate-500'}">LBS</button>
                </div>
            </div>
            <div id="sets-box-${mIdx}" class="space-y-3"></div>
            <button onclick="addSetToLog(${mIdx})" class="w-full py-3 rounded-xl border border-dashed border-white/5 text-slate-600 text-xs font-black uppercase">+ Add Set</button>
        `;
        container.appendChild(div);
        renderSetRows(mIdx);
    });
}

function renderSetRows(mIdx) {
    const container = document.getElementById(`sets-box-${mIdx}`);
    const mov = currentLogSession.movements[mIdx];
    container.innerHTML = mov.lastSets.map((s, sIdx) => `
        <div class="flex items-center gap-3">
            <span class="w-4 text-xs font-black text-slate-700">${sIdx + 1}</span>
            <div class="flex-1 grid grid-cols-2 gap-3">
                <input type="number" step="any" value="${s.weight}" oninput="liveUpdate(${mIdx},${sIdx},'weight',this.value)" placeholder="Wt (${mov.unit})" class="w-full border border-white/5 rounded-2xl p-4 text-center text-base font-700 outline-none focus:border-red-500">
                <input type="number" value="${s.reps}" oninput="liveUpdate(${mIdx},${sIdx},'reps',this.value)" placeholder="Reps" class="w-full border border-white/5 rounded-2xl p-4 text-center text-base font-700 outline-none focus:border-red-500">
            </div>
            <button onclick="removeSetFromLog(${mIdx}, ${sIdx})" class="p-2 text-slate-800"><i data-lucide="x" class="w-4 h-4"></i></button>
        </div>
    `).join('');
    lucide.createIcons();
}

function liveUpdate(mIdx, sIdx, field, val) {
    currentLogSession.movements[mIdx].lastSets[sIdx][field] = val;
    save();
}

function addSetToLog(mIdx) {
    const sets = currentLogSession.movements[mIdx].lastSets;
    sets.push({ ...(sets[sets.length - 1] || { weight: '', reps: '' }) });
    save(); renderSetRows(mIdx);
}

function removeSetFromLog(mIdx, sIdx) {
    currentLogSession.movements[mIdx].lastSets.splice(sIdx, 1);
    save(); renderSetRows(mIdx);
}

function toggleUnit(mIdx, unit) {
    const mov = currentLogSession.movements[mIdx];
    if (mov.unit === unit) return;
    mov.lastSets.forEach(s => {
        if (s.weight) s.weight = unit === 'kg' ? (s.weight * 0.453592).toFixed(1) : (s.weight * 2.20462).toFixed(1);
    });
    mov.unit = unit;
    save(); renderLogMovements();
}

function finishSession() {
    const log = {
        id: Date.now(),
        templateId: currentLogSession.id,
        workoutName: currentLogSession.name,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        movements: JSON.parse(JSON.stringify(currentLogSession.movements))
    };
    db.history.unshift(log);
    save();
    showView('home');
}

// --- HISTORY VAULT (REPLACED CHART) ---
function renderHistory() {
    const container = document.getElementById('historyList');
    document.getElementById('historyCount').innerText = `${db.history.length} Logs`;
    container.innerHTML = db.history.length ? '' : `<div class="text-center py-20 text-slate-700 font-500">No session history found.</div>`;

    db.history.forEach((session, sIdx) => {
        const card = document.createElement('div');
        card.className = "history-card glass rounded-[2rem] overflow-hidden";
        card.id = `history-${session.id}`;

        let movementSummary = session.movements.map(m => `
            <div class="mb-4">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-sm font-800 text-amber-400 uppercase tracking-wider">${m.name}</span>
                    <span class="text-xs font-black text-slate-600 uppercase tracking-widest">${m.unit}</span>
                </div>
                <div class="grid grid-cols-1 gap-1">
                    ${m.lastSets.map((s, i) => `
                        <div class="flex justify-between items-center bg-white/5 p-2 rounded-xl text-sm font-bold">
                            <span class="text-slate-500">Set ${i + 1}</span>
                            <span>${s.weight || 0} ${m.unit} <span class="text-slate-600 ml-1">×</span> ${s.reps || 0}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');

        card.innerHTML = `
            <div onclick="toggleHistoryCard('${session.id}')" class="p-5 flex justify-between items-center cursor-pointer active:bg-white/5 transition-colors">
                <div>
                    <h3 class="font-800 text-base tracking-tight text-amber-100">${session.workoutName}</h3>
                    <p class="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">${session.date}</p>
                </div>
                <i data-lucide="chevron-down" class="chevron-icon w-5 h-5 text-slate-600 transition-transform"></i>
            </div>
            <div class="expanded-content bg-black/20">
                <div class="p-5 pt-0 border-t border-white/5 mt-2">
                    ${movementSummary}
                    <button onclick="event.stopPropagation(); deleteHistoryEntry(${session.id})" class="w-full mt-4 py-3 text-xs font-black text-red-500/50 uppercase tracking-widest hover:text-red-500 transition-colors">Delete Log</button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
    lucide.createIcons();
}

function toggleHistoryCard(id) {
    const card = document.getElementById(`history-${id}`);
    const isExpanded = card.classList.contains('is-expanded');

    // Close others
    document.querySelectorAll('.history-card').forEach(c => c.classList.remove('is-expanded'));

    if (!isExpanded) card.classList.add('is-expanded');
}

function deleteHistoryEntry(id) {
    if (confirm("Delete this session record?")) {
        db.history = db.history.filter(h => h.id !== id);
        save();
        renderHistory();
    }
}

// --- PROGRESS PHOTOS (IndexedDB) ---
let pendingPhotoData = null;
let currentViewerIndex = 0;
let cachedPhotos = []; // Cache for photos loaded from IndexedDB

function openPhotoUpload() {
    pendingPhotoData = null;
    document.getElementById('photoDateInput').value = new Date().toISOString().split('T')[0];
    document.getElementById('photoPreviewContainer').classList.add('hidden');
    document.getElementById('photoFileInput').value = '';
    document.getElementById('modal-photo-upload').classList.remove('hidden');
    lucide.createIcons();
}

function closePhotoUpload() {
    document.getElementById('modal-photo-upload').classList.add('hidden');
    pendingPhotoData = null;
}

function previewPhoto(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            pendingPhotoData = e.target.result;
            document.getElementById('photoPreview').src = pendingPhotoData;
            document.getElementById('photoPreviewContainer').classList.remove('hidden');
        };
        reader.readAsDataURL(input.files[0]);
    }
}

async function saveProgressPhoto() {
    const dateInput = document.getElementById('photoDateInput').value;
    if (!dateInput || !pendingPhotoData) {
        return alert('Please select a date and photo');
    }

    const photo = {
        id: Date.now(),
        date: dateInput,
        dateFormatted: new Date(dateInput).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        data: pendingPhotoData
    };

    try {
        const idb = await openPhotoDB();
        const tx = idb.transaction(PHOTO_STORE_NAME, 'readwrite');
        const store = tx.objectStore(PHOTO_STORE_NAME);
        store.put(photo);

        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });

        checkStorageUsage();
        closePhotoUpload();
        await renderProgressPhotos();
    } catch (e) {
        console.error('Error saving photo:', e);
        alert('Error saving photo. Please try again.');
    }
}

async function getAllPhotosFromDB() {
    try {
        const idb = await openPhotoDB();
        const tx = idb.transaction(PHOTO_STORE_NAME, 'readonly');
        const store = tx.objectStore(PHOTO_STORE_NAME);
        const request = store.getAll();

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const photos = request.result || [];
                // Sort by date (newest first)
                photos.sort((a, b) => new Date(b.date) - new Date(a.date));
                resolve(photos);
            };
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error('Error getting photos:', e);
        return [];
    }
}

async function renderProgressPhotos() {
    const photos = await getAllPhotosFromDB();
    cachedPhotos = photos; // Update cache for viewer

    const container = document.getElementById('progressList');
    container.innerHTML = photos.length ? '' : `<div class="text-center py-20 text-slate-700 font-500">No progress photos yet.</div>`;

    photos.forEach((photo, idx) => {
        const card = document.createElement('div');
        card.className = "glass p-5 rounded-[2.5rem] flex justify-between items-center animate-in cursor-pointer active:bg-white/5 transition-colors";
        card.onclick = () => openPhotoViewer(idx);
        card.innerHTML = `
            <div class="flex items-center gap-4">
                <div class="w-14 h-14 rounded-2xl overflow-hidden bg-slate-800">
                    <img src="${photo.data}" class="w-full h-full object-cover">
                </div>
                <div>
                    <h3 class="font-800 text-base text-amber-100">${photo.dateFormatted}</h3>
                    <p class="text-xs font-black text-slate-500 uppercase mt-1 tracking-wider">Progress Photo</p>
                </div>
            </div>
            <button onclick="event.stopPropagation(); deleteProgressPhoto(${photo.id})" class="p-3 bg-white/5 rounded-2xl text-slate-500 hover:text-red-400 transition-colors">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
        `;
        container.appendChild(card);
    });
    lucide.createIcons();
}

function openPhotoViewer(index) {
    if (index < 0 || index >= cachedPhotos.length) return;

    currentViewerIndex = index;
    updateViewerDisplay();
    document.getElementById('modal-photo-viewer').classList.remove('hidden');
    lucide.createIcons();
}

function updateViewerDisplay() {
    const photo = cachedPhotos[currentViewerIndex];
    if (!photo) return;

    document.getElementById('viewerPhoto').src = photo.data;
    document.getElementById('viewerDate').innerText = photo.dateFormatted;
    document.getElementById('viewerCounter').innerText = `${currentViewerIndex + 1} / ${cachedPhotos.length}`;

    // Update arrow visibility
    document.getElementById('viewer-prev').style.opacity = currentViewerIndex > 0 ? '1' : '0.3';
    document.getElementById('viewer-next').style.opacity = currentViewerIndex < cachedPhotos.length - 1 ? '1' : '0.3';
}

function navigatePhoto(direction) {
    const newIndex = currentViewerIndex + direction;

    if (newIndex >= 0 && newIndex < cachedPhotos.length) {
        currentViewerIndex = newIndex;
        updateViewerDisplay();
    }
}

function closePhotoViewer() {
    resetPhotoZoom();
    document.getElementById('modal-photo-viewer').classList.add('hidden');
}

// --- PHOTO ZOOM FUNCTIONALITY (Free Pan/Zoom) ---
let photoScale = 1;
let photoTranslateX = 0;
let photoTranslateY = 0;
let initialPinchDistance = 0;
let initialPinchCenterX = 0;
let initialPinchCenterY = 0;
let lastTouchX = 0;
let lastTouchY = 0;
let lastTapTime = 0;
let isPanning = false;

function resetPhotoZoom() {
    photoScale = 1;
    photoTranslateX = 0;
    photoTranslateY = 0;
    const img = document.getElementById('viewerPhoto');
    if (img) {
        img.style.transform = 'scale(1) translate(0px, 0px)';
    }
}

function updatePhotoTransform() {
    const img = document.getElementById('viewerPhoto');
    if (img) {
        img.style.transform = `scale(${photoScale}) translate(${photoTranslateX / photoScale}px, ${photoTranslateY / photoScale}px)`;
    }
}

// Double-tap to zoom at tap location
document.getElementById('viewerPhoto')?.addEventListener('click', (e) => {
    const now = Date.now();
    if (now - lastTapTime < 300) {
        // Double-tap detected
        e.stopPropagation();
        if (photoScale > 1) {
            resetPhotoZoom();
        } else {
            // Zoom to tap location
            const img = document.getElementById('viewerPhoto');
            const rect = img.getBoundingClientRect();
            const tapX = e.clientX - rect.left - rect.width / 2;
            const tapY = e.clientY - rect.top - rect.height / 2;

            photoScale = 2.5;
            photoTranslateX = -tapX * 1.5;
            photoTranslateY = -tapY * 1.5;
            updatePhotoTransform();
        }
    }
    lastTapTime = now;
});

// Touch handlers for pinch-zoom and pan
document.addEventListener('touchstart', (e) => {
    if (document.getElementById('modal-photo-viewer').classList.contains('hidden')) return;

    if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
        initialPinchCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        initialPinchCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    } else if (e.touches.length === 1 && photoScale > 1) {
        isPanning = true;
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
    }
}, { passive: false });

document.addEventListener('touchmove', (e) => {
    if (document.getElementById('modal-photo-viewer').classList.contains('hidden')) return;

    if (e.touches.length === 2 && initialPinchDistance > 0) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const currentDistance = Math.sqrt(dx * dx + dy * dy);
        const currentCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const currentCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

        // Calculate scale change
        const scaleDelta = currentDistance / initialPinchDistance;
        const newScale = Math.min(Math.max(photoScale * scaleDelta, 0.5), 8);

        // Pan while pinching
        const panDeltaX = currentCenterX - initialPinchCenterX;
        const panDeltaY = currentCenterY - initialPinchCenterY;

        photoTranslateX += panDeltaX;
        photoTranslateY += panDeltaY;
        photoScale = newScale;

        initialPinchDistance = currentDistance;
        initialPinchCenterX = currentCenterX;
        initialPinchCenterY = currentCenterY;

        updatePhotoTransform();
    } else if (e.touches.length === 1 && isPanning && photoScale > 1) {
        e.preventDefault();
        const deltaX = e.touches[0].clientX - lastTouchX;
        const deltaY = e.touches[0].clientY - lastTouchY;

        photoTranslateX += deltaX;
        photoTranslateY += deltaY;

        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;

        updatePhotoTransform();
    }
}, { passive: false });

document.addEventListener('touchend', (e) => {
    if (document.getElementById('modal-photo-viewer').classList.contains('hidden')) return;
    initialPinchDistance = 0;
    isPanning = false;

    // Snap back if zoomed out below 1
    if (photoScale < 1) {
        photoScale = 1;
        photoTranslateX = 0;
        photoTranslateY = 0;
        updatePhotoTransform();
    }
});

async function deleteProgressPhoto(id) {
    if (confirm('Delete this progress photo?')) {
        try {
            const idb = await openPhotoDB();
            const tx = idb.transaction(PHOTO_STORE_NAME, 'readwrite');
            const store = tx.objectStore(PHOTO_STORE_NAME);
            store.delete(id);

            await new Promise((resolve, reject) => {
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });

            await renderProgressPhotos();
        } catch (e) {
            console.error('Error deleting photo:', e);
        }
    }
}

// Swipe support for photo viewer
let touchStartX = 0;
let touchEndX = 0;

document.addEventListener('touchstart', e => {
    if (document.getElementById('modal-photo-viewer').classList.contains('hidden')) return;
    touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

document.addEventListener('touchend', e => {
    if (document.getElementById('modal-photo-viewer').classList.contains('hidden')) return;
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
}, { passive: true });

function handleSwipe() {
    const swipeThreshold = 50;
    const diff = touchStartX - touchEndX;

    if (Math.abs(diff) > swipeThreshold) {
        if (diff > 0) {
            // Swipe left = next photo
            navigatePhoto(1);
        } else {
            // Swipe right = previous photo
            navigatePhoto(-1);
        }
    }
}

// Keyboard support for photo viewer
document.addEventListener('keydown', e => {
    if (document.getElementById('modal-photo-viewer').classList.contains('hidden')) return;

    if (e.key === 'ArrowLeft') navigatePhoto(-1);
    if (e.key === 'ArrowRight') navigatePhoto(1);
    if (e.key === 'Escape') closePhotoViewer();
});

// --- SWIPE NAVIGATION BETWEEN VIEWS ---
const navViews = ['home', 'progress', 'stats']; // Order of views for swiping
let navTouchStartX = 0;
let navTouchStartY = 0;
let currentNavIndex = 0;

function getCurrentViewIndex() {
    if (!document.getElementById('view-home').classList.contains('hidden')) return 0;
    if (!document.getElementById('view-progress').classList.contains('hidden')) return 1;
    if (!document.getElementById('view-stats').classList.contains('hidden')) return 2;
    return -1; // Logger view or unknown
}

document.addEventListener('touchstart', e => {
    // Don't swipe if photo viewer is open or in logger view
    if (!document.getElementById('modal-photo-viewer').classList.contains('hidden')) return;
    if (!document.getElementById('view-log').classList.contains('hidden')) return;
    if (!document.getElementById('modal-workout').classList.contains('hidden')) return;
    if (!document.getElementById('modal-photo-upload').classList.contains('hidden')) return;

    navTouchStartX = e.changedTouches[0].screenX;
    navTouchStartY = e.changedTouches[0].screenY;
}, { passive: true });

document.addEventListener('touchend', e => {
    // Don't swipe if photo viewer is open or in logger view
    if (!document.getElementById('modal-photo-viewer').classList.contains('hidden')) return;
    if (!document.getElementById('view-log').classList.contains('hidden')) return;
    if (!document.getElementById('modal-workout').classList.contains('hidden')) return;
    if (!document.getElementById('modal-photo-upload').classList.contains('hidden')) return;

    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;

    const diffX = navTouchStartX - touchEndX;
    const diffY = navTouchStartY - touchEndY;

    // Only trigger if horizontal swipe is greater than vertical (to avoid conflicts with scrolling)
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 80) {
        const currentIdx = getCurrentViewIndex();
        if (currentIdx === -1) return;

        if (diffX > 0 && currentIdx < navViews.length - 1) {
            // Swipe left = next view
            showView(navViews[currentIdx + 1]);
        } else if (diffX < 0 && currentIdx > 0) {
            // Swipe right = previous view
            showView(navViews[currentIdx - 1]);
        }
    }
}, { passive: true });

window.onload = async () => {
    // Migrate photos from localStorage to IndexedDB on first load
    await migratePhotosToIndexedDB();
    renderHome();
    lucide.createIcons();
};
