/** Two animation frames — lets the browser paint skeleton / layout before heavy JS. */
export function deferTwoAnimationFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}
