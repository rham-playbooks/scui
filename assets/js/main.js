let currentScenario = null;
let currentEndedHandler = null;
let currentErrorHandler = null;
let audioUnlocked = false;
let apiAudio = new Audio();
let queuedAudioSrc = null;
let audioCtx = null;
let currentBufferSource = null;
let queuedLoop = false;

// ---------------------------------------------------------------------------
// Audio helpers
// ---------------------------------------------------------------------------

async function playViaWebAudio(url, opts = {}) {
    const { loop = false, loopStart = 0, loopEnd = null } = opts;
    if (!audioCtx) return false;
    try {
        const resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok) return false;
        const buf = await resp.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(buf);
        if (currentBufferSource) {
            try { currentBufferSource.stop(0); } catch (_) {}
            currentBufferSource.disconnect();
        }
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);
        source.loop = !!loop;
        if (loop) {
            source.loopStart = Math.max(0, loopStart || 0);
            source.loopEnd = loopEnd && loopEnd > source.loopStart ? loopEnd : audioBuffer.duration;
        }
        source.start(0);
        currentBufferSource = source;
        return true;
    } catch (_) {
        return false;
    }
}

function getScenarioAudioPath(scenario, stage) {
    const safe = (scenario || '').replace(/[^a-z0-9_\-]/gi, '');
    const st = (stage || '').replace(/[^a-z0-9_\-]/gi, '');
    return `assets/audio/${safe}/${st}/${st}.mp3`;
}

function playHomeAudio() {
    const url = 'assets/audio/sc_home_background.mp3';
    const start = async () => {
        if (audioCtx) {
            const ok = await playViaWebAudio(url, { loop: true });
            if (ok) return;
        }
        try {
            apiAudio.src = url;
            apiAudio.loop = true;
            await apiAudio.play();
        } catch (_) {}
    };
    if (audioUnlocked) {
        start();
    } else {
        queuedAudioSrc = url;
        queuedLoop = true;
    }
}

function stopScenarioAudio() {
    try { apiAudio.pause(); } catch (_) {}
    apiAudio.loop = false;
    if (currentBufferSource) {
        try { currentBufferSource.stop(0); } catch (_) {}
        try { currentBufferSource.disconnect(); } catch (_) {}
        currentBufferSource = null;
    }
}

async function playScenarioAudio(scenario, stage, loop = false) {
    const url = getScenarioAudioPath(scenario, stage);
    const tryPlay = async () => {
        if (loop) {
            try {
                apiAudio.src = url;
                apiAudio.loop = true;
                await apiAudio.play();
                return true;
            } catch (_) { return false; }
        } else {
            if (audioCtx) {
                const ok = await playViaWebAudio(url);
                if (ok) return true;
            }
            try {
                apiAudio.src = url;
                apiAudio.loop = false;
                await apiAudio.play();
                return true;
            } catch (_) { return false; }
        }
    };
    if (audioUnlocked) {
        return await tryPlay();
    } else {
        queuedAudioSrc = url;
        queuedLoop = !!loop;
        return false;
    }
}

// ---------------------------------------------------------------------------
// Video crossfade (dual-video element swap)
// ---------------------------------------------------------------------------

const primary = document.getElementById('backgroundVideo');
const primarySrc = document.getElementById('videoSource');
const secondary = document.getElementById('backgroundVideo2');
const secondarySrc = document.getElementById('videoSource2');

function crossfadeTo(src, loop, onEnded) {
    const from = primary.style.opacity === '0' ? secondary : primary;
    const to = from === primary ? secondary : primary;
    const toSrc = to === primary ? primarySrc : secondarySrc;

    if (currentEndedHandler) {
        from.removeEventListener('ended', currentEndedHandler);
        to.removeEventListener('ended', currentEndedHandler);
        currentEndedHandler = null;
    }
    if (currentErrorHandler) {
        from.removeEventListener('error', currentErrorHandler);
        to.removeEventListener('error', currentErrorHandler);
        currentErrorHandler = null;
    }

    to.loop = !!loop;
    toSrc.src = src;
    to.load();
    const onReady = () => {
        to.removeEventListener('loadeddata', onReady);
        to.play().catch(() => {});
        gsap.to(to, { duration: 0.35, opacity: 1, ease: 'power1.out' });
        gsap.to(from, { duration: 0.35, opacity: 0, ease: 'power1.out' });
        if (typeof onEnded === 'function') {
            currentEndedHandler = onEnded;
            to.addEventListener('ended', currentEndedHandler, { once: true });
        }
    };
    to.addEventListener('loadeddata', onReady, { once: true });
}

// ---------------------------------------------------------------------------
// Scenario playback (driven entirely by SSE events from the podium)
// ---------------------------------------------------------------------------

function startScenario(scenarioKey) {
    currentScenario = scenarioKey;
    const base = `assets/video/scenarios/${scenarioKey}`;
    stopScenarioAudio();
    playScenarioAudio(scenarioKey, 'initiation');
    crossfadeTo(`${base}/initiation/initiation.mp4`, false, () => {
        playScenarioAudio(currentScenario, 'runtime');
        crossfadeTo(`${base}/runtime/runtime.mp4`, true);
    });
}

function resolveScenario(scenarioKey) {
    const base = `assets/video/scenarios/${scenarioKey}`;
    stopScenarioAudio();
    playScenarioAudio(scenarioKey, 'resolved');
    crossfadeTo(`${base}/resolved/resolved.mp4`, false, () => {
        currentScenario = null;
        crossfadeTo('assets/video/home.mp4', true);
        playHomeAudio();
    });
}

function goHome() {
    stopScenarioAudio();
    currentScenario = null;
    crossfadeTo('assets/video/home.mp4', true);
    playHomeAudio();
}

// ---------------------------------------------------------------------------
// SSE: receive commands from the podium / API
// ---------------------------------------------------------------------------

(function subscribeUiEvents() {
    try {
        const evtSource = new EventSource('/api/controller/ui/events');
        evtSource.addEventListener('home', function (event) {
            let scenario;
            try {
                scenario = event && event.data ? JSON.parse(event.data).scenario : undefined;
            } catch (_) {
                scenario = undefined;
            }

            const raw = scenario || '';

            if (/_init$/i.test(raw)) {
                startScenario(raw.replace(/_init$/i, ''));
                return;
            }

            if (/_resolved$/i.test(raw)) {
                resolveScenario(raw.replace(/_resolved$/i, ''));
                return;
            }

            goHome();
        });
        evtSource.onerror = function () {};
    } catch (_) {}
})();

// ---------------------------------------------------------------------------
// Audio unlock (user gesture required by browsers)
// ---------------------------------------------------------------------------

window.addEventListener('pointerdown', function unlockOnce() {
    audioUnlocked = true;
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
        } catch (_) {}
    }
    if (queuedAudioSrc) {
        (async () => {
            if (queuedLoop) {
                const ok = audioCtx ? await playViaWebAudio(queuedAudioSrc, { loop: true }) : false;
                if (!ok) {
                    try { apiAudio.src = queuedAudioSrc; apiAudio.loop = true; await apiAudio.play(); } catch (_) {}
                }
            } else {
                const ok = audioCtx ? await playViaWebAudio(queuedAudioSrc) : false;
                if (!ok) { apiAudio.src = queuedAudioSrc; apiAudio.loop = false; apiAudio.play().catch(() => {}); }
            }
            queuedAudioSrc = null;
            queuedLoop = false;
        })();
    }
    window.removeEventListener('pointerdown', unlockOnce, { capture: true });
}, { capture: true, once: true });

document.addEventListener('DOMContentLoaded', function () {
    try { playHomeAudio(); } catch (_) {}
    const btn = document.getElementById('enable-audio');
    if (btn) {
        btn.addEventListener('click', function () {
            const overlay = document.getElementById('audio-consent');
            if (overlay) overlay.style.display = 'none';
            audioUnlocked = true;
            if (!audioCtx) {
                try {
                    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
                } catch (_) {}
            }
            if (queuedAudioSrc) {
                (async () => {
                    if (queuedLoop) {
                        try { apiAudio.src = queuedAudioSrc; apiAudio.loop = true; await apiAudio.play(); } catch (_) {}
                    } else {
                        const ok = audioCtx ? await playViaWebAudio(queuedAudioSrc) : false;
                        if (!ok) { apiAudio.src = queuedAudioSrc; apiAudio.loop = false; apiAudio.play().catch(() => {}); }
                    }
                    queuedAudioSrc = null;
                    queuedLoop = false;
                })();
            } else {
                playHomeAudio();
            }
        }, { once: true });
    }
});
