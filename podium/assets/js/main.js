let autoPlayInterval;
let currentVideoIndex = 0;
let autoPlayActive = false;
const HOME_VIDEO_SRC = 'assets/video/home.mp4';

const SCENARIO_JOB_TEMPLATES = {
    engine_failure_init: 57,
    solar_storm_init: 0, // TODO: set after make aap-apply
};

function postScenario(scenario) {
    const jtId = SCENARIO_JOB_TEMPLATES[scenario];

    if (jtId) {
        const launchUrl = `/api/controller/aap/launch/${jtId}/`;
        console.log('[podium] Launching AAP job template', jtId, 'for', scenario);

        fetch(launchUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        }).then(res => {
            if (!res.ok) {
                console.error('AAP launch failed:', res.status, res.statusText);
            } else {
                console.log('AAP job launched for', scenario);
            }
        }).catch(err => {
            console.error('AAP launch error:', err);
        });
    } else {
        const url = '/api/controller/ui/home';
        console.log('[podium] Posting scenario:', scenario);

        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scenario }),
        }).then(res => {
            if (!res.ok) {
                console.error('Scenario POST failed:', res.status, res.statusText);
            } else {
                console.log('Scenario POST succeeded:', scenario);
            }
        }).catch(err => {
            console.error('Scenario POST error:', err);
        });
    }
}

function setFullscreen(isEnabled) {
    document.body.classList.toggle('fullscreen', !!isEnabled);
}

document.addEventListener('DOMContentLoaded', function () {
    setFullscreen(true);
});

document.querySelectorAll('.change-video').forEach((button, index) => {
    button.addEventListener('click', function (evt) {
        evt.preventDefault();
        setFullscreen(false);

        const videoElement = document.getElementById('backgroundVideo');
        const videoSource = document.getElementById('videoSource');
        const newVideo = this.getAttribute('data-video');

        stopAutoPlay();

        const scenario = (this.getAttribute('data-scenario') || '').trim();
        if (scenario) postScenario(scenario);

        document.querySelectorAll('.change-video').forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');

        gsap.to(videoElement, {
            duration: 0.6,
            opacity: 0,
            filter: 'blur(10px)',
            scale: 1.1,
            onComplete: () => {
                videoSource.src = newVideo;
                videoElement.load();
                videoElement.play();
                currentVideoIndex = index;

                gsap.to(videoElement, {
                    duration: 0.6,
                    opacity: 1,
                    filter: 'blur(0px)',
                    scale: 1
                });
            }
        });
    });
});

function stopAutoPlay() {
    clearTimeout(autoPlayInterval);
    autoPlayActive = false;
}

document.querySelector('.auto-video').addEventListener('click', function () {
    stopAutoPlay();
    document.querySelectorAll('.change-video').forEach(btn => btn.classList.remove('active'));
    setFullscreen(true);

    const videoElement = document.getElementById('backgroundVideo');
    const videoSource = document.getElementById('videoSource');

    gsap.to(videoElement, {
        duration: 0.6,
        opacity: 0,
        filter: 'blur(10px)',
        scale: 1.1,
        onComplete: () => {
            videoSource.src = HOME_VIDEO_SRC;
            videoElement.load();
            videoElement.play();
            currentVideoIndex = -1;

            gsap.to(videoElement, {
                duration: 0.6,
                opacity: 1,
                filter: 'blur(0px)',
                scale: 1
            });
        }
    });
});
