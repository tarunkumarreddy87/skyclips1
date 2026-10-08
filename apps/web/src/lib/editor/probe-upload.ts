/** Read local media metadata before uploading; release the object URL in all paths. */
export async function probeUploadDuration(file: File): Promise<number | undefined> {
  if (!file.type.startsWith("video/") && !file.type.startsWith("audio/")) return undefined;
  const objectUrl = URL.createObjectURL(file);
  const element = document.createElement(file.type.startsWith("video/") ? "video" : "audio");
  element.preload = "metadata";
  try {
    return await new Promise<number>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("Could not read this file's duration. Try an MP4 or WebM video.")), 10_000);
      element.onloadedmetadata = () => {
        window.clearTimeout(timer);
        if (!Number.isFinite(element.duration) || element.duration <= 0) reject(new Error("Media has no readable duration"));
        else resolve(Math.round(element.duration * 1000));
      };
      element.onerror = () => { window.clearTimeout(timer); reject(new Error("This browser cannot read the media file. Try MP4, WebM, MP3 or WAV.")); };
      element.src = objectUrl;
    });
  } finally { element.removeAttribute("src"); element.load(); URL.revokeObjectURL(objectUrl); }
}
