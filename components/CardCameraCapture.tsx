'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type CameraState = 'idle' | 'opening' | 'streaming' | 'captured' | 'error';

function getCameraError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'Camera permission was denied. Allow camera access in your browser settings, then try again.';
    }

    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return 'No camera was found on this device.';
    }

    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return 'The camera is already in use or could not be started.';
    }
  }

  return 'The camera could not be opened. Check your browser permissions and try again.';
}

export default function CardCameraCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsVideoReady(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const openCamera = async () => {
    stopCamera();
    setCapturedImage(null);
    setErrorMessage(null);
    setCameraState('opening');

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage('Camera access is not supported by this browser. Try a current browser on a secure connection.');
      setCameraState('error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState('streaming');
    } catch (error) {
      stopCamera();
      setErrorMessage(getCameraError(error));
      setCameraState('error');
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !isVideoReady || video.videoWidth === 0 || video.videoHeight === 0) {
      setErrorMessage('The camera is still loading. Wait a moment and try again.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');

    if (!context) {
      setErrorMessage('The photo could not be captured. Please try again.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCapturedImage(canvas.toDataURL('image/jpeg', 0.9));
    stopCamera();
    setErrorMessage(null);
    setCameraState('captured');
  };

  const clearPhoto = () => {
    stopCamera();
    setCapturedImage(null);
    setErrorMessage(null);
    setCameraState('idle');
  };

  if (cameraState === 'idle') {
    return (
      <button
        type="button"
        onClick={openCamera}
        className="w-full py-3 px-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-400/50 transition-all flex items-center justify-center gap-2 font-medium"
      >
        <span aria-hidden="true">📷</span>
        Photograph Your Cards
      </button>
    );
  }

  return (
    <section className="bg-slate-800/30 backdrop-blur-sm rounded-xl p-4 border border-indigo-500/30 space-y-3" aria-label="Card photo capture">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-indigo-300">Card Photo</h3>
          <p className="text-xs text-slate-500 mt-0.5">For visual reference only. Cards are not detected automatically.</p>
        </div>
        <button
          type="button"
          onClick={clearPhoto}
          className="text-xs text-slate-400 hover:text-white transition-colors"
        >
          Close
        </button>
      </div>

      {(cameraState === 'opening' || cameraState === 'streaming') && (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-lg bg-black aspect-[4/3] border border-slate-700">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              onCanPlay={() => setIsVideoReady(true)}
              className="w-full h-full object-cover"
              aria-label="Camera preview"
            />
            {(cameraState === 'opening' || !isVideoReady) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80 text-slate-300">
                <div className="w-7 h-7 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Opening camera...</span>
              </div>
            )}
          </div>

          {errorMessage && <p className="text-sm text-rose-300" role="alert">{errorMessage}</p>}

          <button
            type="button"
            onClick={capturePhoto}
            disabled={!isVideoReady}
            className="w-full py-3 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold hover:from-indigo-400 hover:to-purple-400 transition-all disabled:opacity-50 disabled:cursor-wait"
          >
            Capture Photo
          </button>
        </div>
      )}

      {cameraState === 'captured' && capturedImage && (
        <div className="space-y-3">
          {/* This data URL remains in component memory and is never uploaded. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={capturedImage}
            alt="Captured cards for review"
            className="w-full aspect-[4/3] object-contain rounded-lg bg-black border border-slate-700"
          />
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={openCamera}
              className="py-2.5 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-medium hover:bg-indigo-500/30 transition-colors"
            >
              Retake
            </button>
            <button
              type="button"
              onClick={clearPhoto}
              className="py-2.5 rounded-lg bg-slate-700/60 border border-slate-600/50 text-slate-300 font-medium hover:bg-slate-700 transition-colors"
            >
              Clear Photo
            </button>
          </div>
        </div>
      )}

      {cameraState === 'error' && (
        <div className="rounded-lg border border-rose-700/50 bg-rose-900/20 p-4 space-y-3" role="alert">
          <p className="text-sm text-rose-200">{errorMessage}</p>
          <button
            type="button"
            onClick={openCamera}
            className="w-full py-2.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-200 font-medium hover:bg-rose-500/30 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}
    </section>
  );
}
