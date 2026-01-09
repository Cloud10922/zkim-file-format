/**
 * Global test teardown
 * Final cleanup - ensures all timers are cleared and instances are cleaned up
 * 
 * Note: Individual tests handle cleanup in afterEach hooks.
 * This teardown is a final safety net to ensure nothing keeps the process alive.
 */

export default async function globalTeardown(): Promise<void> {
  // Clear all singleton instances
  try {
    const { SingletonBase } = await import("../src/utils/singleton-base");
    await SingletonBase.clearInstances();
  } catch {
    // Ignore errors
  }
  
  // Clear all timers as final safety net
  if (typeof jest !== "undefined") {
    try {
      if (jest.clearAllTimers) {
        jest.clearAllTimers();
      }
      if (jest.useRealTimers) {
        jest.useRealTimers();
      }
    } catch {
      // Ignore errors
    }
  }
}

