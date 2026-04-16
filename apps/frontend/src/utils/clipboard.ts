/**
 * Copy plain text to the clipboard with a DOM fallback for legacy browsers.
 * Returns true when the operation succeeds and false otherwise.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === "undefined") {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (typeof document === "undefined") {
      return false;
    }

    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.setAttribute("readonly", "");
      textArea.style.position = "absolute";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      // eslint-disable-next-line sonarjs/deprecation -- Intentional fallback for older browsers
      const succeeded = document.execCommand("copy");
      document.body.removeChild(textArea);
      return succeeded;
    } catch {
      return false;
    }
  }
}
