import { toast } from "sonner";
import { useEditorStore, endGestureHistory } from "./store";
import { requestMediaUploadUrl, uploadFileToPresignedUrl, removeImageBackground } from "@/lib/api-client";
const pending = new Set<string>();
export async function removeSelectedImageBackground(itemId: string) {
  if (pending.has(itemId)) return;
  const state = useEditorStore.getState();
  const track = state.timeline.tracks.find(t=>t.items.some(i=>i.id===itemId));
  const item = track?.items.find(i=>i.id===itemId);
  if (!item || track?.locked || !("assetId" in item)) return;
  const asset = state.assets.find(a=>a.id===item.assetId);
  if (!asset || asset.mediaType !== "image") { toast.error("Select a still image to remove its background"); return; }
  pending.add(itemId);
  const notice = toast.loading("Removing background… First use downloads the model.");
  try {
    const result = await prepareImageCutout(state.project.id, asset);
    const current=useEditorStore.getState();
    const currentItem=current.timeline.tracks.flatMap(t=>t.items).find(i=>i.id===itemId);
    if (!currentItem || !("assetId" in currentItem) || currentItem.assetId !== asset.id) throw new Error("Image changed while processing. Original selection was left unchanged.");
    current.addAssetFromUrl(result.downloadUrl,itemId,{sourceKey:result.s3Key,label:`${asset.label} · Cutout`});
    endGestureHistory(); toast.success("Background removed",{id:notice});
  } catch(error) { toast.error(error instanceof Error ? error.message : "Background removal failed",{id:notice}); }
  finally {pending.delete(itemId);}
}

export async function prepareImageCutout(projectId: string, asset: {url:string; metadata?:Record<string,string>}) {
    let key = asset.metadata?.sourceKey;
    if (!key?.startsWith(`projects/${projectId}/`)) {
      const response = await fetch(asset.url);
      if (!response.ok) throw new Error("Unable to read this image. Upload the image first.");
      const blob = await response.blob();
      if (!blob.type.startsWith("image/") || blob.size > 20*1024*1024) throw new Error("Use an image smaller than 20 MB");
      const file = new File([blob], "source-image", {type:blob.type});
      const upload = await requestMediaUploadUrl(projectId,file.name,file.type);
      await uploadFileToPresignedUrl(upload.uploadUrl,file); key=upload.s3Key;
    }
    const result = await removeImageBackground(projectId,key);
    return result;
}
