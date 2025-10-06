let autoPlayInterval; // Variable to store the interval
let currentVideoIndex = 0; // Track the current video index
let autoPlayActive = false; // Track if auto-play is active
let currentScenario = null; // Current active scenario key (e.g., 'shields_down')
let currentEndedHandler = null; // Track current 'ended' handler to detach cleanly
let currentErrorHandler = null; // Track current 'error' handler to detach cleanly
let audioUnlocked = false; // Set to true after any user gesture enabling audio playback
let apiAudio = new Audio(); // Reusable audio element for API-driven sounds
let queuedAudioSrc = null; // If autoplay blocks, queue to play on first gesture
let audioCtx = null; // Web Audio API context (created after user gesture)
let currentBufferSource = null; // Track current buffer source to stop if needed
let queuedLoop = false; // If queued audio should loop after unlock

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

async function pickExistingAsset(paths) {
    for (const p of paths) {
        try {
            const res = await fetch(p, { method: 'HEAD', cache: 'no-store' });
            if (res.ok) return p;
        } catch (_) {}
    }
    return null;
}

function getScenarioAudioPath(scenario, stage) {
    const safe = (scenario || '').replace(/[^a-z0-9_\-]/gi, '');
    const st = (stage || '').replace(/[^a-z0-9_\-]/gi, '');
    return `assets/audio/${safe}/${st}/${st}.mp3`;
}

function playHomeAudio() {
    const url = 'assets/audio/sc_home_background.mp3';
    const start = async () => {
        // Prefer gapless loop via Web Audio; fallback to HTMLAudio loop
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
            } catch (_) {
                return false;
            }
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
            } catch (_) {
                return false;
            }
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

// List of video durations (in milliseconds)
const videoDurations = [
    15000, // Home video duration in ms (15 seconds)
    30000, // Applications video duration in ms (30 seconds)
    16000, // Solutions video duration in ms (16 seconds)
    25000, // Hybrid Cloud video duration in ms (25 seconds)
    24000, // Ecosystem video duration in ms (24 seconds)
    15000  // Security video duration in ms (15 seconds)
];

// Manual video button click handler
const primary = document.getElementById('backgroundVideo');
const primarySrc = document.getElementById('videoSource');
const secondary = document.getElementById('backgroundVideo2');
const secondarySrc = document.getElementById('videoSource2');

function crossfadeTo(src, loop, onEnded) {
    const from = primary.style.opacity === '0' ? secondary : primary;
    const fromSrc = from === primary ? primarySrc : secondarySrc;
    const to = from === primary ? secondary : primary;
    const toSrc = to === primary ? primarySrc : secondarySrc;

    // Clean up handlers on both
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

document.querySelectorAll('.change-video').forEach((button, index) => {
    button.addEventListener('click', function () {
        const videoElement = document.getElementById('backgroundVideo');
        const videoSource = document.getElementById('videoSource');
        const newVideo = this.getAttribute('data-video');
        const jtId = this.getAttribute('data-aap-jt');
        const audioScenario = this.getAttribute('data-audio');
        const scenarioKey = this.getAttribute('data-scenario');

        // Stop auto-play if active
        stopAutoPlay();

        // Unlock audio on first user interaction
        audioUnlocked = true;
        // Stop any previous scenario audio
        stopScenarioAudio();

        // Remove 'active' class from all buttons
        document.querySelectorAll('.change-video').forEach(btn => btn.classList.remove('active'));

        // Add 'active' class to the clicked button
        this.classList.add('active');

        const playWithTransition = (src, loop, onEnded) => {
            crossfadeTo(src, loop, onEnded);
        };

        // Smooth transition helper used by programmatic (API) flows
        const playWithSmoothTransition = (src, loop, onEnded) => {
            if (currentEndedHandler) {
                videoElement.removeEventListener('ended', currentEndedHandler);
                currentEndedHandler = null;
            }
            if (currentErrorHandler) {
                videoElement.removeEventListener('error', currentErrorHandler);
                currentErrorHandler = null;
            }
            videoElement.loop = !!loop;
            gsap.to(videoElement, {
                duration: 0.4,
                opacity: 0,
                filter: 'blur(6px)',
                onComplete: () => {
                    videoSource.src = src;
                    videoElement.load();
                    const onReady = () => {
                        videoElement.removeEventListener('loadeddata', onReady);
                        videoElement.play().catch(() => {});
                        if (typeof onEnded === 'function') {
                            currentEndedHandler = onEnded;
                            videoElement.addEventListener('ended', currentEndedHandler, { once: true });
                        }
                        gsap.to(videoElement, { duration: 0.4, opacity: 1, filter: 'blur(0px)' });
                    };
                    videoElement.addEventListener('loadeddata', onReady, { once: true });
                }
            });
        };

        // Build candidate file paths for scenario stage
        const buildScenarioCandidates = (scenario, stage) => {
            const base = `assets/video/scenarios/${scenario}`;
            const maybeSingular = scenario.replace(/s$/, '');
            return [
                `${base}/${stage}/${scenario}_${stage}.mp4`,
                `${base}/${stage}/${stage}.mp4`,
                `${base}/${stage}.mp4`,
                `${base}/${stage}/${maybeSingular}_${stage}.mp4`
            ];
        };

        // Play scenario stage trying multiple candidate paths, falling back gracefully
        const playScenarioStage = (scenario, stage, loop, onEnded) => {
            const candidates = buildScenarioCandidates(scenario, stage);
            let idx = 0;

            const tryPlay = () => {
                if (idx >= candidates.length) {
                    console.error(`No playable video found for scenario ${scenario} stage ${stage}`);
                    return; // Give up silently; UI remains as is
                }
                const target = candidates[idx++];
                const prevEnded = currentEndedHandler;
                const prevError = currentErrorHandler;
                const restoreHandlers = () => {
                    if (prevEnded) videoElement.addEventListener('ended', prevEnded, { once: true });
                    if (prevError) videoElement.addEventListener('error', prevError);
                };
                // Temporarily set an error handler to try next candidate
                if (currentErrorHandler) {
                    videoElement.removeEventListener('error', currentErrorHandler);
                }
                currentErrorHandler = () => {
                    // remove our temporary handlers to avoid stacking
                    if (currentEndedHandler) {
                        videoElement.removeEventListener('ended', currentEndedHandler);
                        currentEndedHandler = null;
                    }
                    if (currentErrorHandler) {
                        videoElement.removeEventListener('error', currentErrorHandler);
                        currentErrorHandler = null;
                    }
                    // Try next candidate
                    tryPlay();
                };
                videoElement.addEventListener('error', currentErrorHandler, { once: true });

                // Now play with transition using this candidate
                playWithTransition(target, loop, () => {
                    // Clear our error handler on success; then call downstream onEnded
                    if (currentErrorHandler) {
                        videoElement.removeEventListener('error', currentErrorHandler);
                        currentErrorHandler = null;
                    }
                    if (typeof onEnded === 'function') onEnded();
                });
            };

            tryPlay();
        };

        // Scenario flow: initiation -> runtime(loop)
        if (scenarioKey) {
            currentScenario = scenarioKey;
            const base = `assets/video/scenarios/${scenarioKey}`;
            // Play initiation audio in new structured path
            playScenarioAudio(currentScenario, 'initiation');
            // Play fixed filenames in each stage directory
            playWithTransition(`${base}/initiation/initiation.mp4`, false, () => {
                // Start runtime video and play runtime audio once (no loop)
                playScenarioAudio(currentScenario, 'runtime');
                playWithTransition(`${base}/runtime/runtime.mp4`, true);
            });
        } else {
            // Default behavior: play provided video
            playWithTransition(newVideo, true);
    // If switching away from scenarios to a generic non-scenario video, ensure home audio plays
    if (!scenarioKey) {
        stopScenarioAudio();
        playHomeAudio();
    }
        }

        // Update currentVideoIndex to match clicked button
        currentVideoIndex = index;

        // If the button has an AAP Job Template ID, launch it
        if (jtId) {
            fetch(`/api/controller/aap/launch/${encodeURIComponent(jtId)}/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            }).then(async (res) => {
                if (!res.ok) {
                    const text = await res.text();
                    console.error('AAP launch failed', res.status, text);
                    return;
                }
                console.log('AAP launch started');
            }).catch(err => {
                console.error('AAP launch error', err);
            });
        }

        // data-audio no longer used; audio is derived from scenario and stage
    });
});

// Function to start auto-playing videos based on timings
function startAutoPlay() {
    const buttons = document.querySelectorAll('.change-video');
    const videoElement = document.getElementById('backgroundVideo');
    const videoSource = document.getElementById('videoSource');

    // Reset to the Home video
    currentVideoIndex = 0; // Start from the Home button
    buttons.forEach(btn => btn.classList.remove('active')); // Clear all active classes
    const homeButton = buttons[currentVideoIndex];
    homeButton.classList.add('active'); // Set active to Home
    const homeVideo = homeButton.getAttribute('data-video');

    // Transition to the Home video
    gsap.to(videoElement, {
        duration: 0.6,
        opacity: 0,
        filter: 'blur(10px)',
        scale: 1.1,
        onComplete: () => {
            videoSource.src = homeVideo; // Update video source
            videoElement.load(); // Load Home video
            videoElement.play(); // Play Home video
            // Start home looped background audio
            playHomeAudio();

            // GSAP fade-in and scale back
            gsap.to(videoElement, {
                duration: 0.6,
                opacity: 1,
                filter: 'blur(0px)',
                scale: 1
            });

            // Start cycling through videos based on durations
            autoPlayInterval = setTimeout(playNextVideo, videoDurations[currentVideoIndex]);
        }
    });

    autoPlayActive = true; // Mark auto-play as active
}

// Function to play the next video in the list
function playNextVideo() {
    const buttons = document.querySelectorAll('.change-video');
    const videoElement = document.getElementById('backgroundVideo');
    const videoSource = document.getElementById('videoSource');

    // Remove 'active' class from all buttons
    buttons.forEach(btn => btn.classList.remove('active'));

    // Move to the next video in the list
    currentVideoIndex = (currentVideoIndex + 1) % buttons.length;

    // Set the active button and video
    const currentButton = buttons[currentVideoIndex];
    currentButton.classList.add('active');
    const newVideo = currentButton.getAttribute('data-video');

    // Transition to the next video
    gsap.to(videoElement, {
        duration: 0.6,
        opacity: 0,
        filter: 'blur(10px)',
        scale: 1.1,
        onComplete: () => {
            videoSource.src = newVideo; // Update video source
            videoElement.load(); // Load new video
            videoElement.play(); // Play new video

            // GSAP fade-in and scale back
            gsap.to(videoElement, {
                duration: 0.6,
                opacity: 1,
                filter: 'blur(0px)',
                scale: 1
            });

            // Set timeout for the next video based on its duration
            autoPlayInterval = setTimeout(playNextVideo, videoDurations[currentVideoIndex]);
        }
    });
}

// Function to stop auto-playing videos
function stopAutoPlay() {
    clearTimeout(autoPlayInterval); // Clear the current timeout
    autoPlayActive = false; // Mark auto-play as inactive
}

// Attach event listener to the auto-video button
document.querySelector('.auto-video').addEventListener('click', function () {
    if (autoPlayActive) {
        stopAutoPlay(); // Stop auto-play if it's already running
    } else {
        startAutoPlay(); // Start auto-play
    }
});

// UI live control: listen for Server-Sent Events and return to Home on demand
(function subscribeUiEvents() {
    try {
        const evtSource = new EventSource('/api/controller/ui/events');
        evtSource.addEventListener('home', function (event) {
            // same behavior as beginning of startAutoPlay but without scheduling autoplay
            const buttons = document.querySelectorAll('.change-video');
            const videoElement = document.getElementById('backgroundVideo');
            const videoSource = document.getElementById('videoSource');
            const audio = new Audio();
            let scenario;
            try {
                scenario = event && event.data ? JSON.parse(event.data).scenario : undefined;
            } catch (e) {
                scenario = undefined;
            }

            stopAutoPlay();
            const homeVideo = 'assets/video/home.mp4';
            buttons.forEach(btn => btn.classList.remove('active'));

            const playWithTransition = (src, loop, onEnded) => {
                crossfadeTo(src, loop, onEnded);
            };

            const rawScenario = scenario || currentScenario;

            // Handle explicit start requests (e.g., engine_failure_init)
            const scenarioToStart = rawScenario && /_init$/i.test(rawScenario)
                ? rawScenario.replace(/_init$/i, '')
                : null;

            if (scenarioToStart) {
                currentScenario = scenarioToStart;
                // Visual button state (if present)
                // Prefer to run the exact same logic as a real button click
                const btn = document.querySelector(`.change-video[data-scenario="${scenarioToStart}"]`);
                if (btn) {
                    btn.click();
                    return;
                }
                // Fallback if button not present
                const base = `assets/video/scenarios/${scenarioToStart}`;
                // Play initiation audio for API-triggered start
                playScenarioAudio(currentScenario, 'initiation');
                playWithTransition(`${base}/initiation/initiation.mp4`, false, () => {
                    // Start runtime and play runtime audio once (no loop)
                    playScenarioAudio(currentScenario, 'runtime');
                    playWithTransition(`${base}/runtime/runtime.mp4`, true);
                });
                return;
            }

            // Handle resolved requests (e.g., engine_failure_resolved)
            const scenarioToResolve = rawScenario && /_resolved$/i.test(rawScenario)
                ? rawScenario.replace(/_resolved$/i, '')
                : null;

            if (scenarioToResolve) {
                const base = `assets/video/scenarios/${scenarioToResolve}`;
                // Stop any runtime loop audio before resolved
                stopScenarioAudio();
                // Play resolved audio in new structured path
                playScenarioAudio(scenarioToResolve, 'resolved');
                playWithTransition(`${base}/resolved/resolved.mp4`, false, () => {
                    currentScenario = null;
                    playWithTransition(homeVideo, true);
                    // Start home looped background audio
                    playHomeAudio();
                });
                return;
            }

            // Default: go home (stop any looped audio)
            stopScenarioAudio();
            playWithTransition(homeVideo, true);
            // Start home looped background audio
            playHomeAudio();
        });
        evtSource.onerror = function () {
            // silently ignore errors; reconnect automatically
        };
    } catch (e) {
        // ignore if EventSource unsupported
    }
})();

// One-time user gesture to unlock audio for API-driven playback
window.addEventListener('pointerdown', function unlockOnce() {
    audioUnlocked = true;
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
        } catch (_) {}
    }
    if (queuedAudioSrc) {
        // Try Web Audio first, then HTMLAudio fallback
        (async () => {
            if (queuedLoop) {
                // Prefer gapless loop via Web Audio if available
                const ok = audioCtx ? await playViaWebAudio(queuedAudioSrc, { loop: true }) : false;
                if (!ok) {
                    try {
                        apiAudio.src = queuedAudioSrc;
                        apiAudio.loop = true;
                        await apiAudio.play();
                    } catch (_) {}
                }
            } else {
                const ok = audioCtx ? await playViaWebAudio(queuedAudioSrc) : false;
                if (!ok) {
                    apiAudio.src = queuedAudioSrc;
                    apiAudio.loop = false;
                    apiAudio.play().catch(() => {});
                }
            }
        })();
        queuedAudioSrc = null;
        queuedLoop = false;
    }
    window.removeEventListener('pointerdown', unlockOnce, { capture: true });
}, { capture: true, once: true });

// Queue or start home background audio on initial load
document.addEventListener('DOMContentLoaded', function () {
    try { playHomeAudio(); } catch (_) {}
    // Bind Enable Sound overlay if present
    const btn = document.getElementById('enable-audio');
    if (btn) {
        btn.addEventListener('click', function () {
            // reuse unlock logic
            const overlay = document.getElementById('audio-consent');
            if (overlay) overlay.style.display = 'none';
            // Trigger the same flow as pointerdown unlock
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
                        try {
                            apiAudio.src = queuedAudioSrc;
                            apiAudio.loop = true;
                            await apiAudio.play();
                        } catch (_) {}
                    } else {
                        const ok = audioCtx ? await playViaWebAudio(queuedAudioSrc) : false;
                        if (!ok) {
                            apiAudio.src = queuedAudioSrc;
                            apiAudio.loop = false;
                            apiAudio.play().catch(() => {});
                        }
                    }
                    queuedAudioSrc = null;
                    queuedLoop = false;
                })();
            } else {
                // Start home background immediately if nothing queued
                playHomeAudio();
            }
        }, { once: true });
    }
});
