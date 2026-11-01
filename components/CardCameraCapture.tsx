'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Card } from '@/lib/types';
import CardPhotoRecognition from '@/components/CardPhotoRecognition';

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

interface Props {
  active?: boolean;
  onUseCards: (cards: Card[]) => void;
  onActiveChange?: (active: boolean) => void;
  onManualEntry?: () => void;
}

export default function CardCameraCapture({ active = true, onUseCards, onActiveChange, onManualEntry }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef(0);
  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    cameraRequestRef.current += 1;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsVideoReady(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  useEffect(() => {
    if (active) return;
    cameraRequestRef.current += 1;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [active]);

  useEffect(() => {
    return () => {
      if (capturedImage?.startsWith('blob:')) URL.revokeObjectURL(capturedImage);
    };
  }, [capturedImage]);

  const uploadPhoto = (file: File | undefined) => {
    if (!file) return;

    onActiveChange?.(true);
    stopCamera();
    setCapturedImage(null);
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please choose an image from your photo library.');
      setCameraState('error');
      return;
    }

    setCapturedImage(URL.createObjectURL(file));
    setErrorMessage(null);
    setCameraState('captured');
  };

  const uploadControl = (
    <label className={`relative cursor-pointer rounded-xl px-5 py-3.5 text-center font-semibold transition-colors focus-within:ring-2 focus-within:ring-indigo-400 ${cameraState === 'idle' ? 'block w-full bg-amber-400 text-slate-950 hover:bg-amber-300' : 'text-sm text-indigo-300 hover:bg-slate-800'}`}>
      {cameraState === 'idle' ? 'Upload a photo' : 'Choose another photo'}
      <input
        type="file"
        accept="image/*"
        aria-label="Upload photo from library"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        onChange={(event) => {
          uploadPhoto(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </label>
  );

  const openCamera = async () => {
    onActiveChange?.(true);
    stopCamera();
    const requestId = cameraRequestRef.current;
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

      if (requestId !== cameraRequestRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      if (requestId === cameraRequestRef.current) setCameraState('streaming');
    } catch (error) {
      if (requestId !== cameraRequestRef.current) return;
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
    onActiveChange?.(false);
  };

  if (cameraState === 'idle') {
    return (
      <div className="rounded-3xl border border-slate-700/60 bg-slate-900/80 p-6 text-center sm:p-8">
        <svg aria-hidden="true" viewBox="0 0 100 90" className="mx-auto mb-5 h-24 w-28 text-indigo-300" fill="none">
          <rect x="15" y="17" width="45" height="61" rx="7" transform="rotate(-18 15 17)" fill="#1e293b" stroke="currentColor" />
          <rect x="43" y="8" width="45" height="65" rx="7" transform="rotate(14 43 8)" fill="#f8fafc" />
          <path d="M65 29c-7-9-15 0-8 7l8 8 8-8c7-7-1-16-8-7Z" fill="#e11d48" />
        </svg>
        <h2 className="text-xl font-semibold text-white">Start with your cards</h2>
        <p className="mx-auto mt-2 mb-6 max-w-xs text-sm leading-relaxed text-slate-400">Upload a photo of your hand. We’ll read the cards and help you arrange them.</p>
        {uploadControl}
        <button type="button" onClick={openCamera} className="mt-3 w-full rounded-xl border border-slate-600 py-3.5 font-medium text-slate-200 transition-colors hover:bg-slate-800">Take a photo</button>
        <p className="mt-5 text-xs text-slate-500">9 cards, or 10 if you need a discard. Photos stay on your device.</p>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-700/50 bg-slate-900/70 p-4 sm:p-5 space-y-4" aria-label="Read your cards">
      {cameraState !== 'captured' && <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Show us your hand</h3>
          <p className="text-sm text-slate-400 mt-1">Keep every rank and suit in view.</p>
        </div>
        <button
          type="button"
          onClick={clearPhoto}
          className="text-xs text-slate-400 hover:text-white transition-colors"
        >
          Back
        </button>
      </div>}

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
            Use this photo
          </button>
        </div>
      )}

      {active && cameraState === 'captured' && capturedImage && (
        <div className="space-y-3">
          <CardPhotoRecognition key={capturedImage} source={capturedImage} onUseCards={onUseCards}
            onManualEntry={onManualEntry ? () => { clearPhoto(); onManualEntry(); } : undefined}
            onImageError={() => {
              setCapturedImage(null);
              setErrorMessage('This photo could not be opened. Try a JPEG, PNG, or another browser-supported image.');
              setCameraState('error');
            }}
          >
          <div className="flex items-center justify-between gap-2">
            {uploadControl}
            <button
              type="button"
              onClick={clearPhoto}
              className="px-3 py-3 text-sm text-slate-400 hover:text-white"
            >
              Start over
            </button>
          </div>
          </CardPhotoRecognition>
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
      {cameraState !== 'captured' && uploadControl}
    </section>
  );
}
