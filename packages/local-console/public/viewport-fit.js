export function calculateViewportFit({
  viewportWidth,
  viewportHeight,
  contentWidth,
  contentHeight,
  desktopMinWidth = 681,
  horizontalGutter = 12,
}) {
  if (viewportWidth < desktopMinWidth) {
    return { enabled: false, scale: 1, renderWidth: null, left: 0 };
  }
  const availableWidth = Math.max(1, viewportWidth - horizontalGutter * 2);
  const scale = Math.min(
    1,
    availableWidth / contentWidth,
    viewportHeight / contentHeight,
  );
  const renderWidth = Math.max(contentWidth, Math.round(availableWidth / scale));
  return {
    enabled: true,
    scale,
    renderWidth,
    left: Math.max(0, Math.round((viewportWidth - renderWidth * scale) / 2)),
  };
}
