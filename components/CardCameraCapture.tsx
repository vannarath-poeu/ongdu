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

export default function CardCameraCapture({ onUseCards }: { onUseCards: (cards: Card[]) => void }) {
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
    return () => {
      if (capturedImage?.startsWith('blob:')) URL.revokeObjectURL(capturedImage);
    };
  }, [capturedImage]);

  const uploadPhoto = (file: File | undefined) => {
    if (!file) return;

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
    <label className="relative w-full py-3 px-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-400/50 transition-all flex items-center justify-center gap-2 font-medium cursor-pointer focus-within:ring-2 focus-within:ring-indigo-400">
      <span aria-hidden="true">🖼️</span>
      Upload Photo
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
  };

  if (cameraState === 'idle') {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        onClick={openCamera}
        className="w-full py-3 px-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-400/50 transition-all flex items-center justify-center gap-2 font-medium"
      >
        <span aria-hidden="true">📷</span>
        Photograph Your Cards
      </button>
      {uploadControl}
      </div>
    );
  }

  return (
    <section className="bg-slate-800/30 backdrop-blur-sm rounded-xl p-4 border border-indigo-500/30 space-y-3" aria-label="Card photo capture">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-indigo-300">Card Photo</h3>
          <p className="text-xs text-slate-500 mt-0.5">Photograph or upload your hand, detect cards locally, then review the results.</p>
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
          <CardPhotoRecognition key={capturedImage} source={capturedImage} onUseCards={onUseCards}
            onImageError={() => {
              setCapturedImage(null);
              setErrorMessage('This photo could not be opened. Try a JPEG, PNG, or another browser-supported image.');
              setCameraState('error');
            }}
          >
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
      {uploadControl}
    </section>
  );
}
