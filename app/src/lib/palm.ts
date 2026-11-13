import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

export type PalmPhoto = { uri: string; base64: string; mime: "image/jpeg" };

/** Longest side sent to the server: enough to see palm lines, small enough to upload quickly. */
const MAX_SIDE = 1280;

/**
 * Lets the person pick or take a palm photo, then shrinks it to a JPEG of at most 1280 px.
 * Returns null if they cancel. The photo stays on the device until it's sent for one reading.
 */
export async function pickPalmPhoto(
  source: "library" | "camera",
): Promise<PalmPhoto | null> {
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted)
      throw new Error(
        "Allow camera access to take a palm photo, or choose one from your photos.",
      );
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: 1,
  };
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];

  const ctx = ImageManipulator.manipulate(asset.uri, {
    maxWidth: MAX_SIDE,
    maxHeight: MAX_SIDE,
  });
  if (asset.width > MAX_SIDE || asset.height > MAX_SIDE) {
    ctx.resize(
      asset.width >= asset.height ? { width: MAX_SIDE } : { height: MAX_SIDE },
    );
  }
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.8,
    base64: true,
  });
  if (!saved.base64)
    throw new Error("That photo couldn’t be read. Please try another.");
  // Some platforms return a data URL; the server wants the bare base64.
  const base64 = saved.base64.replace(/^data:[^,]+,/, "");
  return { uri: saved.uri, base64, mime: "image/jpeg" };
}
