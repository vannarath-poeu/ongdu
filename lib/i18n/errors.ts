import { msg, type Message } from './core';

export const errorMessages = {
  SCANNER_ASSET: msg('scanner.asset'),
  SCANNER_TIMEOUT: msg('scanner.timeout'),
  SCANNER_RUNTIME: msg('scanner.runtime'),
  CAMERA_DENIED: msg('Camera permission was denied. Allow camera access in your browser settings, then try again.'),
  CAMERA_MISSING: msg('No camera was found on this device.'),
  CAMERA_BUSY: msg('The camera is already in use or could not be started.'),
  CAMERA_OPEN: msg('The camera could not be opened. Check your browser permissions and try again.'),
  CAMERA_UNSUPPORTED: msg('Camera access is not supported by this browser. Try a current browser on a secure connection.'),
  CAMERA_LOADING: msg('The camera is still loading. Wait a moment and try again.'),
  PHOTO_TYPE: msg('Please choose an image from your photo library.'),
  PHOTO_CAPTURE: msg('The photo could not be captured. Please try again.'),
  PHOTO_OPEN: msg('This photo could not be opened. Try a JPEG, PNG, or another browser-supported image.'),
  PHOTO_TIMEOUT: msg('This is taking longer than expected. Check your connection and try again.'),
  PHOTO_READ: msg('We couldn’t read this photo. Try a closer, sharper shot with every rank and suit visible.'),
  ANALYSIS_FAILED: msg('error.analysis'),
  HAND_SIZE: msg('error.handSize'),
  FEEDBACK_UNAVAILABLE: msg('error.unavailable'),
  FEEDBACK_FAILED: msg('Failed to submit feedback. Please try again.'),
} satisfies Record<string, Message>;
export type UIErrorCode = keyof typeof errorMessages;

export class UIError extends Error {
  constructor(public readonly code: UIErrorCode, options?: ErrorOptions) {
    super(code, options);
    this.name = 'UIError';
  }
}
