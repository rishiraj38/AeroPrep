import { RefObject, useEffect, useState } from 'react';

// Watches the candidate's own webcam, in their browser, to nudge them the way a human
// interviewer would notice: stepped away, looking off to the side, someone else in view,
// or switched to another tab. No video or measurement ever leaves the device.

// Must match the installed @mediapipe/tasks-vision version (pinned in package.json)
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const CHECK_EVERY_MS = 700;
const AWAY_AFTER_MS = 4000;       // looking away, or out of frame, this long before a nudge
const EXTRA_FACE_AFTER_MS = 2000;
const NUDGE_STAYS_MS = 4000;      // how long a nudge stays up once the cause is gone

// Face mesh landmark indices: nose tip and the two edges of the face
const NOSE = 1, FACE_LEFT = 234, FACE_RIGHT = 454;

const NUDGES = {
  noFace: 'We can\'t see you. Stay in front of the camera, as you would in a real interview.',
  away: 'You\'ve been looking away from the screen for a while. Keep your eyes on the interviewer.',
  extraFace: 'Someone else seems to be in view. Interviews are one-on-one.',
  leftTab: 'You switched away from the interview. In a real interview that gets noticed.',
};

function isLookingAway(result: any): boolean {
  const face = result.faceLandmarks[0];
  // Head turned: the nose sits far from the middle of the face
  const turn = (face[NOSE].x - face[FACE_LEFT].x) / (face[FACE_RIGHT].x - face[FACE_LEFT].x);
  if (turn < 0.3 || turn > 0.7) return true;

  // Eyes turned sideways while the head stays still (reading from a second screen)
  const shapes: Record<string, number> = {};
  for (const shape of result.faceBlendshapes?.[0]?.categories || []) shapes[shape.categoryName] = shape.score;
  const left = Math.min(shapes.eyeLookOutLeft || 0, shapes.eyeLookInRight || 0);
  const right = Math.min(shapes.eyeLookInLeft || 0, shapes.eyeLookOutRight || 0);
  return left > 0.6 || right > 0.6;
}

/**
 * Returns a short message to show the candidate, or null when all is well.
 * Does nothing unless `active` is true and the video element is playing a camera.
 */
export function useAttentionMonitor(videoRef: RefObject<HTMLVideoElement | null>, active: boolean): string | null {
  const [nudge, setNudge] = useState<string | null>(null);

  // Leaving the tab needs no camera
  useEffect(() => {
    if (!active) return;
    let clear: NodeJS.Timeout;
    const onVisibility = () => {
      if (!document.hidden) return;
      setNudge(NUDGES.leftTab);
      clearTimeout(clear);
      clear = setTimeout(() => setNudge(current => (current === NUDGES.leftTab ? null : current)), NUDGE_STAYS_MS * 2);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(clear);
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: NodeJS.Timeout;
    let landmarker: any = null;

    const since: Record<'noFace' | 'away' | 'extraFace', number | null> = { noFace: null, away: null, extraFace: null };
    let lastCause = 0;

    const check = () => {
      const video = videoRef.current;
      const stream = video?.srcObject as MediaStream | null;
      const cameraOn = !!stream?.getVideoTracks().some(track => track.enabled && track.readyState === 'live');
      if (!video || !cameraOn || video.readyState < 2) {
        since.noFace = since.away = since.extraFace = null;
        return;
      }

      const now = Date.now();
      const result = landmarker.detectForVideo(video, performance.now());
      const faces = result.faceLandmarks.length;
      const mark = (key: keyof typeof since, on: boolean) => { since[key] = on ? (since[key] ?? now) : null; };
      mark('noFace', faces === 0);
      mark('extraFace', faces > 1);
      mark('away', faces === 1 && isLookingAway(result));

      const cause =
        since.extraFace && now - since.extraFace >= EXTRA_FACE_AFTER_MS ? NUDGES.extraFace :
        since.noFace && now - since.noFace >= AWAY_AFTER_MS ? NUDGES.noFace :
        since.away && now - since.away >= AWAY_AFTER_MS ? NUDGES.away : null;

      if (cause) {
        lastCause = now;
        setNudge(cause);
      } else if (now - lastCause > NUDGE_STAYS_MS) {
        setNudge(current => (current === NUDGES.leftTab ? current : null));
      }
    };

    (async () => {
      try {
        const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
        const files = await FilesetResolver.forVisionTasks(WASM_URL);
        landmarker = await FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODEL_URL },
          runningMode: 'VIDEO',
          numFaces: 2,
          outputFaceBlendshapes: true,
        });
        if (stopped) { landmarker.close(); return; }
        timer = setInterval(() => {
          try { check(); } catch (error) { console.warn('[Attention] check failed', error); }
        }, CHECK_EVERY_MS);
      } catch (error) {
        // The interview works without it (old device, blocked CDN, no WebGL)
        console.warn('[Attention] monitor unavailable', error);
      }
    })();

    return () => {
      stopped = true;
      clearInterval(timer);
      try { landmarker?.close(); } catch (_) {}
      setNudge(null);
    };
  }, [active, videoRef]);

  return nudge;
}
