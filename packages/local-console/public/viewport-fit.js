export function calculateViewportFit({
  viewportWidth,
  viewportHeight,
  contentWidth,
  contentHeight,
  desktopMinWidth = 681,
}) {
  if (viewportWidth < desktopMinWidth) {
    return { enabled: false, scale: 1, left: 0 };
  }
  const scale = Math.min(
    1,
    viewportWidth / contentWidth,
    viewportHeight / contentHeight,
  );
  return {
    enabled: true,
    scale,
    left: Math.max(0, Math.round((viewportWidth - contentWidth * scale) / 2)),
  };
}
