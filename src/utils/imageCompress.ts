const MAX_DIMENSION = 600;
const MAX_DATA_URL_LENGTH = 220_000;

function encodeCanvasUnderLimit(canvas: HTMLCanvasElement): string {
  const qualities = [0.78, 0.65, 0.52, 0.4, 0.3];
  for (const quality of qualities) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= MAX_DATA_URL_LENGTH) {
      return dataUrl;
    }
  }
  // Final smaller resize fallback if image is unusually dense
  const smallCanvas = document.createElement('canvas');
  const scale = 0.65;
  smallCanvas.width = Math.max(160, Math.round(canvas.width * scale));
  smallCanvas.height = Math.max(160, Math.round(canvas.height * scale));
  const ctx = smallCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize image compression context.');
  }
  ctx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
  return smallCanvas.toDataURL('image/jpeg', 0.45);
}

export function captureVideoFrame(
  video: HTMLVideoElement,
  mirror = false
): string {
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const ratio = Math.min(1, MAX_DIMENSION / Math.max(vw, vh));
  const width = Math.round(vw * ratio);
  const height = Math.round(vh * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to capture frame from camera.');
  }

  if (mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, width, height);
  return encodeCanvasUnderLimit(canvas);
}

export async function compressImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please select a valid image file (JPG, PNG, or WebP).');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read selected image.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read selected image.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Selected file is not a supported image.'));
    element.src = dataUrl;
  });

  const ratio = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * ratio));
  const height = Math.max(1, Math.round(img.height * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to process image.');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  return encodeCanvasUnderLimit(canvas);
}

const MAX_BG_DIMENSION = 1400;
const MAX_BG_DATA_URL_LENGTH = 420_000;

export async function compressJpegBackground(file: File): Promise<string> {
  const isJpeg =
    file.type === 'image/jpeg' || /\.(jpe?g)$/i.test(file.name);
  if (!isJpeg) {
    throw new Error('Please upload a JPEG image (.jpg or .jpeg).');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read selected JPEG file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read selected JPEG file.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Selected file is not a valid JPEG image.'));
    element.src = dataUrl;
  });

  const ratio = Math.min(1, MAX_BG_DIMENSION / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * ratio));
  const height = Math.max(1, Math.round(img.height * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to process background image.');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const qualities = [0.85, 0.74, 0.62, 0.5, 0.38];
  for (const quality of qualities) {
    const encoded = canvas.toDataURL('image/jpeg', quality);
    if (encoded.length <= MAX_BG_DATA_URL_LENGTH) {
      return encoded;
    }
  }

  const fallbackCanvas = document.createElement('canvas');
  fallbackCanvas.width = Math.max(320, Math.round(width * 0.7));
  fallbackCanvas.height = Math.max(320, Math.round(height * 0.7));
  const fbCtx = fallbackCanvas.getContext('2d');
  if (!fbCtx) {
    throw new Error('Unable to resize background image.');
  }
  fbCtx.fillStyle = '#ffffff';
  fbCtx.fillRect(0, 0, fallbackCanvas.width, fallbackCanvas.height);
  fbCtx.drawImage(canvas, 0, 0, fallbackCanvas.width, fallbackCanvas.height);
  return fallbackCanvas.toDataURL('image/jpeg', 0.55);
}

const MAX_LOGO_DIMENSION = 400;
const MAX_LOGO_DATA_URL_LENGTH = 320_000;

export async function compressLogoFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please upload a valid logo image (PNG, JPG, WebP, or SVG).');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read selected logo file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read selected logo file.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Selected file is not a supported logo image.'));
    element.src = dataUrl;
  });

  const sourceW = img.width || 400;
  const sourceH = img.height || 400;
  const ratio = Math.min(1, MAX_LOGO_DIMENSION / Math.max(sourceW, sourceH));
  const width = Math.max(1, Math.round(sourceW * ratio));
  const height = Math.max(1, Math.round(sourceH * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to process logo image.');
  }

  ctx.drawImage(img, 0, 0, width, height);
  const pngUrl = canvas.toDataURL('image/png');
  if (pngUrl.length <= MAX_LOGO_DATA_URL_LENGTH) {
    return pngUrl;
  }

  // Downscale PNG once to retain transparency if original was dense
  const smallerCanvas = document.createElement('canvas');
  smallerCanvas.width = Math.max(64, Math.round(width * 0.65));
  smallerCanvas.height = Math.max(64, Math.round(height * 0.65));
  const sCtx = smallerCanvas.getContext('2d');
  if (!sCtx) {
    throw new Error('Unable to resize logo image.');
  }
  sCtx.drawImage(canvas, 0, 0, smallerCanvas.width, smallerCanvas.height);
  const smallerPng = smallerCanvas.toDataURL('image/png');
  if (smallerPng.length <= MAX_LOGO_DATA_URL_LENGTH) {
    return smallerPng;
  }

  // Final JPEG fallback under size limit
  const jpgCtx = smallerCanvas.getContext('2d');
  if (jpgCtx) {
    jpgCtx.globalCompositeOperation = 'destination-over';
    jpgCtx.fillStyle = '#ffffff';
    jpgCtx.fillRect(0, 0, smallerCanvas.width, smallerCanvas.height);
  }
  return smallerCanvas.toDataURL('image/jpeg', 0.85);
}
